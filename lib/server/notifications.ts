/**
 * Notifications. In-app delivery is a row in `notifications`; other channels
 * plug in through `channels` without touching the callers, so business logic
 * never depends on a specific provider.
 */
import type { Ctx } from "./context";
import { newId, nowIso, type D1StatementLike } from "./db";
import { GOVERNING_UNIT_SQL } from "./authz";
import { MODERATOR_EQUAL_POSITIONS } from "../governance/engine";
import { emit } from "./live";

export interface NotificationInput {
  type: string;
  title: string;
  body?: string;
  link?: string;
  resourceType?: string;
  resourceId?: string;
}

export interface NotificationChannel {
  name: string;
  deliver(ctx: Ctx, userIds: string[], n: NotificationInput): Promise<void>;
}

/** Extra channels (email digests, push) register here. In-app is always on. */
export const channels: NotificationChannel[] = [];

/** Who caused a notification: the signed-in person making the request (none for scheduled jobs). */
const actorOf = (ctx: Ctx) => ctx.actor?.user.id ?? null;

/** One statement however many recipients: D1 counts statements per Worker invocation. */
export function notifyStmts(ctx: Ctx, userIds: string[], n: NotificationInput): D1StatementLike[] {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return [];
  // Ids are made here so the request knows exactly which rows it wrote: after it succeeds, those
  // (and only those that exist) are emailed to people who want them.
  const rows = unique.map((u) => ({ id: newId("ntf"), u }));
  ctx.outbox?.push(...rows.map((r) => r.id));
  // Open tabs show it at once. One event per person keeps each one's id (for "mark read").
  for (const r of rows) emit(ctx, [r.u], { t: "ntf", n: { id: r.id, type: n.type, title: n.title.slice(0, 200), body: n.body?.slice(0, 300) ?? null, link: n.link ?? null } });
  return [
    ctx.db.stmt(
      `INSERT INTO notifications (id, user_id, type, title, body, link, resource_type, resource_id, channel, created_at, actor_user_id)
       SELECT json_extract(j.value, '$.id'), json_extract(j.value, '$.u'), ?2, ?3, ?4, ?5, ?6, ?7, 'IN_APP', ?8, ?9 FROM json_each(?1) AS j`,
      JSON.stringify(rows), n.type, n.title.slice(0, 200), n.body?.slice(0, 2000) ?? null, n.link ?? null, n.resourceType ?? null, n.resourceId ?? null, nowIso(),
      actorOf(ctx),
    ),
  ];
}

/** Different notifications for different people, still in one statement. */
export function notifyEachStmts(ctx: Ctx, items: Array<NotificationInput & { userId: string }>): D1StatementLike[] {
  const list = items.filter((i) => i.userId).map((n) => ({ ...n, id: newId("ntf") }));
  if (list.length === 0) return [];
  ctx.outbox?.push(...list.map((n) => n.id));
  for (const n of list) emit(ctx, [n.userId], { t: "ntf", n: { id: n.id, type: n.type, title: n.title.slice(0, 200), body: n.body?.slice(0, 300) ?? null, link: n.link ?? null } });
  return [
    ctx.db.stmt(
      `INSERT INTO notifications (id, user_id, type, title, body, link, resource_type, resource_id, channel, created_at, actor_user_id)
       SELECT json_extract(j.value, '$.id'), json_extract(j.value, '$.u'), json_extract(j.value, '$.t'), json_extract(j.value, '$.ti'),
              json_extract(j.value, '$.b'), json_extract(j.value, '$.l'), json_extract(j.value, '$.rt'), json_extract(j.value, '$.ri'), 'IN_APP', ?2, ?3
       FROM json_each(?1) AS j`,
      JSON.stringify(list.map((n) => ({ id: n.id, u: n.userId, t: n.type, ti: n.title.slice(0, 200), b: n.body?.slice(0, 2000) ?? null, l: n.link ?? null, rt: n.resourceType ?? null, ri: n.resourceId ?? null }))),
      nowIso(), actorOf(ctx),
    ),
  ];
}

export async function notify(ctx: Ctx, userIds: string[], n: NotificationInput): Promise<void> {
  await ctx.db.batch(notifyStmts(ctx, userIds, n));
  for (const ch of channels) {
    try {
      await ch.deliver(ctx, userIds, n);
    } catch (e) {
      console.error(`[${ctx.meta.requestId}] notification channel ${ch.name} failed`, e);
    }
  }
}

/** Active users holding any of the given roles or current-committee positions. */
export async function usersWith(ctx: Ctx, opts: { roles?: string[]; positions?: string[] }): Promise<string[]> {
  const ids = new Set<string>();
  // "The Moderators" include the President and the General Secretary, who have the same authority.
  if (opts.roles?.includes("moderator")) opts = { ...opts, positions: [...new Set([...(opts.positions ?? []), ...MODERATOR_EQUAL_POSITIONS])] };
  if (opts.roles?.length) {
    const ph = opts.roles.map((_, i) => `?${i + 1}`).join(",");
    const rows = await ctx.db.all<{ user_id: string }>(
      `SELECT DISTINCT ur.user_id FROM user_roles ur JOIN roles r ON r.id = ur.role_id JOIN users u ON u.id = ur.user_id
       WHERE ur.revoked_at IS NULL AND (ur.expires_at IS NULL OR ur.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')) AND u.status = 'ACTIVE' AND u.deleted_at IS NULL AND r.key IN (${ph})`,
      ...opts.roles,
    );
    rows.forEach((r) => ids.add(r.user_id));
  }
  if (opts.positions?.length) {
    const ph = opts.positions.map((_, i) => `?${i + 1}`).join(",");
    const rows = await ctx.db.all<{ user_id: string }>(
      `SELECT DISTINCT pr.user_id FROM committee_members cm
       JOIN profiles pr ON pr.id = cm.profile_id AND pr.user_id IS NOT NULL
       JOIN users u ON u.id = pr.user_id AND u.status = 'ACTIVE'
       JOIN committees c ON c.id = cm.committee_id AND c.status = 'CURRENT'
       JOIN positions p ON p.id = cm.position_id AND p.is_active = 1 AND p.deleted_at IS NULL
       WHERE cm.deleted_at IS NULL AND cm.is_active = 1 AND p.key IN (${ph}) AND ${GOVERNING_UNIT_SQL}`,
      ...opts.positions,
    );
    rows.forEach((r) => ids.add(r.user_id));
  }
  return [...ids];
}

/**
 * Active users who hold a permission club-wide (scope ALL), through a role or
 * a position in the current committee. Moderators hold "*". Used to decide
 * who hears about work waiting for them, so changing a position's grants in
 * the admin also changes who is notified — nothing names a position here.
 */
export async function usersWithPermission(ctx: Ctx, permission: string): Promise<string[]> {
  const rows = await ctx.db.all<{ user_id: string }>(
    `SELECT DISTINCT ur.user_id FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id AND r.deleted_at IS NULL
       JOIN role_permissions rp ON rp.role_id = r.id AND rp.scope = 'ALL'
       JOIN permissions pm ON pm.id = rp.permission_id AND pm.key IN (?1, '*')
       JOIN users u ON u.id = ur.user_id AND u.status = 'ACTIVE' AND u.deleted_at IS NULL
      WHERE ur.revoked_at IS NULL AND (ur.expires_at IS NULL OR ur.expires_at > ?2)
     UNION
     SELECT DISTINCT pr.user_id FROM committee_members cm
       JOIN profiles pr ON pr.id = cm.profile_id AND pr.user_id IS NOT NULL AND pr.deleted_at IS NULL
       JOIN users u ON u.id = pr.user_id AND u.status = 'ACTIVE' AND u.deleted_at IS NULL
       JOIN committees c ON c.id = cm.committee_id AND c.status = 'CURRENT' AND c.deleted_at IS NULL
       JOIN positions p ON p.id = cm.position_id AND p.is_active = 1 AND p.deleted_at IS NULL
       JOIN position_permissions pp ON pp.position_id = p.id AND pp.scope = 'ALL'
       JOIN permissions pm ON pm.id = pp.permission_id AND pm.key = ?1
      WHERE cm.deleted_at IS NULL AND cm.is_active = 1 AND (cm.end_date IS NULL OR cm.end_date >= date('now')) AND ${GOVERNING_UNIT_SQL}
     UNION
     SELECT DISTINCT up.user_id FROM user_permissions up
       JOIN permissions pm ON pm.id = up.permission_id AND pm.key = ?1
       JOIN users u ON u.id = up.user_id AND u.status = 'ACTIVE' AND u.deleted_at IS NULL
      WHERE up.scope = 'ALL' AND up.revoked_at IS NULL AND (up.expires_at IS NULL OR up.expires_at > ?2)`,
    permission,
    nowIso(),
  );
  return rows.map((r) => r.user_id);
}
