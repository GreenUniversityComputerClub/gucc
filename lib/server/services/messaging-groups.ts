/**
 * Group conversations. Any approved member can start one (chat.groups.create, three a day) with
 * people who accept messages from them, up to `chat.max_group_members` people.
 *
 * Roles: the person who created it is the OWNER; the owner makes members ADMINs (and hands over
 * ownership). The owner, admins and members who hold chat.groups.manage (by default the six senior
 * positions; Moderators hold everything) change its name, description and photo and add or
 * remove members; only the owner and those leaders remove admins, change roles or delete the
 * group. An admin may step down. Anyone can leave; when the owner leaves, the longest-standing
 * admin (else member) becomes the owner.
 *
 * Every change is one batch with a system line in the conversation ("Rafi added Nusrat") and an
 * audit row, and the members' open tabs refresh at once.
 */
import { isClubExecutive } from "../../governance/engine";
import { limit } from "../limits";
import { auditStmt } from "../audit";
import { can, requireActor, requirePermission } from "../authz";
import type { Ctx } from "../context";
import { newId, nowIso } from "../db";
import { ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { emit } from "../live";
import { notifyStmts } from "../notifications";
import { getSetting } from "../security";
import { reachableSql, requireSender, systemMessageStatements } from "./messaging";

const cleanName = (raw: unknown): string => {
  const name = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!name) throw new ValidationError("Give the group a name.", { name: "Give the group a name." });
  if (name.length > 80) throw new ValidationError("Keep the name under 80 characters.", { name: "Too long." });
  return name;
};

const cleanDescription = (raw: unknown): string | null => {
  const d = String(raw ?? "").replace(/\r\n/g, "\n").trim();
  if (d.length > 500) throw new ValidationError("Keep the description under 500 characters.", { description: "Too long." });
  return d || null;
};

const ids = (raw: unknown): string[] =>
  [...new Set((Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : []).map((x) => String(x).trim()).filter((x) => x && x.length <= 80))];

/** People the actor may add: active, accepting messages from them, no block either way. */
async function addable(ctx: Ctx, userIds: string[]): Promise<Array<{ id: string; name: string }>> {
  const actor = requireActor(ctx);
  if (!userIds.length) return [];
  return ctx.db.all<{ id: string; name: string }>(
    `SELECT u.id, COALESCE(p.full_name, 'Member') AS name FROM users u LEFT JOIN profiles p ON p.user_id = u.id AND p.deleted_at IS NULL
     WHERE u.id IN (SELECT value FROM json_each(?3)) AND ${reachableSql("u", "?1", "?2")}`,
    actor.user.id, isClubExecutive(actor.subject) ? 1 : 0, JSON.stringify(userIds));
}

/** A public, ready image (an identical upload may be shared with an earlier one, so not necessarily the actor's). */
async function checkPhoto(ctx: Ctx, mediaId: unknown): Promise<string | null> {
  if (mediaId === null || mediaId === undefined || mediaId === "") return null;
  const ok = await ctx.db.first("SELECT 1 FROM media WHERE id = ?1 AND media_type = 'IMAGE' AND visibility = 'PUBLIC' AND status = 'READY' AND deleted_at IS NULL", String(mediaId));
  if (!ok) throw new ValidationError("That photo isn't available. Upload it again.", { photo: "Upload the photo again." });
  return String(mediaId);
}

/** "Anika", "Anika and Babul", "Anika, Babul and Priya", "Anika, Babul and 5 others". */
const list = (names: string[]) => (names.length <= 3 ? names.join(", ").replace(/, ([^,]*)$/, " and $1") : `${names.slice(0, 2).join(", ")} and ${names.length - 2} others`);

export async function createGroup(ctx: Ctx, input: { name?: unknown; description?: unknown; memberIds?: unknown; photoMediaId?: unknown }): Promise<{ conversationId: string }> {
  const actor = await requireSender(ctx);
  requirePermission(ctx, "chat.groups.create");
  const name = cleanName(input.name);
  const description = cleanDescription(input.description);
  const wanted = ids(input.memberIds).filter((id) => id !== actor.user.id);
  const max = await getSetting(ctx, "chat.max_group_members", 50);
  if (wanted.length < 2) throw new ValidationError("Choose at least two people for a group. For one person, start a conversation instead.", { memberIds: "Choose at least two people." });
  if (wanted.length + 1 > max) throw new ValidationError(`A group can have up to ${max} people, you included.`, { memberIds: `At most ${max - 1} people.` });
  const people = await addable(ctx, wanted);
  if (people.length !== wanted.length) {
    throw new ValidationError(`${wanted.length - people.length === 1 ? "One person" : `${wanted.length - people.length} people`} can't be added: they don't accept messages from you. Remove them and try again.`, { memberIds: "Some people can't be added." });
  }
  const photo = await checkPhoto(ctx, input.photoMediaId);
  await limit(ctx, "chat.newGroup", actor.user.id);
  const id = newId("cnv");
  const now = nowIso();
  const me = actor.profile?.full_name ?? "A member";
  const sys = systemMessageStatements(ctx, id, `${me} created the group “${name}” with ${list(people.map((p) => p.name))}.`, now);
  await ctx.db.batch([
    ctx.db.stmt("INSERT INTO conversations (id, kind, pair_key, created_by, created_at) VALUES (?1, 'DIRECT', ?2, ?3, ?4)", id, `group:${id}`, actor.user.id, now),
    ctx.db.stmt("INSERT INTO chat_groups (conversation_id, name, description, photo_media_id, created_by, created_at, updated_at, updated_by) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6, ?5)",
      id, name, description, photo, actor.user.id, now),
    ctx.db.stmt(`INSERT INTO conversation_members (conversation_id, user_id, role, joined_at, added_by, last_read_at)
                 SELECT ?1, value, CASE WHEN value = ?2 THEN 'OWNER' ELSE 'MEMBER' END, ?3, ?2, CASE WHEN value = ?2 THEN ?3 END FROM json_each(?4)`,
      id, actor.user.id, now, JSON.stringify([actor.user.id, ...people.map((p) => p.id)])),
    ...sys.stmts,
    ...notifyStmts(ctx, people.map((p) => p.id), { type: "message.received", title: `${me} added you to “${name}”`, link: `/dashboard/chat/${id}`, resourceType: "conversation", resourceId: id }),
    auditStmt(ctx, { action: "chat.group.create", resourceType: "conversation", resourceId: id, after: { name, members: people.length + 1 } }),
  ]);
  emit(ctx, [actor.user.id, ...people.map((p) => p.id)], { t: "conv", c: id });
  return { conversationId: id };
}

export type GroupRole = "OWNER" | "ADMIN" | "MEMBER";

/** A member's role from its two columns: role (OWNER, MEMBER) and is_admin (migration 0014). */
export const groupRoleSql = (alias: string) => `CASE WHEN ${alias}.role = 'OWNER' THEN 'OWNER' WHEN ${alias}.is_admin = 1 THEN 'ADMIN' ELSE 'MEMBER' END`;

interface GroupAccess {
  name: string;
  owner: string | null;
  role: GroupRole;
  members: string[];
  roles: Record<string, GroupRole>;
  count: number;
  /** Owner, admin or a club leader: change the details, add and remove members. */
  canManage: boolean;
  /** Owner or a club leader: change roles, remove admins, delete the group. */
  canGovern: boolean;
}

/** The group and my place in it; `manage` requires the owner, an admin or chat.groups.manage. */
async function groupAccess(ctx: Ctx, conversationId: string, manage: boolean): Promise<GroupAccess> {
  const actor = requireActor(ctx);
  const g = await ctx.db.first<{ name: string; role: GroupRole; members: string }>(
    `SELECT g.name, ${groupRoleSql("me")} AS role,
            (SELECT json_group_object(x.user_id, ${groupRoleSql("x")}) FROM conversation_members x WHERE x.conversation_id = g.conversation_id AND x.left_at IS NULL) AS members
     FROM chat_groups g JOIN conversation_members me ON me.conversation_id = g.conversation_id AND me.user_id = ?2 AND me.left_at IS NULL
     WHERE g.conversation_id = ?1 AND g.deleted_at IS NULL`, conversationId, actor.user.id);
  if (!g) throw new NotFoundError("Group");
  const roles = JSON.parse(g.members) as Record<string, GroupRole>;
  const members = Object.keys(roles);
  const owner = members.find((id) => roles[id] === "OWNER") ?? null;
  const leader = can(ctx, "chat.groups.manage");
  const canGovern = g.role === "OWNER" || leader;
  const canManage = canGovern || g.role === "ADMIN";
  if (manage && !canManage) throw new ForbiddenError("Only the group's owner, its admins and the club's senior leaders can change this group.");
  return { name: g.name, owner, role: g.role, members, roles, count: members.length, canManage, canGovern };
}

const nameOf = async (ctx: Ctx, userId: string) =>
  (await ctx.db.value<string>("SELECT COALESCE(full_name, 'Member') FROM profiles WHERE user_id = ?1 AND deleted_at IS NULL", userId)) ?? "A member";

/**
 * Make a member an admin, or an admin a member again. The owner (and club leaders) do both; an
 * admin may also make members admins, and step down themselves.
 */
export async function setGroupRole(ctx: Ctx, conversationId: string, userId: string, rawRole: unknown): Promise<void> {
  const actor = await requireSender(ctx);
  const role = rawRole === "ADMIN" ? "ADMIN" : rawRole === "MEMBER" ? "MEMBER" : null;
  if (!role) throw new ValidationError("Choose admin or member.");
  const g = await groupAccess(ctx, conversationId, true);
  const current = g.roles[userId];
  if (!current) throw new NotFoundError("Member");
  if (current === "OWNER") throw new ForbiddenError("The owner's role can't be changed. The owner can hand the group over to someone else.");
  if (current === role) return;
  const stepDown = role === "MEMBER" && userId === actor.user.id;
  if (role === "MEMBER" && !g.canGovern && !stepDown) throw new ForbiddenError("Only the group's owner can remove an admin.");
  await limit(ctx, "chat.groupEdit", actor.user.id);
  const me = actor.profile?.full_name ?? "A member";
  const who = await nameOf(ctx, userId);
  const text = stepDown ? `${me} is no longer an admin.` : role === "ADMIN" ? `${me} made ${who} an admin.` : `${me} removed ${who} as an admin.`;
  const now = nowIso();
  const sys = systemMessageStatements(ctx, conversationId, text, now);
  await ctx.db.batch([
    ctx.db.stmt("UPDATE conversation_members SET is_admin = ?3 WHERE conversation_id = ?1 AND user_id = ?2 AND left_at IS NULL AND role <> 'OWNER'", conversationId, userId, role === "ADMIN" ? 1 : 0),
    ...sys.stmts,
    auditStmt(ctx, { action: "chat.group.role", resourceType: "conversation", resourceId: conversationId, after: { userId, role } }),
  ]);
  emit(ctx, g.members, { t: "conv", c: conversationId });
}

/** The owner hands the group over; they stay on as an admin. */
export async function transferGroup(ctx: Ctx, conversationId: string, userId: string): Promise<void> {
  const actor = await requireSender(ctx);
  const g = await groupAccess(ctx, conversationId, true);
  if (!g.canGovern) throw new ForbiddenError("Only the group's owner can hand it over.");
  if (!g.roles[userId]) throw new NotFoundError("Member");
  if (g.roles[userId] === "OWNER") return;
  await limit(ctx, "chat.groupEdit", actor.user.id);
  const who = await nameOf(ctx, userId);
  const now = nowIso();
  const sys = systemMessageStatements(ctx, conversationId, `${actor.profile?.full_name ?? "A member"} made ${who} the group's owner.`, now);
  await ctx.db.batch([
    ctx.db.stmt("UPDATE conversation_members SET role = 'MEMBER', is_admin = 1 WHERE conversation_id = ?1 AND role = 'OWNER' AND left_at IS NULL", conversationId),
    ctx.db.stmt("UPDATE conversation_members SET role = 'OWNER', is_admin = 0 WHERE conversation_id = ?1 AND user_id = ?2 AND left_at IS NULL", conversationId, userId),
    ...sys.stmts,
    auditStmt(ctx, { action: "chat.group.transfer", resourceType: "conversation", resourceId: conversationId, before: { owner: g.owner }, after: { owner: userId } }),
  ]);
  emit(ctx, g.members, { t: "conv", c: conversationId });
}

/** Rename the group, change its description or photo (null removes the photo). */
export async function updateGroup(ctx: Ctx, conversationId: string, input: { name?: unknown; description?: unknown; photoMediaId?: unknown }): Promise<void> {
  const actor = await requireSender(ctx);
  const g = await groupAccess(ctx, conversationId, true);
  const name = input.name === undefined ? null : cleanName(input.name);
  const description = input.description === undefined ? undefined : cleanDescription(input.description);
  const photoChange = input.photoMediaId !== undefined;
  const photo = photoChange ? await checkPhoto(ctx, input.photoMediaId) : null;
  if (!name && description === undefined && !photoChange) throw new ValidationError("Nothing to change.");
  await limit(ctx, "chat.groupEdit", actor.user.id);
  const me = actor.profile?.full_name ?? "A member";
  const said = [
    name && name !== g.name ? `renamed the group to “${name}”` : null,
    photoChange ? (photo ? "changed the group photo" : "removed the group photo") : null,
    description !== undefined ? "updated the description" : null,
  ].filter(Boolean) as string[];
  const now = nowIso();
  const sys = said.length ? systemMessageStatements(ctx, conversationId, `${me} ${list(said)}.`, now) : { stmts: [] };
  await ctx.db.batch([
    ctx.db.stmt(`UPDATE chat_groups SET name = COALESCE(?2, name), description = CASE WHEN ?3 = 1 THEN ?4 ELSE description END,
                   photo_media_id = CASE WHEN ?5 = 1 THEN ?6 ELSE photo_media_id END, updated_at = ?7, updated_by = ?8 WHERE conversation_id = ?1`,
      conversationId, name, description === undefined ? 0 : 1, description ?? null, photoChange ? 1 : 0, photo, now, actor.user.id),
    ...sys.stmts,
    auditStmt(ctx, { action: "chat.group.update", resourceType: "conversation", resourceId: conversationId, before: { name: g.name }, after: { name: name ?? g.name, photo: photoChange ? photo : undefined } }),
  ]);
  emit(ctx, g.members, { t: "conv", c: conversationId });
}

/** Add people (who accept messages from the actor), within the group's size limit. */
export async function addGroupMembers(ctx: Ctx, conversationId: string, rawIds: unknown): Promise<{ added: number }> {
  const actor = await requireSender(ctx);
  const g = await groupAccess(ctx, conversationId, true);
  const wanted = ids(rawIds).filter((id) => !g.members.includes(id));
  if (!wanted.length) throw new ValidationError("Choose people who aren't in the group yet.", { memberIds: "Choose someone." });
  const max = await getSetting(ctx, "chat.max_group_members", 50);
  if (g.count + wanted.length > max) throw new ValidationError(`A group can have up to ${max} people; there's room for ${Math.max(0, max - g.count)} more.`, { memberIds: "Too many people." });
  const people = await addable(ctx, wanted);
  if (!people.length) throw new ValidationError("None of them accept messages from you.", { memberIds: "They can't be added." });
  await limit(ctx, "chat.groupEdit", actor.user.id);
  const now = nowIso();
  const me = actor.profile?.full_name ?? "A member";
  const sys = systemMessageStatements(ctx, conversationId, `${me} added ${list(people.map((p) => p.name))}.`, now);
  await ctx.db.batch([
    // People who were in the group before come back (their old messages are still theirs).
    ctx.db.stmt(`INSERT INTO conversation_members (conversation_id, user_id, role, joined_at, added_by, last_read_at)
                 SELECT ?1, value, 'MEMBER', ?2, ?3, NULL FROM json_each(?4) WHERE 1
                 ON CONFLICT(conversation_id, user_id) DO UPDATE SET left_at = NULL, archived_at = NULL, role = 'MEMBER', is_admin = 0, joined_at = excluded.joined_at, added_by = excluded.added_by`,
      conversationId, now, actor.user.id, JSON.stringify(people.map((p) => p.id))),
    ...sys.stmts,
    ...notifyStmts(ctx, people.map((p) => p.id), { type: "message.received", title: `${me} added you to “${g.name}”`, link: `/dashboard/chat/${conversationId}`, resourceType: "conversation", resourceId: conversationId }),
    auditStmt(ctx, { action: "chat.group.add", resourceType: "conversation", resourceId: conversationId, after: { added: people.map((p) => p.id) } }),
  ]);
  emit(ctx, [...g.members, ...people.map((p) => p.id)], { t: "conv", c: conversationId });
  return { added: people.length };
}

/** Remove someone. The owner can't be removed by others. */
export async function removeGroupMember(ctx: Ctx, conversationId: string, userId: string): Promise<void> {
  const actor = await requireSender(ctx);
  if (userId === actor.user.id) return leaveGroup(ctx, conversationId);
  const g = await groupAccess(ctx, conversationId, true);
  if (!g.members.includes(userId)) throw new NotFoundError("Member");
  if (userId === g.owner) throw new ForbiddenError("The group's owner can't be removed. They can leave, or you can delete the group.");
  if (g.roles[userId] === "ADMIN" && !g.canGovern) throw new ForbiddenError("Only the group's owner can remove an admin.");
  await limit(ctx, "chat.groupEdit", actor.user.id);
  const who = await nameOf(ctx, userId);
  const now = nowIso();
  const sys = systemMessageStatements(ctx, conversationId, `${actor.profile?.full_name ?? "A member"} removed ${who}.`, now);
  await ctx.db.batch([
    ctx.db.stmt("UPDATE conversation_members SET left_at = ?3, is_admin = 0 WHERE conversation_id = ?1 AND user_id = ?2 AND left_at IS NULL", conversationId, userId, now),
    ...sys.stmts,
    auditStmt(ctx, { action: "chat.group.remove", resourceType: "conversation", resourceId: conversationId, after: { removed: userId } }),
  ]);
  emit(ctx, g.members, { t: "conv", c: conversationId });
}

/** Leave the group. The owner's role passes to the earliest admin (else member); the last one out closes it. */
export async function leaveGroup(ctx: Ctx, conversationId: string): Promise<void> {
  const actor = requireActor(ctx);
  const g = await groupAccess(ctx, conversationId, false);
  const now = nowIso();
  const last = g.count <= 1;
  const sys = systemMessageStatements(ctx, conversationId, `${actor.profile?.full_name ?? "A member"} left the group.`, now);
  await ctx.db.batch([
    ...sys.stmts,
    ctx.db.stmt("UPDATE conversation_members SET left_at = ?3, role = 'MEMBER', is_admin = 0 WHERE conversation_id = ?1 AND user_id = ?2", conversationId, actor.user.id, now),
    ...(g.owner === actor.user.id && !last
      ? [ctx.db.stmt(`UPDATE conversation_members SET role = 'OWNER', is_admin = 0 WHERE conversation_id = ?1 AND user_id = (
                        SELECT user_id FROM conversation_members WHERE conversation_id = ?1 AND left_at IS NULL AND user_id <> ?2
                        ORDER BY is_admin DESC, COALESCE(joined_at, ''), user_id LIMIT 1)`,
          conversationId, actor.user.id)]
      : []),
    ...(last ? [ctx.db.stmt("UPDATE chat_groups SET deleted_at = ?2 WHERE conversation_id = ?1", conversationId, now)] : []),
    auditStmt(ctx, { action: "chat.group.leave", resourceType: "conversation", resourceId: conversationId }),
  ]);
  emit(ctx, g.members, { t: "conv", c: conversationId });
}

/** Delete the group for everyone (its messages are removed after 30 days). */
export async function deleteGroup(ctx: Ctx, conversationId: string): Promise<void> {
  requireActor(ctx);
  const g = await groupAccess(ctx, conversationId, true);
  if (!g.canGovern) throw new ForbiddenError("Only the group's owner can delete it.");
  const now = nowIso();
  await ctx.db.batch([
    ctx.db.stmt("UPDATE chat_groups SET deleted_at = ?2 WHERE conversation_id = ?1 AND deleted_at IS NULL", conversationId, now),
    ctx.db.stmt("UPDATE conversation_members SET left_at = COALESCE(left_at, ?2) WHERE conversation_id = ?1", conversationId, now),
    auditStmt(ctx, { action: "chat.group.delete", resourceType: "conversation", resourceId: conversationId, before: { name: g.name, members: g.count } }),
  ]);
  emit(ctx, g.members, { t: "conv", c: conversationId });
}
