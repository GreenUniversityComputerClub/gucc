/**
 * Member-to-member messages: one thread per pair of people, and group conversations (up to
 * `chat.max_group_members`, groups live in messaging-groups.ts). Text only. A lost & found post
 * or other item can be attached as context. Privacy settings and blocks are enforced both ways,
 * sending is rate-limited, and leaders never read other people's messages: moderators see only
 * messages someone reported (and, if the reporter chose, the two before it).
 *
 * Everything that changes is pushed to the other members' open tabs by the live hub (emit), so
 * receiving a message, a reaction or a read receipt costs them no database reads.
 */
import { limit } from "../limits";
import { isClubExecutive } from "../../governance/engine";
import { auditStmt } from "../audit";
import { can, requireActor, requirePermission } from "../authz";
import { avatarOfUserSql, avatarUrl } from "../avatar";
import type { Ctx } from "../context";
import { newId, nowIso, type D1StatementLike } from "../db";
import { AppError, AuthRequiredError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { emit, roomPass, watchPass, type LiveMessage } from "../live";
import { notifyEachStmts, notifyStmts, usersWith, usersWithPermission } from "../notifications";
import { badgeColumnsSql, badgeOf, moderatorOfUserSql, positionOfUserSql, type Badge } from "../person-badge";
import { getSetting } from "../security";
import { takeDownIfUnused } from "./media";
import { isReaction, type ReactionKey } from "../../chat/reactions";

const EDIT_WINDOW_MS = 15 * 60_000;
const pairKey = (a: string, b: string) => (a < b ? `${a}:${b}` : `${b}:${a}`);
export const MAX_MESSAGE = 2000;

/** How a person is named in chat: never their email, and "Former member" once the account is gone. */
export const personName = (u: string, p: string) => `CASE WHEN ${u}.deleted_at IS NOT NULL THEN 'Former member' ELSE COALESCE(${p}.full_name, 'Member') END`;

/** The name of the account `idExpr` (one small lookup, for message senders). */
const nameOfUserSql = (idExpr: string) =>
  `(SELECT CASE WHEN nu.deleted_at IS NOT NULL THEN 'Former member' ELSE COALESCE(np.full_name, 'Member') END FROM users nu LEFT JOIN profiles np ON np.user_id = nu.id AND np.deleted_at IS NULL WHERE nu.id = ${idExpr})`;

/**
 * When someone was last active, only if they share it and so does the viewer (?V = 1): the later
 * of the live hub's record and their newest session activity. No writes needed to know it.
 */
export const lastActiveSql = (u: string, viewerVisible: string) =>
  `CASE WHEN ${u}.show_active_status = 1 AND ${viewerVisible} = 1 AND ${u}.deleted_at IS NULL THEN NULLIF(max(COALESCE(${u}.last_active_at, ''),
     COALESCE((SELECT MAX(las.last_seen_at) FROM sessions las WHERE las.user_id = ${u}.id AND las.revoked_at IS NULL), '')), '') END`;

export const REPORT_CATEGORIES = {
  SPAM: "Spam",
  HARASSMENT: "Harassment or bullying",
  INAPPROPRIATE: "Inappropriate content",
  SCAM: "Scam or impersonation",
  OTHER: "Something else",
} as const;
export type ReportCategory = keyof typeof REPORT_CATEGORIES;

/** Messaging restriction lengths moderators can choose, in days. */
export const RESTRICT_DAYS = [1, 7, 30] as const;

export { REACTIONS, isReaction, type ReactionKey } from "../../chat/reactions";

export function cleanBody(raw: unknown): string {
  const body = String(raw ?? "").replace(/\r\n/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  if (!body) throw new ValidationError("Write a message.", { body: "Write a message." });
  if (body.length > MAX_MESSAGE) throw new ValidationError("Keep messages under 2,000 characters.", { body: "Too long." });
  return body;
}

export const dhakaDate = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Whether the actor may message this person at all, and why not. */
async function reachable(ctx: Ctx, recipientId: string): Promise<void> {
  const actor = requireActor(ctx);
  if (recipientId === actor.user.id) throw new ValidationError("You can't message yourself.");
  if (!recipientId) throw new ValidationError("Choose who to write to.", { userId: "Choose a member." });
  const r = await ctx.db.first<{ status: string; message_privacy: string; blocked_me: number; i_blocked: number }>(
    `SELECT u.status, u.message_privacy,
            EXISTS (SELECT 1 FROM user_blocks WHERE blocker_id = u.id AND blocked_id = ?2) AS blocked_me,
            EXISTS (SELECT 1 FROM user_blocks WHERE blocker_id = ?2 AND blocked_id = u.id) AS i_blocked
     FROM users u WHERE u.id = ?1 AND u.deleted_at IS NULL`, recipientId, actor.user.id);
  if (!r || r.status !== "ACTIVE") throw new NotFoundError("Member");
  if (r.i_blocked) throw new ForbiddenError("You've blocked this person. Unblock them to send a message.");
  if (r.blocked_me) throw new ForbiddenError("This person isn't accepting messages from you.");
  const executive = isClubExecutive(actor.subject);
  if (r.message_privacy === "NOBODY") throw new ForbiddenError("This person isn't accepting messages.");
  if (r.message_privacy === "EXECUTIVES" && !executive) throw new ForbiddenError("This person accepts messages from club executives only.");
}

/** SQL condition: `u` accepts a new conversation from ?ME (privacy and blocks both ways); ?EXEC is 1 for club executives. */
export const reachableSql = (u: string, me: string, exec: string) => `${u}.status = 'ACTIVE' AND ${u}.deleted_at IS NULL AND ${u}.id <> ${me}
  AND ${u}.message_privacy <> 'NOBODY' AND (${u}.message_privacy <> 'EXECUTIVES' OR ${exec} = 1)
  AND NOT EXISTS (SELECT 1 FROM user_blocks rb WHERE (rb.blocker_id = ${u}.id AND rb.blocked_id = ${me}) OR (rb.blocker_id = ${me} AND rb.blocked_id = ${u}.id))`;

export interface DirectoryPerson {
  user_id: string;
  id: string;
  full_name: string;
  handle: string | null;
  avatarUrl: string | null;
  badge: Badge;
  department: string | null;
  batch: string | null;
  lastActiveAt: string | null;
}

/**
 * Everyone an approved member can start a conversation with (active accounts whose message
 * settings allow it, with no block either way), each with their club badge, so the picker can
 * browse and filter without asking the server on every keystroke. Names only, never emails.
 * A signed "watch" list comes with it so the picker can show who is active now.
 */
export async function chatDirectory(ctx: Ctx): Promise<{ people: DirectoryPerson[]; watch: string }> {
  const actor = await requireSender(ctx);
  const executive = isClubExecutive(actor.subject);
  const rows = await ctx.db.all<{ user_id: string; id: string; full_name: string; handle: string | null; department: string | null; batch: string | null; avatar_json: string | null; last_active: string | null; badge_pos: string | null; badge_mod: number; badge_type: string | null }>(
    `SELECT u.id AS user_id, p.id, p.full_name, COALESCE(p.slug, p.id) AS handle, p.department, p.batch, ${avatarOfUserSql("u.id")} AS avatar_json,
            ${lastActiveSql("u", "(SELECT show_active_status FROM users WHERE id = ?1)")} AS last_active, ${badgeColumnsSql("u.id")}
     FROM users u JOIN profiles p ON p.user_id = u.id AND p.deleted_at IS NULL
     WHERE ${reachableSql("u", "?1", "?2")}
     ORDER BY p.full_name LIMIT 1500`, actor.user.id, executive ? 1 : 0);
  const people = rows.map((r) => ({
    user_id: r.user_id, id: r.id, full_name: r.full_name, handle: r.handle, avatarUrl: avatarUrl(r.avatar_json), badge: badgeOf(r),
    department: r.department, batch: r.batch, lastActiveAt: r.last_active,
  }));
  return { people, watch: await watchPass(ctx, actor.user.id, people.slice(0, 150).map((p) => p.user_id)) };
}

/**
 * Typeahead over the same people (older pages call this). A student ID finds someone only when
 * typed in full.
 */
export async function searchRecipients(ctx: Ctx, rawQ: unknown) {
  const actor = await requireSender(ctx);
  const q = String(rawQ ?? "").trim().replace(/[%_]/g, "").slice(0, 60);
  if (q.length < 2) return [];
  const executive = isClubExecutive(actor.subject);
  const rows = await ctx.db.all<{ id: string; full_name: string; user_id: string; person_type: string; department: string | null; batch: string | null; avatar_json: string | null; badge_pos: string | null; badge_mod: number; badge_type: string | null }>(
    `SELECT p.id, p.full_name, u.id AS user_id, p.person_type, p.department, p.batch, ${avatarOfUserSql("u.id")} AS avatar_json, ${badgeColumnsSql("u.id")}
     FROM users u JOIN profiles p ON p.user_id = u.id AND p.deleted_at IS NULL
     WHERE ${reachableSql("u", "?4", "?5")} AND (p.full_name LIKE ?1 OR p.student_id = ?2)
     ORDER BY (p.full_name LIKE ?3) DESC, p.full_name LIMIT 10`,
    `%${q}%`, q, `${q}%`, actor.user.id, executive ? 1 : 0);
  return rows.map((r) => {
    const badge = badgeOf(r);
    return {
      id: r.id, full_name: r.full_name, user_id: r.user_id, person_type: r.person_type, email: null, student_id: null, avatarUrl: avatarUrl(r.avatar_json), badge,
      roles_held: [badge.label, r.department, r.batch ? `batch ${r.batch}` : null].filter(Boolean).join(" · ") || null,
    };
  });
}

/** Approved members with chat.send, not under a moderator's messaging restriction. */
export async function requireSender(ctx: Ctx) {
  const actor = requireActor(ctx);
  if (actor.user.status !== "ACTIVE") throw new ForbiddenError("Messaging opens once your membership is approved.");
  requirePermission(ctx, "chat.send");
  const until = await ctx.db.value<string>("SELECT chat_restricted_until FROM users WHERE id = ?1", actor.user.id);
  if (until && until > nowIso()) {
    throw new ForbiddenError(`A moderator paused your messaging until ${dhakaDate(until)} after a report. You can still read your messages.`);
  }
  return actor;
}

/** A message id chosen by the browser, so a double Enter or a retry after a dropped connection sends once. */
function clientIdOf(raw: unknown): string | null {
  const v = typeof raw === "string" ? raw.trim() : "";
  return /^[A-Za-z0-9_-]{8,64}$/.test(v) ? v : null;
}

interface Recipient {
  u: string;
  muted: number;
  /** Already had unread messages here before this one (then no new notification). */
  unread: number;
}

/**
 * Statements that add a message, bring the conversation back to everyone's inbox and tell the
 * people who had nothing unread here (once per unread stretch, never when muted). One statement
 * for the notices however large the group.
 */
function messageStatements(ctx: Ctx, m: { id: string; conversationId: string; body: string; at: string; kind?: "TEXT" | "SYSTEM"; replyTo?: string | null; clientId?: string | null; context?: { type: string; id: string } | null },
  recipients: Recipient[], notice: { title: string } | null): D1StatementLike[] {
  const actor = requireActor(ctx);
  const notify = notice ? recipients.filter((r) => !r.unread && !r.muted).map((r) => r.u) : [];
  return [
    ctx.db.stmt("INSERT INTO messages (id, conversation_id, sender_id, body, context_type, context_id, created_at, client_id, kind, reply_to_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
      m.id, m.conversationId, actor.user.id, m.body, m.context?.type ?? null, m.context?.id ?? null, m.at, m.clientId ?? null, m.kind ?? "TEXT", m.replyTo ?? null),
    ctx.db.stmt("UPDATE conversations SET last_message_at = ?2, last_message_id = ?3 WHERE id = ?1", m.conversationId, m.at, m.id),
    // My read marker moves with my own message; everyone gets the conversation back from Archived.
    ctx.db.stmt(`UPDATE conversation_members SET last_read_at = CASE WHEN user_id = ?2 THEN ?3 ELSE last_read_at END, archived_at = NULL
                 WHERE conversation_id = ?1 AND left_at IS NULL AND (user_id = ?2 OR archived_at IS NOT NULL)`, m.conversationId, actor.user.id, m.at),
    ...(notify.length && notice
      ? notifyStmts(ctx, notify, { type: "message.received", title: notice.title, body: m.body.slice(0, 140), link: `/dashboard/chat/${m.conversationId}`, resourceType: "message", resourceId: m.id })
      : []),
  ];
}

/** What the other members' tabs get for a new message. */
function liveMessage(ctx: Ctx, m: { id: string; body: string; at: string; kind?: "TEXT" | "SYSTEM"; replyTo?: LiveMessage["replyTo"]; clientId?: string | null }): LiveMessage {
  const actor = requireActor(ctx);
  return { id: m.id, sender: actor.user.id, senderName: actor.profile?.full_name ?? "A member", body: m.body, at: m.at, kind: m.kind ?? "TEXT", replyTo: m.replyTo ?? null, clientId: m.clientId ?? null };
}

/** Start (or continue) the thread with someone; optionally about an item such as a lost & found post. */
export async function sendToPerson(ctx: Ctx, input: { userId?: unknown; body?: unknown; contextType?: unknown; contextId?: unknown }): Promise<{ conversationId: string }> {
  const actor = await requireSender(ctx);
  const recipientId = String(input.userId ?? "");
  const body = cleanBody(input.body);
  await reachable(ctx, recipientId);
  await limit(ctx, "chat.send", actor.user.id);
  const context = input.contextType === "lost_found_post" && typeof input.contextId === "string" ? { type: "lost_found_post", id: input.contextId } : null;
  const key = pairKey(actor.user.id, recipientId);
  let conv = await ctx.db.first<{ id: string; muted: number; unread: number }>(
    `SELECT c.id, COALESCE(o.muted, 0) AS muted, (c.last_message_at IS NOT NULL AND c.last_message_at > COALESCE(o.last_read_at, '')) AS unread
     FROM conversations c LEFT JOIN conversation_members o ON o.conversation_id = c.id AND o.user_id = ?2 WHERE c.pair_key = ?1`, key, recipientId);
  if (!conv) {
    await limit(ctx, "chat.newConversation", actor.user.id);
    const id = newId("cnv");
    const now = nowIso();
    await ctx.db.batch([
      ctx.db.stmt("INSERT INTO conversations (id, kind, pair_key, created_by, created_at) VALUES (?1, 'DIRECT', ?2, ?3, ?4) ON CONFLICT(pair_key) DO NOTHING", id, key, actor.user.id, now),
      ctx.db.stmt(`INSERT OR IGNORE INTO conversation_members (conversation_id, user_id, joined_at)
                   SELECT id, ?2, ?4 FROM conversations WHERE pair_key = ?1 UNION ALL SELECT id, ?3, ?4 FROM conversations WHERE pair_key = ?1`, key, actor.user.id, recipientId, now),
    ]);
    // A concurrent first message may have created the thread: use whichever exists.
    conv = { ...(await ctx.db.first<{ id: string }>("SELECT id FROM conversations WHERE pair_key = ?1", key))!, muted: 0, unread: 0 };
  }
  const id = newId("msg");
  const at = nowIso();
  await ctx.db.batch(messageStatements(ctx, { id, conversationId: conv.id, body, at, context }, [{ u: recipientId, muted: conv.muted, unread: conv.unread }],
    { title: `New message from ${actor.profile?.full_name ?? "a member"}` }));
  emit(ctx, [actor.user.id, recipientId], { t: "msg", c: conv.id, m: liveMessage(ctx, { id, body, at }), from: actor.user.id });
  return { conversationId: conv.id };
}

/** Everything sending needs to know about a conversation, in one statement. */
interface SendState {
  left_at: string | null;
  is_group: number;
  group_name: string | null;
  group_deleted: string | null;
  others: string;
  other_status: string | null;
  other_deleted: number | null;
  blocked: number;
  dup: string | null;
  reply: string | null;
}

async function sendState(ctx: Ctx, conversationId: string, clientId: string | null, replyTo: string | null): Promise<SendState> {
  const actor = requireActor(ctx);
  const s = await ctx.db.first<SendState>(
    `SELECT me.left_at, (g.conversation_id IS NOT NULL) AS is_group, g.name AS group_name, g.deleted_at AS group_deleted,
            (SELECT json_group_array(json_object('u', o.user_id, 'muted', o.muted, 'unread', (c.last_message_at IS NOT NULL AND c.last_message_at > COALESCE(o.last_read_at, ''))))
               FROM conversation_members o WHERE o.conversation_id = c.id AND o.user_id <> ?2 AND o.left_at IS NULL) AS others,
            ou.status AS other_status, (ou.deleted_at IS NOT NULL) AS other_deleted,
            CASE WHEN g.conversation_id IS NULL AND ou.id IS NOT NULL THEN EXISTS (SELECT 1 FROM user_blocks b WHERE (b.blocker_id = ?2 AND b.blocked_id = ou.id) OR (b.blocker_id = ou.id AND b.blocked_id = ?2)) ELSE 0 END AS blocked,
            (SELECT json_object('id', d.id, 'at', d.created_at) FROM messages d WHERE d.sender_id = ?2 AND d.client_id = ?3) AS dup,
            (SELECT json_object('id', r.id, 'body', substr(r.body, 1, 140), 'name', ${nameOfUserSql("r.sender_id")}, 'deleted', r.deleted_at IS NOT NULL)
               FROM messages r WHERE r.id = ?4 AND r.conversation_id = c.id AND r.kind = 'TEXT') AS reply
     FROM conversation_members me
     JOIN conversations c ON c.id = me.conversation_id
     LEFT JOIN chat_groups g ON g.conversation_id = c.id
     LEFT JOIN users ou ON g.conversation_id IS NULL AND ou.id = (SELECT x.user_id FROM conversation_members x WHERE x.conversation_id = c.id AND x.user_id <> ?2 LIMIT 1)
     WHERE me.conversation_id = ?1 AND me.user_id = ?2`, conversationId, actor.user.id, clientId, replyTo);
  if (!s || s.group_deleted) throw new NotFoundError("Conversation");
  return s;
}

/** Send in an existing thread (direct or group). Returns the message as stored, so the page shows it at once. */
export async function sendInThread(ctx: Ctx, conversationId: string, rawBody: unknown, rawClientId?: unknown, rawReplyTo?: unknown): Promise<{ id: string; at: string }> {
  const actor = await requireSender(ctx);
  const body = cleanBody(rawBody);
  const clientId = clientIdOf(rawClientId);
  const replyTo = typeof rawReplyTo === "string" && rawReplyTo.length <= 80 ? rawReplyTo : null;
  const s = await sendState(ctx, conversationId, clientId, replyTo);
  if (s.dup) {
    const d = JSON.parse(s.dup) as { id: string; at: string };
    return { id: d.id, at: d.at };
  }
  if (s.left_at) throw new ForbiddenError(s.is_group ? "You're no longer in this group." : "You can't reply to this conversation.");
  if (!s.is_group) {
    if (s.blocked) throw new ForbiddenError("Messages between you are blocked.");
    if (s.other_status !== "ACTIVE" || s.other_deleted) throw new AppError(409, "UNAVAILABLE", "This person's account isn't active any more.");
  }
  if (replyTo && !s.reply) throw new ValidationError("The message you're replying to isn't in this conversation.");
  await limit(ctx, "chat.send", actor.user.id);
  const recipients = JSON.parse(s.others || "[]") as Recipient[];
  const reply = s.reply ? (JSON.parse(s.reply) as { id: string; body: string; name: string; deleted: number }) : null;
  const id = newId("msg");
  const at = nowIso();
  const name = actor.profile?.full_name ?? "A member";
  try {
    await ctx.db.batch(messageStatements(ctx, { id, conversationId, body, at, replyTo: reply?.id ?? null, clientId }, recipients,
      { title: s.is_group ? `${name} in ${s.group_name}` : `New message from ${name}` }));
  } catch (e) {
    // The same message arriving twice at the same moment: the first one won.
    const sent = clientId ? await ctx.db.first<{ id: string; created_at: string }>("SELECT id, created_at FROM messages WHERE sender_id = ?1 AND client_id = ?2", actor.user.id, clientId) : null;
    if (sent) return { id: sent.id, at: sent.created_at };
    throw e;
  }
  emit(ctx, [actor.user.id, ...recipients.map((r) => r.u)], {
    t: "msg", c: conversationId, from: actor.user.id, group: s.is_group ? s.group_name : null,
    m: liveMessage(ctx, { id, body, at, clientId, replyTo: reply ? { id: reply.id, name: reply.name, body: reply.deleted ? "" : reply.body } : null }),
  });
  return { id, at };
}

/**
 * Mark a conversation read up to its newest message, for a tab that received messages live (it
 * doesn't fetch the thread again). One statement, a write only when something was unread; the
 * others see "Seen" when both share read receipts.
 */
export async function markConversationRead(ctx: Ctx, conversationId: string): Promise<{ at: string | null }> {
  const actor = requireActor(ctx);
  const now = nowIso();
  const row = await ctx.db.first<{ receipts: number; others: string }>(
    `UPDATE conversation_members SET last_read_at = ?3 WHERE conversation_id = ?1 AND user_id = ?2 AND left_at IS NULL
       AND (last_read_at IS NULL OR last_read_at < (SELECT last_message_at FROM conversations WHERE id = ?1))
     RETURNING (SELECT read_receipts FROM users WHERE id = ?2) AS receipts,
               (SELECT json_group_array(o.user_id) FROM conversation_members o WHERE o.conversation_id = ?1 AND o.user_id <> ?2 AND o.left_at IS NULL) AS others`,
    conversationId, actor.user.id, now);
  if (!row) return { at: null };
  emit(ctx, [actor.user.id], { t: "sync" });
  if (row.receipts) emit(ctx, JSON.parse(row.others) as string[], { t: "read", c: conversationId, u: actor.user.id, at: now });
  return { at: now };
}

/** Add a system line to a group ("Rafi added Nusrat") in the same batch as the change. */
export function systemMessageStatements(ctx: Ctx, conversationId: string, text: string, at = nowIso()): { id: string; stmts: D1StatementLike[] } {
  const actor = requireActor(ctx);
  const id = newId("msg");
  return {
    id,
    stmts: [
      ctx.db.stmt("INSERT INTO messages (id, conversation_id, sender_id, body, created_at, kind) VALUES (?1, ?2, ?3, ?4, ?5, 'SYSTEM')", id, conversationId, actor.user.id, text.slice(0, MAX_MESSAGE), at),
      ctx.db.stmt("UPDATE conversations SET last_message_at = ?2, last_message_id = ?3 WHERE id = ?1", conversationId, at, id),
      ctx.db.stmt("UPDATE conversation_members SET last_read_at = ?3 WHERE conversation_id = ?1 AND user_id = ?2", conversationId, actor.user.id, at),
    ],
  };
}

export interface ConversationRow {
  id: string;
  last_message_at: string | null;
  muted: number;
  unread: number;
  isGroup: boolean;
  /** The other person (direct) or the group's name. */
  other_id: string | null;
  other_name: string;
  avatarUrl: string | null;
  handle: string | null;
  badge: Badge | null;
  memberCount: number;
  blocked: number;
  last_body: string | null;
  last_sender: string | null;
  last_sender_name: string | null;
  last_kind: string | null;
  last_deleted: string | null;
  context_type: string | null;
  lastActiveAt: string | null;
  more: boolean;
}

/** My conversations, newest first: the other person or the group (name and photo), the last message and unread state. */
export async function myConversations(ctx: Ctx, opts: { archived?: boolean; before?: string | null; limit?: number } = {}): Promise<ConversationRow[]> {
  const actor = requireActor(ctx);
  const before = opts.before && /^\d{4}-\d{2}-\d{2}T/.test(opts.before) ? opts.before : null;
  const size = Math.min(Math.max(opts.limit ?? 60, 1), 100);
  const rows = await ctx.db.all<{ id: string; last_message_at: string | null; muted: number; unread: number; group_name: string | null; group_photo: string | null; member_count: number;
    other_id: string | null; other_name: string | null; handle: string | null; avatar_json: string | null; blocked: number; last_body: string | null; last_sender: string | null; last_sender_name: string | null;
    last_kind: string | null; last_deleted: string | null; context_type: string | null; last_active: string | null; badge_pos: string | null; badge_mod: number; badge_type: string | null }>(
    `SELECT c.id, c.last_message_at, me.muted,
            (c.last_message_at IS NOT NULL AND c.last_message_at > COALESCE(me.last_read_at, '')) AS unread,
            g.name AS group_name,
            CASE WHEN g.conversation_id IS NOT NULL THEN (SELECT json_object('storage', gm.storage, 'object_key', gm.object_key, 'legacy_path', gm.legacy_path, 'external_url', gm.external_url, 'variants_json', gm.variants_json)
              FROM media gm WHERE gm.id = g.photo_media_id AND gm.deleted_at IS NULL AND gm.status = 'READY') END AS group_photo,
            CASE WHEN g.conversation_id IS NOT NULL THEN (SELECT COUNT(*) FROM conversation_members gc WHERE gc.conversation_id = c.id AND gc.left_at IS NULL) ELSE 2 END AS member_count,
            o.user_id AS other_id, CASE WHEN o.user_id IS NOT NULL THEN ${personName("u", "p")} END AS other_name, CASE WHEN u.deleted_at IS NULL THEN COALESCE(p.slug, p.id) END AS handle,
            CASE WHEN o.user_id IS NOT NULL THEN ${avatarOfUserSql("o.user_id")} END AS avatar_json,
            CASE WHEN o.user_id IS NOT NULL THEN EXISTS (SELECT 1 FROM user_blocks b WHERE b.blocker_id = me.user_id AND b.blocked_id = o.user_id) ELSE 0 END AS blocked,
            lm.body AS last_body, lm.sender_id AS last_sender, lm.kind AS last_kind,
            CASE WHEN g.conversation_id IS NOT NULL AND lm.sender_id IS NOT NULL THEN ${nameOfUserSql("lm.sender_id")} END AS last_sender_name,
            lm.deleted_at AS last_deleted, lm.context_type,
            CASE WHEN o.user_id IS NOT NULL THEN ${lastActiveSql("u", "(SELECT show_active_status FROM users WHERE id = ?1)")} END AS last_active,
            ${badgeColumnsSql("o.user_id")}
     FROM conversation_members me
     JOIN conversations c ON c.id = me.conversation_id
     LEFT JOIN chat_groups g ON g.conversation_id = c.id
     LEFT JOIN conversation_members o ON g.conversation_id IS NULL AND o.conversation_id = c.id AND o.user_id <> me.user_id
     LEFT JOIN users u ON u.id = o.user_id
     LEFT JOIN profiles p ON p.user_id = o.user_id AND p.deleted_at IS NULL
     LEFT JOIN messages lm ON lm.id = c.last_message_id
     WHERE me.user_id = ?1 AND me.left_at IS NULL AND (g.conversation_id IS NULL OR g.deleted_at IS NULL)
       AND ${opts.archived ? "me.archived_at IS NOT NULL" : "me.archived_at IS NULL"} AND c.last_message_at IS NOT NULL
       AND (?2 IS NULL OR c.last_message_at < ?2)
     ORDER BY c.last_message_at DESC LIMIT ?3`, actor.user.id, before, size + 1);
  const more = rows.length > size;
  return rows.slice(0, size).map((r) => ({
    id: r.id, last_message_at: r.last_message_at, muted: r.muted, unread: r.unread, isGroup: Boolean(r.group_name),
    other_id: r.other_id, other_name: r.group_name ?? r.other_name ?? "Former member", handle: r.handle,
    avatarUrl: avatarUrl(r.group_name ? r.group_photo : r.avatar_json), badge: r.group_name ? null : badgeOf(r), memberCount: r.member_count,
    blocked: r.blocked, last_body: r.last_kind === "SYSTEM" || !r.last_deleted ? r.last_body : null, last_sender: r.last_sender,
    last_sender_name: r.last_sender_name, last_kind: r.last_kind, last_deleted: r.last_deleted, context_type: r.context_type,
    lastActiveAt: r.last_active, more,
  }));
}

/**
 * "Anything new here?" in one statement, for tabs without a live connection: a fingerprint of the
 * thread (last message, the newest edit or deletion, reactions, the others' read markers,
 * blocks, the group's name, photo and members). The page fetches the whole thread only when it
 * changes. Answered from the session alone (no permission load).
 */
export async function pulse(ctx: Ctx, conversationId: string): Promise<{ sig: string }> {
  const userId = ctx.session?.userId ?? ctx.actor?.user.id;
  if (!userId) throw new AuthRequiredError();
  const r = await ctx.db.first<{ sig: string }>(
    `SELECT COALESCE(c.last_message_at, '') || '|' ||
            COALESCE((SELECT MAX(max(m.created_at, COALESCE(m.edited_at, ''), COALESCE(m.deleted_at, ''))) FROM messages m WHERE m.conversation_id = c.id), '') || '|' ||
            COALESCE((SELECT COUNT(*) || ':' || COALESCE(MAX(x.created_at), '') FROM message_reactions x JOIN messages xm ON xm.id = x.message_id WHERE xm.conversation_id = c.id), '') || '|' ||
            COALESCE((SELECT MAX(o.last_read_at) || ':' || COUNT(*) FROM conversation_members o WHERE o.conversation_id = c.id AND o.user_id <> me.user_id AND o.left_at IS NULL), '') || '|' ||
            me.muted || '|' || (me.archived_at IS NULL) || '|' || COALESCE(me.left_at, '') || '|' || COALESCE(g.updated_at, '') || '|' ||
            (SELECT COUNT(*) FROM user_blocks b JOIN conversation_members o2 ON o2.conversation_id = c.id AND o2.user_id <> me.user_id
              WHERE (b.blocker_id = me.user_id AND b.blocked_id = o2.user_id) OR (b.blocker_id = o2.user_id AND b.blocked_id = me.user_id)) AS sig
     FROM conversation_members me JOIN conversations c ON c.id = me.conversation_id LEFT JOIN chat_groups g ON g.conversation_id = c.id
     WHERE me.conversation_id = ?1 AND me.user_id = ?2 AND (g.deleted_at IS NULL)`, conversationId, userId);
  if (!r) throw new NotFoundError("Conversation");
  return { sig: r.sig };
}

export interface ThreadMessage {
  id: string;
  mine: boolean;
  kind: "TEXT" | "SYSTEM";
  sender: { id: string; name: string; avatarUrl: string | null } | null;
  body: string | null;
  deleted: boolean;
  edited: boolean;
  at: string;
  editable: boolean;
  reported: boolean;
  reactions: Array<{ u: string; e: ReactionKey }>;
  replyTo: { id: string; name: string; body: string | null } | null;
  context: { title: string; href: string } | null;
}

const ROLE_ORDER = { OWNER: 0, ADMIN: 1, MEMBER: 2 } as const;

export interface GroupMember {
  id: string;
  name: string;
  handle: string | null;
  avatarUrl: string | null;
  badge: Badge;
  role: "OWNER" | "ADMIN" | "MEMBER";
  lastReadAt: string | null;
  lastActiveAt: string | null;
}

/** A thread (40 messages per page, newest last), marking it read. */
export async function thread(ctx: Ctx, conversationId: string, opts: { before?: string } = {}) {
  const actor = requireActor(ctx);
  const me = actor.user.id;
  const info = await ctx.db.first<{
    left_at: string | null; muted: number; archived: number; my_read: string | null; my_receipts: number; my_visible: number; last_message_at: string | null;
    group_name: string | null; group_description: string | null; group_photo: string | null; group_owner: string | null; group_deleted: string | null; members: string | null;
    other_id: string | null; other_name: string | null; handle: string | null; other_status: string | null; other_deleted: number | null; other_receipts: number | null;
    other_read: string | null; avatar_json: string | null; blocked: number; blocked_me: number; last_active: string | null; badge_pos: string | null; badge_mod: number; badge_type: string | null;
  }>(
    `SELECT me.left_at, me.muted, (me.archived_at IS NOT NULL) AS archived, me.last_read_at AS my_read, mu.read_receipts AS my_receipts, mu.show_active_status AS my_visible, c.last_message_at,
            g.name AS group_name, g.description AS group_description, g.deleted_at AS group_deleted,
            (SELECT json_object('storage', gm.storage, 'object_key', gm.object_key, 'legacy_path', gm.legacy_path, 'external_url', gm.external_url, 'variants_json', gm.variants_json)
               FROM media gm WHERE gm.id = g.photo_media_id AND gm.deleted_at IS NULL AND gm.status = 'READY') AS group_photo,
            (SELECT x.user_id FROM conversation_members x WHERE x.conversation_id = c.id AND x.role = 'OWNER' AND x.left_at IS NULL) AS group_owner,
            CASE WHEN g.conversation_id IS NOT NULL THEN (
              SELECT json_group_array(json_object('id', gu.id, 'name', ${personName("gu", "gp")}, 'handle', CASE WHEN gu.deleted_at IS NULL THEN COALESCE(gp.slug, gp.id) END,
                       'avatar', ${avatarOfUserSql("gu.id")}, 'role', gcm.role, 'read', CASE WHEN gu.read_receipts = 1 AND mu.read_receipts = 1 THEN gcm.last_read_at END,
                       'active', ${lastActiveSql("gu", "mu.show_active_status")},
                       'pos', ${positionOfUserSql("gu.id")}, 'mod', ${moderatorOfUserSql("gu.id")}, 'type', gp.person_type))
              FROM conversation_members gcm JOIN users gu ON gu.id = gcm.user_id LEFT JOIN profiles gp ON gp.user_id = gu.id AND gp.deleted_at IS NULL
              WHERE gcm.conversation_id = c.id AND gcm.left_at IS NULL) END AS members,
            ou.id AS other_id, CASE WHEN ou.id IS NOT NULL THEN ${personName("ou", "op")} END AS other_name, CASE WHEN ou.deleted_at IS NULL THEN COALESCE(op.slug, op.id) END AS handle,
            ou.status AS other_status, (ou.deleted_at IS NOT NULL) AS other_deleted, ou.read_receipts AS other_receipts, oc.last_read_at AS other_read,
            CASE WHEN ou.id IS NOT NULL THEN ${avatarOfUserSql("ou.id")} END AS avatar_json,
            CASE WHEN ou.id IS NOT NULL THEN EXISTS (SELECT 1 FROM user_blocks WHERE blocker_id = ?2 AND blocked_id = ou.id) ELSE 0 END AS blocked,
            CASE WHEN ou.id IS NOT NULL THEN EXISTS (SELECT 1 FROM user_blocks WHERE blocker_id = ou.id AND blocked_id = ?2) ELSE 0 END AS blocked_me,
            CASE WHEN ou.id IS NOT NULL THEN ${lastActiveSql("ou", "mu.show_active_status")} END AS last_active,
            ${badgeColumnsSql("ou.id", "op")}
     FROM conversation_members me
     JOIN users mu ON mu.id = me.user_id
     JOIN conversations c ON c.id = me.conversation_id
     LEFT JOIN chat_groups g ON g.conversation_id = c.id
     LEFT JOIN conversation_members oc ON g.conversation_id IS NULL AND oc.conversation_id = c.id AND oc.user_id <> me.user_id
     LEFT JOIN users ou ON ou.id = oc.user_id
     LEFT JOIN profiles op ON op.user_id = ou.id AND op.deleted_at IS NULL
     WHERE me.conversation_id = ?1 AND me.user_id = ?2`, conversationId, me);
  if (!info || info.group_deleted) throw new NotFoundError("Conversation");
  const isGroup = info.group_name !== null;
  const before = opts.before && /^\d{4}-\d{2}-\d{2}T/.test(opts.before) ? opts.before : null;
  const rows = await ctx.db.all<{ id: string; sender_id: string; sender_name: string; sender_avatar: string | null; body: string; kind: string; context_type: string | null; context_id: string | null;
    created_at: string; edited_at: string | null; deleted_at: string | null; reported: number; reactions: string | null; reply: string | null }>(
    `SELECT m.id, m.sender_id, m.body, m.kind, m.context_type, m.context_id, m.created_at, m.edited_at, m.deleted_at,
            CASE WHEN ?5 = 1 THEN ${nameOfUserSql("m.sender_id")} END AS sender_name, CASE WHEN ?5 = 1 AND m.sender_id <> ?3 THEN ${avatarOfUserSql("m.sender_id")} END AS sender_avatar,
            EXISTS (SELECT 1 FROM reports r WHERE r.resource_type = 'message' AND r.resource_id = m.id AND r.reporter_id = ?3) AS reported,
            (SELECT json_group_array(json_object('u', x.user_id, 'e', x.emoji)) FROM message_reactions x WHERE x.message_id = m.id) AS reactions,
            CASE WHEN m.reply_to_id IS NOT NULL THEN (SELECT json_object('id', q.id, 'name', ${nameOfUserSql("q.sender_id")}, 'body', CASE WHEN q.deleted_at IS NULL THEN substr(q.body, 1, 140) END)
              FROM messages q WHERE q.id = m.reply_to_id) END AS reply
     FROM messages m WHERE m.conversation_id = ?1 AND (?2 IS NULL OR m.created_at < ?2) AND (?4 IS NULL OR m.created_at <= ?4)
     ORDER BY m.created_at DESC LIMIT 40`, conversationId, before, me, info.left_at, isGroup ? 1 : 0);
  // Opening the newest messages marks them read; a write only when there's something new (polling
  // stays read-only while the thread is quiet), and never for older pages.
  let readNow: string | null = null;
  if (!before && !info.left_at && info.last_message_at && info.last_message_at > (info.my_read ?? "")) {
    readNow = nowIso();
    await ctx.db.run(
      `UPDATE conversation_members SET last_read_at = ?3 WHERE conversation_id = ?1 AND user_id = ?2
         AND (last_read_at IS NULL OR last_read_at < (SELECT last_message_at FROM conversations WHERE id = ?1))`, conversationId, me, readNow);
  }
  const members: GroupMember[] = isGroup
    ? (JSON.parse(info.members ?? "[]") as Array<{ id: string; name: string; handle: string | null; avatar: string | null; role: "OWNER" | "ADMIN" | "MEMBER"; read: string | null; active: string | null; pos: string | null; mod: number; type: string | null }>)
        .map((x) => ({ id: x.id, name: x.name, handle: x.handle, avatarUrl: avatarUrl(x.avatar), role: x.role, lastReadAt: x.read, lastActiveAt: x.active, badge: badgeOf({ badge_pos: x.pos, badge_mod: x.mod, badge_type: x.type }) }))
        .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.badge.rank - b.badge.rank || a.name.localeCompare(b.name))
    : [];
  const others = isGroup ? members.map((x) => x.id).filter((id) => id !== me) : info.other_id ? [info.other_id] : [];
  if (readNow) {
    // My other tabs update their badges; the others see "Seen" if we both share read receipts.
    emit(ctx, [me], { t: "sync" });
    if (info.my_receipts) emit(ctx, others, { t: "read", c: conversationId, u: me, at: readNow });
  }
  // Contexts: lost & found post titles for the chips above messages.
  const ctxIds = [...new Set(rows.filter((r) => r.context_type === "lost_found_post" && r.context_id).map((r) => r.context_id!))];
  const posts = ctxIds.length
    ? await ctx.db.all<{ id: string; title: string }>("SELECT id, title FROM lost_found_posts WHERE id IN (SELECT value FROM json_each(?1))", JSON.stringify(ctxIds))
    : [];
  const titles = Object.fromEntries(posts.map((p) => [p.id, p.title]));
  // "Seen" only when both people share read receipts.
  const seenAt = !isGroup && info.other_receipts && info.my_receipts ? info.other_read : null;
  const { sig } = before ? { sig: "" } : await pulse(ctx, conversationId);
  // Owner, admins and club leaders manage; the owner and leaders also change roles and delete.
  const myRole = members.find((x) => x.id === me)?.role ?? null;
  const leader = can(ctx, "chat.groups.manage");
  const canGovern = isGroup && !info.left_at && (myRole === "OWNER" || leader);
  const canManage = isGroup && !info.left_at && (canGovern || myRole === "ADMIN");
  const other = !isGroup && info.other_id ? {
    id: info.other_id, name: info.other_name ?? "Former member", handle: info.handle, avatarUrl: avatarUrl(info.avatar_json), active: info.other_status === "ACTIVE" && !info.other_deleted,
    blocked: Boolean(info.blocked), blockedMe: Boolean(info.blocked_me), badge: badgeOf(info), lastActiveAt: info.last_active,
  } : null;
  const messages: ThreadMessage[] = rows.reverse().map((m) => {
    const reactions = (JSON.parse(m.reactions ?? "[]") as Array<{ u: string; e: string }>).filter((x) => isReaction(x.e)) as Array<{ u: string; e: ReactionKey }>;
    const reply = m.reply ? (JSON.parse(m.reply) as { id: string; name: string; body: string | null }) : null;
    return {
      id: m.id, mine: m.sender_id === me, kind: m.kind === "SYSTEM" ? "SYSTEM" : "TEXT",
      sender: isGroup ? { id: m.sender_id, name: m.sender_name, avatarUrl: avatarUrl(m.sender_avatar) } : null,
      body: m.deleted_at ? null : m.body, deleted: Boolean(m.deleted_at), edited: Boolean(m.edited_at),
      at: m.created_at, editable: m.sender_id === me && m.kind !== "SYSTEM" && !m.deleted_at && Date.now() - new Date(m.created_at).getTime() < EDIT_WINDOW_MS,
      reported: Boolean(m.reported), reactions: m.deleted_at ? [] : reactions, replyTo: reply,
      context: m.context_type === "lost_found_post" && m.context_id ? { title: titles[m.context_id] ?? "Lost & found post", href: "/lost-found" } : null,
    };
  });
  return {
    /** The other person (direct conversations). */
    person: other,
    group: isGroup ? {
      name: info.group_name!, description: info.group_description, avatarUrl: avatarUrl(info.group_photo, "sm"), members, ownerId: info.group_owner, canManage, canGovern, myRole,
      maxMembers: await getSetting(ctx, "chat.max_group_members", 50),
    } : null,
    me,
    left: Boolean(info.left_at),
    muted: Boolean(info.muted),
    archived: Boolean(info.archived),
    /** Where "New messages" starts: my read marker before this visit. */
    readUpTo: info.my_read ?? null,
    messages,
    seenAt,
    more: rows.length === 40,
    sig,
    /** Signed passes for the live hub: typing goes to these members; their active status can be followed. */
    room: info.left_at ? null : await roomPass(ctx, me, conversationId, others),
    watch: await watchPass(ctx, me, others.slice(0, 150)),
  };
}

/** Everyone still in this conversation (for live events). */
async function activeMembers(ctx: Ctx, conversationId: string): Promise<string[]> {
  return (await ctx.db.all<{ user_id: string }>("SELECT user_id FROM conversation_members WHERE conversation_id = ?1 AND left_at IS NULL", conversationId)).map((r) => r.user_id);
}

export async function editMessage(ctx: Ctx, messageId: string, rawBody: unknown): Promise<void> {
  const actor = requireActor(ctx);
  const m = await ctx.db.first<{ sender_id: string; created_at: string; deleted_at: string | null; kind: string; conversation_id: string; members: string }>(
    `SELECT m.sender_id, m.created_at, m.deleted_at, m.kind, m.conversation_id,
            (SELECT json_group_array(user_id) FROM conversation_members WHERE conversation_id = m.conversation_id AND left_at IS NULL) AS members
     FROM messages m WHERE m.id = ?1`, messageId);
  if (!m || m.sender_id !== actor.user.id || m.deleted_at || m.kind === "SYSTEM") throw new NotFoundError("Message");
  if (Date.now() - new Date(m.created_at).getTime() > EDIT_WINDOW_MS) throw new AppError(409, "TOO_LATE", "Messages can be edited for 15 minutes after sending.");
  const body = cleanBody(rawBody);
  await ctx.db.run("UPDATE messages SET body = ?2, edited_at = ?3 WHERE id = ?1", messageId, body, nowIso());
  emit(ctx, JSON.parse(m.members) as string[], { t: "edit", c: m.conversation_id, id: messageId, body });
}

/** The notification preview of a message that was deleted or removed no longer shows its text. */
const redactNotices = (ctx: Ctx, messageId: string) =>
  ctx.db.stmt("UPDATE notifications SET body = NULL WHERE resource_type = 'message' AND resource_id = ?1", messageId);

export async function deleteMessage(ctx: Ctx, messageId: string): Promise<void> {
  const actor = requireActor(ctx);
  // A report keeps its own copy of the text (reports.snapshot), so deleting can't erase evidence.
  const row = await ctx.db.first<{ conversation_id: string }>(
    "UPDATE messages SET deleted_at = ?3, body = '[deleted]' WHERE id = ?1 AND sender_id = ?2 AND deleted_at IS NULL AND kind = 'TEXT' RETURNING conversation_id", messageId, actor.user.id, nowIso());
  if (!row) throw new NotFoundError("Message");
  await ctx.db.batch([redactNotices(ctx, messageId), ctx.db.stmt("DELETE FROM message_reactions WHERE message_id = ?1", messageId)]);
  emit(ctx, await activeMembers(ctx, row.conversation_id), { t: "del", c: row.conversation_id, id: messageId });
}

/**
 * React to a message (or change or remove your reaction): one reaction per person per message,
 * text messages only, by people in the conversation (never across a block). Reactions don't
 * create notifications: the others see them live, or next time they open the conversation.
 */
export async function reactToMessage(ctx: Ctx, messageId: string, rawEmoji: unknown): Promise<{ emoji: ReactionKey | null }> {
  const actor = requireActor(ctx);
  if (actor.user.status !== "ACTIVE") throw new ForbiddenError("Reactions open once your membership is approved.");
  const emoji = rawEmoji === null || rawEmoji === "" ? null : isReaction(rawEmoji) ? rawEmoji : undefined;
  if (emoji === undefined) throw new ValidationError("Choose a reaction.");
  const m = await ctx.db.first<{ conversation_id: string; members: string; blocked: number }>(
    `SELECT m.conversation_id,
            (SELECT json_group_array(x.user_id) FROM conversation_members x WHERE x.conversation_id = m.conversation_id AND x.left_at IS NULL) AS members,
            EXISTS (SELECT 1 FROM user_blocks b JOIN conversation_members o ON o.conversation_id = m.conversation_id AND o.user_id <> ?2 AND o.left_at IS NULL
                    WHERE NOT EXISTS (SELECT 1 FROM chat_groups g WHERE g.conversation_id = m.conversation_id)
                      AND ((b.blocker_id = ?2 AND b.blocked_id = o.user_id) OR (b.blocker_id = o.user_id AND b.blocked_id = ?2))) AS blocked
     FROM messages m JOIN conversation_members me ON me.conversation_id = m.conversation_id AND me.user_id = ?2 AND me.left_at IS NULL
     WHERE m.id = ?1 AND m.deleted_at IS NULL AND m.kind = 'TEXT'`, messageId, actor.user.id);
  if (!m) throw new NotFoundError("Message");
  if (m.blocked) throw new ForbiddenError("Messages between you are blocked.");
  await limit(ctx, "chat.react", actor.user.id);
  if (emoji) {
    await ctx.db.run(`INSERT INTO message_reactions (message_id, user_id, emoji, created_at) VALUES (?1, ?2, ?3, ?4)
                      ON CONFLICT(message_id, user_id) DO UPDATE SET emoji = excluded.emoji, created_at = excluded.created_at`, messageId, actor.user.id, emoji, nowIso());
  } else {
    await ctx.db.run("DELETE FROM message_reactions WHERE message_id = ?1 AND user_id = ?2", messageId, actor.user.id);
  }
  emit(ctx, JSON.parse(m.members) as string[], { t: "react", c: m.conversation_id, id: messageId, u: actor.user.id, name: actor.profile?.full_name ?? "A member", e: emoji });
  return { emoji };
}

export async function setConversationState(ctx: Ctx, conversationId: string, state: { muted?: boolean; archived?: boolean }): Promise<void> {
  const actor = requireActor(ctx);
  const n = await ctx.db.run(
    `UPDATE conversation_members SET muted = COALESCE(?3, muted), archived_at = CASE WHEN ?4 IS NULL THEN archived_at WHEN ?4 = 1 THEN ?5 ELSE NULL END
     WHERE conversation_id = ?1 AND user_id = ?2`,
    conversationId, actor.user.id, state.muted === undefined ? null : state.muted ? 1 : 0, state.archived === undefined ? null : state.archived ? 1 : 0, nowIso());
  if (!n) throw new NotFoundError("Conversation");
  emit(ctx, [actor.user.id], { t: "sync" });
}

export async function setBlock(ctx: Ctx, userId: string, block: boolean): Promise<void> {
  const actor = requireActor(ctx);
  if (userId === actor.user.id) throw new ValidationError("You can't block yourself.");
  if (block && !(await ctx.db.first("SELECT 1 FROM users WHERE id = ?1", userId))) throw new NotFoundError("Member");
  await ctx.db.batch([
    block
      ? ctx.db.stmt("INSERT OR IGNORE INTO user_blocks (blocker_id, blocked_id, created_at) VALUES (?1, ?2, ?3)", actor.user.id, userId, nowIso())
      : ctx.db.stmt("DELETE FROM user_blocks WHERE blocker_id = ?1 AND blocked_id = ?2", actor.user.id, userId),
    auditStmt(ctx, { action: block ? "message.block" : "message.unblock", resourceType: "user", resourceId: userId }),
  ]);
  emit(ctx, [actor.user.id], { t: "sync" });
}

export async function setMessagePrivacy(ctx: Ctx, input: { privacy?: unknown; readReceipts?: unknown; showActive?: unknown }): Promise<void> {
  const actor = requireActor(ctx);
  const privacy = ["EVERYONE", "EXECUTIVES", "NOBODY"].includes(String(input.privacy)) ? String(input.privacy) : null;
  const flag = (v: unknown) => (v === undefined ? null : v === true || v === "on" || v === "true" ? 1 : 0);
  await ctx.db.run("UPDATE users SET message_privacy = COALESCE(?2, message_privacy), read_receipts = COALESCE(?3, read_receipts), show_active_status = COALESCE(?4, show_active_status) WHERE id = ?1",
    actor.user.id, privacy, flag(input.readReceipts), flag(input.showActive));
}

/**
 * The messages page in one call: conversations, my message settings (so the form shows what I
 * chose), the people I blocked, whether a moderator paused my messaging, and whether I may start
 * groups.
 */
export async function chatHome(ctx: Ctx, opts: { archived?: boolean; to?: string | null } = {}) {
  const actor = requireActor(ctx);
  const [conversations, me, blocked, to] = await Promise.all([
    myConversations(ctx, opts),
    ctx.db.first<{ message_privacy: string; read_receipts: number; show_active_status: number; chat_restricted_until: string | null; max_group: string | null }>(
      `SELECT message_privacy, read_receipts, show_active_status, chat_restricted_until,
              (SELECT value_json FROM system_settings WHERE key = 'chat.max_group_members') AS max_group FROM users WHERE id = ?1`, actor.user.id),
    myBlocks(ctx),
    // "Message" from a profile or a post: who the new message goes to (name and photo only).
    opts.to && opts.to !== actor.user.id
      ? ctx.db.first<{ id: string; name: string; avatar_json: string | null; badge_pos: string | null; badge_mod: number; badge_type: string | null }>(
        `SELECT u.id, ${personName("u", "p")} AS name, ${avatarOfUserSql("u.id")} AS avatar_json, ${badgeColumnsSql("u.id")} FROM users u
         LEFT JOIN profiles p ON p.user_id = u.id AND p.deleted_at IS NULL WHERE u.id = ?1 AND u.status = 'ACTIVE' AND u.deleted_at IS NULL`, opts.to)
      : Promise.resolve(null),
  ]);
  const until = me?.chat_restricted_until && me.chat_restricted_until > nowIso() ? me.chat_restricted_until : null;
  const watchIds = conversations.filter((c) => !c.isGroup && c.other_id && !c.blocked).map((c) => c.other_id!);
  return {
    conversations,
    settings: {
      privacy: (me?.message_privacy ?? "EVERYONE") as "EVERYONE" | "EXECUTIVES" | "NOBODY",
      readReceipts: Boolean(me?.read_receipts ?? 1),
      showActive: Boolean(me?.show_active_status ?? 1),
    },
    blocked,
    restrictedUntil: until,
    to: to ? { id: to.id, name: to.name, avatarUrl: avatarUrl(to.avatar_json), badge: badgeOf(to) } : null,
    canCreateGroups: actor.user.status === "ACTIVE" && can(ctx, "chat.groups.create") && !until,
    maxGroupMembers: Number(me?.max_group ?? 50) || 50,
    watch: await watchPass(ctx, actor.user.id, watchIds),
  };
}

/** People I blocked, newest first, to unblock from Message settings. */
export async function myBlocks(ctx: Ctx) {
  const actor = requireActor(ctx);
  const rows = await ctx.db.all<{ id: string; name: string; since: string; avatar_json: string | null }>(
    `SELECT u.id, ${personName("u", "p")} AS name, b.created_at AS since, ${avatarOfUserSql("u.id")} AS avatar_json
     FROM user_blocks b JOIN users u ON u.id = b.blocked_id LEFT JOIN profiles p ON p.user_id = u.id AND p.deleted_at IS NULL
     WHERE b.blocker_id = ?1 ORDER BY b.created_at DESC LIMIT 200`, actor.user.id);
  return rows.map(({ avatar_json, ...r }) => ({ ...r, avatarUrl: avatarUrl(avatar_json) }));
}

/**
 * Who hears about a reported message: people who can open Reports now. With two-factor required
 * for sensitive permissions, that is the holders who have it on; if none do (or nobody holds the
 * permission), the Moderators, so a report never lands nowhere.
 */
async function reportRecipients(ctx: Ctx, permission: "chat.moderate" | "lostfound.moderate", except: string): Promise<string[]> {
  const holders = (await usersWithPermission(ctx, permission)).filter((id) => id !== except);
  const fallback = async () => (await usersWith(ctx, { roles: ["moderator"] })).filter((id) => id !== except);
  if (holders.length === 0) return fallback();
  if (!(await getSetting(ctx, "security.mfa_required_for_sensitive", true))) return holders;
  const ready = await ctx.db.all<{ user_id: string }>(
    "SELECT user_id FROM user_mfa WHERE confirmed_at IS NOT NULL AND user_id IN (SELECT value FROM json_each(?1))", JSON.stringify(holders));
  return ready.length ? ready.map((r) => r.user_id) : holders;
}

export interface ReportInput {
  category?: unknown;
  details?: unknown;
  /** Older pages send only a reason. */
  reason?: unknown;
  includeContext?: unknown;
  block?: unknown;
}

/** Report a message: moderators see it (and only it, or the two before it if the reporter chose) with the reason. */
export async function reportMessage(ctx: Ctx, messageId: string, input: ReportInput | string): Promise<{ already: boolean; blocked: boolean }> {
  const actor = requireActor(ctx);
  const i: ReportInput = typeof input === "string" ? { reason: input } : input ?? {};
  const category: ReportCategory = String(i.category ?? "") in REPORT_CATEGORIES ? (String(i.category) as ReportCategory) : "OTHER";
  const details = String(i.details ?? i.reason ?? "").trim().slice(0, 500);
  if (category === "OTHER" && details.length < 3) throw new ValidationError("Say briefly what's wrong.", { details: "Tell the moderators what's wrong." });
  const reason = details ? `${REPORT_CATEGORIES[category]}: ${details}`.slice(0, 500) : REPORT_CATEGORIES[category];
  const m = await ctx.db.first<{ conversation_id: string; sender_id: string; body: string; created_at: string; deleted_at: string | null; kind: string; member: number }>(
    `SELECT m.conversation_id, m.sender_id, m.body, m.created_at, m.deleted_at, m.kind,
            EXISTS (SELECT 1 FROM conversation_members me WHERE me.conversation_id = m.conversation_id AND me.user_id = ?2) AS member
     FROM messages m WHERE m.id = ?1`, messageId, actor.user.id);
  if (!m || m.deleted_at || m.kind === "SYSTEM" || !m.member) throw new NotFoundError("Message");
  if (m.sender_id === actor.user.id) throw new ValidationError("You can't report your own message.");
  const block = i.block === true || i.block === "on" || i.block === "true";
  const blockStmts = block
    ? [ctx.db.stmt("INSERT OR IGNORE INTO user_blocks (blocker_id, blocked_id, created_at) VALUES (?1, ?2, ?3)", actor.user.id, m.sender_id, nowIso()),
      auditStmt(ctx, { action: "message.block", resourceType: "user", resourceId: m.sender_id })]
    : [];
  // Reporting the same message again changes nothing and doesn't notify the moderators twice.
  if (await ctx.db.first("SELECT 1 FROM reports WHERE resource_type = 'message' AND resource_id = ?1 AND reporter_id = ?2", messageId, actor.user.id)) {
    if (blockStmts.length) await ctx.db.batch(blockStmts);
    return { already: true, blocked: block };
  }
  await limit(ctx, "report", actor.user.id);
  // The text as it was when reported (a later edit or delete can't hide it), with the two messages
  // before it only when the reporter chose to share them.
  let snapshot = m.body;
  if (i.includeContext === true || i.includeContext === "on" || i.includeContext === "true") {
    const before = await ctx.db.all<{ mine: number; body: string; deleted_at: string | null; kind: string }>(
      `SELECT (sender_id = ?3) AS mine, body, deleted_at, kind FROM messages WHERE conversation_id = ?1 AND created_at < ?2 ORDER BY created_at DESC LIMIT 2`,
      m.conversation_id, m.created_at, actor.user.id);
    const lines = before.reverse().map((b) => `${b.kind === "SYSTEM" ? "Group" : b.mine ? "Reporter" : "Sender"}: ${b.deleted_at ? "(deleted)" : b.body}`);
    snapshot = [...lines.map((l) => `[earlier] ${l}`), `[reported] ${m.body}`].join("\n\n");
  }
  const moderators = await reportRecipients(ctx, "chat.moderate", actor.user.id);
  await ctx.db.batch([
    ctx.db.stmt("INSERT INTO reports (id, resource_type, resource_id, reporter_id, reason, snapshot, category, created_at) VALUES (?1, 'message', ?2, ?3, ?4, ?5, ?6, ?7) ON CONFLICT DO NOTHING",
      newId("rep"), messageId, actor.user.id, reason, snapshot.slice(0, 4000), category, nowIso()),
    auditStmt(ctx, { action: "message.report", resourceType: "message", resourceId: messageId, reason }),
    ...blockStmts,
    ...notifyStmts(ctx, moderators, { type: "report.new", title: `Message reported: ${REPORT_CATEGORIES[category]}`, body: details.slice(0, 140) || undefined, link: "/dashboard/reports" }),
  ]);
  return { already: false, blocked: block };
}

/** Open reports (messages and lost & found posts) for moderators. */
export async function listReports(ctx: Ctx, opts: { status?: string } = {}) {
  // Message reports for chat moderators, post reports for lost & found moderators.
  const types = [...(can(ctx, "chat.moderate") ? ["message"] : []), ...(can(ctx, "lostfound.moderate") ? ["lost_found_post"] : [])];
  if (types.length === 0) requirePermission(ctx, "chat.moderate");
  const status = ["OPEN", "DISMISSED", "ACTIONED"].includes(opts.status ?? "") ? opts.status! : "OPEN";
  const rows = await ctx.db.all<{ id: string; resource_type: string; resource_id: string; reason: string; category: string | null; status: string; created_at: string; reporter: string | null;
    body: string | null; sender: string | null; sender_id: string | null; conversation_id: string | null; post_title: string | null; note: string | null; handled_at: string | null;
    sender_actioned: number; sender_restricted_until: string | null; others: number }>(
    `SELECT r.id, r.resource_type, r.resource_id, r.reason, r.category, r.status, r.created_at, r.note, r.handled_at, COALESCE(rp.full_name, 'Member') AS reporter,
            COALESCE(r.snapshot, m.body) AS body, ${personName("su", "sp")} AS sender, m.sender_id, m.conversation_id, lf.title AS post_title,
            (SELECT COUNT(*) FROM reports r2 JOIN messages m2 ON m2.id = r2.resource_id WHERE r2.resource_type = 'message' AND r2.status = 'ACTIONED' AND m2.sender_id = m.sender_id) AS sender_actioned,
            su.chat_restricted_until AS sender_restricted_until,
            (SELECT COUNT(*) FROM reports r3 WHERE r3.resource_type = r.resource_type AND r3.resource_id = r.resource_id AND r3.id <> r.id) AS others
     FROM reports r
     JOIN users ru ON ru.id = r.reporter_id LEFT JOIN profiles rp ON rp.user_id = ru.id
     LEFT JOIN messages m ON r.resource_type = 'message' AND m.id = r.resource_id
     LEFT JOIN users su ON su.id = m.sender_id LEFT JOIN profiles sp ON sp.user_id = su.id
     LEFT JOIN lost_found_posts lf ON r.resource_type = 'lost_found_post' AND lf.id = r.resource_id
     WHERE r.status = ?1 AND r.resource_type IN (SELECT value FROM json_each(?2)) ORDER BY r.created_at ${status === "OPEN" ? "ASC" : "DESC"} LIMIT 50`, status, JSON.stringify(types));
  return rows.map(({ conversation_id: _c, ...r }) => ({
    ...r,
    categoryLabel: r.category && r.category in REPORT_CATEGORIES ? REPORT_CATEGORIES[r.category as ReportCategory] : null,
    sender_restricted_until: r.sender_restricted_until && r.sender_restricted_until > nowIso() ? r.sender_restricted_until : null,
  }));
}

export interface ResolveOptions {
  remove?: boolean;
  /** Tell the sender why the message was removed. */
  warn?: boolean;
  /** Pause the sender's messaging for this many days (1, 7 or 30). */
  restrictDays?: number | null;
}

/**
 * Close a report. "remove" hides the reported message or post; for messages the moderator can
 * also warn the sender or pause their messaging. The reporter hears the outcome; the sender hears
 * when their message is removed or their messaging is paused. Everything is audited.
 */
export async function resolveReport(ctx: Ctx, reportId: string, outcome: "DISMISSED" | "ACTIONED", note: string | null, removeOrOpts: boolean | ResolveOptions): Promise<void> {
  const actor = requireActor(ctx);
  const o: ResolveOptions = typeof removeOrOpts === "boolean" ? { remove: removeOrOpts } : removeOrOpts ?? {};
  const remove = Boolean(o.remove);
  const r = await ctx.db.first<{ resource_type: string; resource_id: string; status: string; category: string | null }>("SELECT resource_type, resource_id, status, category FROM reports WHERE id = ?1", reportId);
  if (!r) throw new NotFoundError("Report");
  const decision = requirePermission(ctx, r.resource_type === "message" ? "chat.moderate" : "lostfound.moderate");
  if (r.status !== "OPEN") throw new AppError(409, "RESOLVED", "This report is already closed.");
  const days = o.restrictDays && (RESTRICT_DAYS as readonly number[]).includes(Number(o.restrictDays)) ? Number(o.restrictDays) : null;
  if ((days || o.warn) && (r.resource_type !== "message" || outcome !== "ACTIONED")) throw new ValidationError("Warnings and messaging pauses go with removing a reported message.");
  const now = nowIso();
  const message = r.resource_type === "message"
    ? await ctx.db.first<{ sender_id: string; conversation_id: string }>("SELECT sender_id, conversation_id FROM messages WHERE id = ?1", r.resource_id)
    : null;
  const reporters = await ctx.db.all<{ reporter_id: string }>("SELECT reporter_id FROM reports WHERE resource_type = ?1 AND resource_id = ?2 AND status = 'OPEN'", r.resource_type, r.resource_id);
  const until = days ? new Date(Date.now() + days * 86_400_000).toISOString() : null;
  const what = r.resource_type === "message" ? "message" : "lost & found post";
  const category = r.category && r.category in REPORT_CATEGORIES ? REPORT_CATEGORIES[r.category as ReportCategory].toLowerCase() : null;
  const notices = [
    ...reporters.map((x) => ({
      userId: x.reporter_id, type: "report.resolved", link: r.resource_type === "message" ? "/dashboard/chat" : "/lost-found",
      title: outcome === "ACTIONED" ? `We acted on the ${what} you reported` : `We reviewed the ${what} you reported`,
      body: outcome === "ACTIONED" ? "Thank you. A moderator took action." : "A moderator found no rule was broken this time. You can still block the person.",
    })),
    ...(message && outcome === "ACTIONED" && (remove || o.warn || until)
      ? [{
          userId: message.sender_id, type: "report.sender", link: "/dashboard/chat",
          title: until ? `Your messaging is paused until ${dhakaDate(until)}` : "A message you sent was removed",
          body: [remove ? `A moderator removed a message you sent${category ? ` (${category})` : ""}.` : null, o.warn ? "Please keep messages respectful: repeated reports can pause your messaging." : null, note ? `Note: ${note.slice(0, 200)}` : null].filter(Boolean).join(" "),
        }]
      : []),
  ];
  await ctx.db.batch([
    ctx.db.stmt("UPDATE reports SET status = ?2, handled_by = ?3, handled_at = ?4, note = ?5 WHERE (id = ?1 OR (resource_type = ?6 AND resource_id = ?7)) AND status = 'OPEN'",
      reportId, outcome, actor.user.id, now, note, r.resource_type, r.resource_id),
    ...(remove && r.resource_type === "message" ? [ctx.db.stmt("UPDATE messages SET deleted_at = ?2, body = '[removed by a moderator]' WHERE id = ?1", r.resource_id, now), redactNotices(ctx, r.resource_id)] : []),
    ...(remove && r.resource_type === "lost_found_post" ? [ctx.db.stmt("UPDATE lost_found_posts SET deleted_at = ?2 WHERE id = ?1", r.resource_id, now),
      ctx.db.stmt("DELETE FROM media_references WHERE resource_type = 'lost_found' AND resource_id = ?1", r.resource_id)] : []),
    ...(until && message ? [ctx.db.stmt("UPDATE users SET chat_restricted_until = ?2 WHERE id = ?1", message.sender_id, until)] : []),
    auditStmt(ctx, { action: "report.resolve", resourceType: r.resource_type, resourceId: r.resource_id, after: { outcome, removed: remove, warned: Boolean(o.warn), restrictedUntil: until }, reason: note, decision }),
    ...notifyEachStmts(ctx, notices),
  ]);
  if (remove && message) emit(ctx, await activeMembers(ctx, message.conversation_id), { t: "del", c: message.conversation_id, id: r.resource_id, removed: true });
  if (remove && r.resource_type === "lost_found_post") {
    const image = await ctx.db.value<string>("SELECT image_media_id FROM lost_found_posts WHERE id = ?1", r.resource_id);
    await takeDownIfUnused(ctx, image, "The post was removed after a report");
  }
}

/** Lift a messaging pause early. */
export async function liftChatRestriction(ctx: Ctx, userId: string): Promise<void> {
  const decision = requirePermission(ctx, "chat.moderate");
  await ctx.db.batch([
    ctx.db.stmt("UPDATE users SET chat_restricted_until = NULL WHERE id = ?1", userId),
    auditStmt(ctx, { action: "message.unrestrict", resourceType: "user", resourceId: userId, decision }),
  ]);
}
