/**
 * Everything the roles, positions and access pages render, one RPC per page.
 */
import { GOVERNING_UNIT_SQL, requirePermission } from "../authz";
import type { Ctx } from "../context";
import { nowIso } from "../db";
import { NotFoundError } from "../errors";

export interface ScopeOptions {
  categories: Array<{ value: string; label: string }>;
  committees: Array<{ value: string; label: string }>;
  positions: Array<{ value: string; label: string }>;
  events: Array<{ value: string; label: string }>;
}

/** Real choices for scoped grants, so nobody types slugs or ids by hand. */
export async function scopeOptions(ctx: Ctx): Promise<ScopeOptions> {
  const [cats, coms, pos, evs] = (await ctx.db.batchAll([
    ctx.db.stmt("SELECT DISTINCT slug, name, kind FROM categories ORDER BY name"),
    ctx.db.stmt("SELECT id, name, status FROM committees WHERE deleted_at IS NULL ORDER BY COALESCE(start_date, created_at) DESC"),
    ctx.db.stmt("SELECT key, name FROM positions WHERE deleted_at IS NULL AND is_active = 1 ORDER BY governance_level DESC, rank, name"),
    ctx.db.stmt("SELECT id, title, substr(start_at, 1, 10) AS day FROM events WHERE deleted_at IS NULL ORDER BY start_at DESC LIMIT 60"),
  ])) as Array<{ results?: Record<string, string>[] }>;
  const seen = new Set<string>();
  return {
    categories: (cats.results ?? []).filter((c) => !seen.has(c.slug) && seen.add(c.slug)).map((c) => ({ value: c.slug, label: c.name })),
    committees: (coms.results ?? []).map((c) => ({ value: c.id, label: `${c.name}${c.status === "CURRENT" ? " (current)" : ""}` })),
    positions: (pos.results ?? []).map((p) => ({ value: p.key, label: p.name })),
    events: [{ value: "ASSIGNED", label: "Events they're assigned to" }, ...(evs.results ?? []).map((e) => ({ value: e.id, label: `${e.title}${e.day ? ` (${e.day})` : ""}` }))],
  };
}

async function permissionList(ctx: Ctx) {
  return ctx.db.all<{ key: string; description: string | null; is_sensitive: number }>("SELECT key, description, is_sensitive FROM permissions WHERE key <> '*' ORDER BY key");
}

async function holderOptions(ctx: Ctx) {
  const [roles, positions] = await Promise.all([
    ctx.db.all<{ id: string; name: string }>("SELECT id, name FROM roles WHERE deleted_at IS NULL AND key <> 'moderator' ORDER BY rank"),
    ctx.db.all<{ id: string; name: string }>("SELECT id, name FROM positions WHERE deleted_at IS NULL ORDER BY governance_level DESC, rank, name"),
  ]);
  return [...roles.map((r) => ({ value: `role:${r.id}`, label: `Role: ${r.name}` })), ...positions.map((p) => ({ value: `position:${p.id}`, label: `Position: ${p.name}` }))];
}

export async function rolesOverview(ctx: Ctx) {
  requirePermission(ctx, "roles.read");
  const now = nowIso();
  return ctx.db.all<{ id: string; key: string; name: string; description: string | null; color: string | null; is_protected: number; max_holders: number | null;
    holders: number; permissions: number; sensitive: number }>(
    `SELECT r.id, r.key, r.name, r.description, r.color, r.is_protected, r.max_holders,
            (SELECT COUNT(*) FROM user_roles ur JOIN users u ON u.id = ur.user_id AND u.deleted_at IS NULL
              WHERE ur.role_id = r.id AND ur.revoked_at IS NULL AND (ur.expires_at IS NULL OR ur.expires_at > ?1)) AS holders,
            (SELECT COUNT(*) FROM role_permissions rp WHERE rp.role_id = r.id) AS permissions,
            (SELECT COUNT(*) FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id AND p.is_sensitive = 1 WHERE rp.role_id = r.id) AS sensitive
     FROM roles r WHERE r.deleted_at IS NULL ORDER BY r.rank, r.name`, now);
}

export async function roleDetail(ctx: Ctx, roleId: string) {
  requirePermission(ctx, "roles.read");
  const now = nowIso();
  const role = await ctx.db.first<{ id: string; key: string; name: string; description: string | null; color: string | null; is_protected: number; max_holders: number | null; updated_at: string }>(
    "SELECT id, key, name, description, color, is_protected, max_holders, updated_at FROM roles WHERE id = ?1 AND deleted_at IS NULL", roleId);
  if (!role) throw new NotFoundError("Role");
  const [grants, holders, permissions, options, sources] = await Promise.all([
    ctx.db.all<{ permission: string; scope: string; scope_value: string }>(
      "SELECT p.key AS permission, rp.scope, rp.scope_value FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id WHERE rp.role_id = ?1 ORDER BY p.key", roleId),
    ctx.db.all<{ id: string; user_id: string; email: string; name: string | null; granted_at: string; expires_at: string | null; reason: string | null }>(
      `SELECT ur.id, ur.user_id, u.email, p.full_name AS name, ur.granted_at, ur.expires_at, ur.reason FROM user_roles ur
       JOIN users u ON u.id = ur.user_id AND u.deleted_at IS NULL LEFT JOIN profiles p ON p.user_id = u.id AND p.deleted_at IS NULL
       WHERE ur.role_id = ?1 AND ur.revoked_at IS NULL AND (ur.expires_at IS NULL OR ur.expires_at > ?2) ORDER BY ur.granted_at`, roleId, now),
    permissionList(ctx),
    scopeOptions(ctx),
    holderOptions(ctx),
  ]);
  return { role, grants, holders, permissions, options, sources: sources.filter((o) => o.value !== `role:${roleId}`) };
}

function parseAliases(json: string | null): string[] {
  try {
    return (JSON.parse(json ?? "{}") as { aliases?: string[] }).aliases ?? [];
  } catch {
    return [];
  }
}

const POSITION_COLS = `p.id, p.key, p.name, p.description, p.category, p.rank, p.governance_level, p.parent_id, p.is_active, p.is_protected, p.max_holders, p.aliases_json, p.updated_at`;
type PositionRow = { id: string; key: string; name: string; description: string | null; category: string; rank: number; governance_level: number; parent_id: string | null;
  is_active: number; is_protected: number; max_holders: number | null; aliases_json: string | null; updated_at: string };

/** The positions list: level, current GUCC holders and how many permissions each carries. */
export async function positionsOverview(ctx: Ctx) {
  requirePermission(ctx, "positions.read");
  const rows = await ctx.db.all<PositionRow & { holders: number; permissions: number; parent_name: string | null }>(
    `SELECT ${POSITION_COLS}, pa.name AS parent_name,
            (SELECT COUNT(*) FROM committee_members cm JOIN committees c ON c.id = cm.committee_id AND c.status = 'CURRENT' AND c.deleted_at IS NULL
              WHERE cm.position_id = p.id AND cm.deleted_at IS NULL AND cm.is_active = 1 AND ${GOVERNING_UNIT_SQL}) AS holders,
            (SELECT COUNT(*) FROM position_permissions pp WHERE pp.position_id = p.id) AS permissions
     FROM positions p LEFT JOIN positions pa ON pa.id = p.parent_id
     WHERE p.deleted_at IS NULL ORDER BY p.governance_level DESC, p.rank, p.name`);
  return rows.map((p) => ({ ...p, aliases: parseAliases(p.aliases_json) }));
}

/** One position: its holders (GUCC and affiliated units), permissions and edit options. */
export async function positionDetail(ctx: Ctx, positionId: string) {
  requirePermission(ctx, "positions.read");
  const p = await ctx.db.first<PositionRow>(`SELECT ${POSITION_COLS} FROM positions p WHERE p.id = ?1 AND p.deleted_at IS NULL`, positionId);
  if (!p) throw new NotFoundError("Position");
  const [grants, holders, permissions, options, sources, parents] = await Promise.all([
    ctx.db.all<{ permission: string; scope: string; scope_value: string }>(
      "SELECT pm.key AS permission, pp.scope, pp.scope_value FROM position_permissions pp JOIN permissions pm ON pm.id = pp.permission_id WHERE pp.position_id = ?1 ORDER BY pm.key", positionId),
    ctx.db.all<{ profile_id: string; name: string; user_id: string | null; title: string; unit_key: string | null; governing: number }>(
      `SELECT pr.id AS profile_id, pr.full_name AS name, pr.user_id, cm.position_title AS title, cm.unit_key, CASE WHEN ${GOVERNING_UNIT_SQL} THEN 1 ELSE 0 END AS governing
       FROM committee_members cm JOIN committees c ON c.id = cm.committee_id AND c.status = 'CURRENT' AND c.deleted_at IS NULL
       JOIN profiles pr ON pr.id = cm.profile_id WHERE cm.position_id = ?1 AND cm.deleted_at IS NULL AND cm.is_active = 1 ORDER BY governing DESC, cm.display_order`, positionId),
    permissionList(ctx),
    scopeOptions(ctx),
    holderOptions(ctx),
    ctx.db.all<{ id: string; name: string }>("SELECT id, name FROM positions WHERE deleted_at IS NULL AND id <> ?1 ORDER BY governance_level DESC, rank, name", positionId),
  ]);
  return { position: { ...p, aliases: parseAliases(p.aliases_json) }, grants, holders, permissions, options, sources: sources.filter((o) => o.value !== `position:${positionId}`), parents };
}

/** What the "new position" form needs. */
export async function positionFormOptions(ctx: Ctx) {
  requirePermission(ctx, "positions.create");
  const [parents, sources] = await Promise.all([
    ctx.db.all<{ id: string; name: string }>("SELECT id, name FROM positions WHERE deleted_at IS NULL ORDER BY governance_level DESC, rank, name"),
    holderOptions(ctx),
  ]);
  return { parents, sources };
}
