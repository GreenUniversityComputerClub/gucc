/**
 * Member-to-member messages. One thread per pair of people; a lost & found post or other item
 * can be attached as context. Privacy settings and blocks are enforced both ways, sending is
 * rate-limited, and leaders never read direct messages: moderators see only messages someone
 * reported (and, if the reporter chose, the two before it).
 */
import { limit } from "../limits";
import { isClubExecutive } from "../../governance/engine";
import { auditStmt } from "../audit";
import { can, requireActor, requirePermission } from "../authz";
import { avatarOfUserSql, avatarUrl } from "../avatar";
import type { Ctx } from "../context";
import { newId, nowIso, type D1StatementLike } from "../db";
import { AppError, AuthRequiredError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { notifyEachStmts, notifyStmts, usersWith, usersWithPermission } from "../notifications";
import { getSetting } from "../security";
import { takeDownIfUnused } from "./media";

const EDIT_WINDOW_MS = 15 * 60_000;
const pairKey = (a: string, b: string) => (a < b ? `${a}:${b}` : `${b}:${a}`);

/** How a person is named in chat: never their email, and "Former member" once the account is gone. */
const personName = (u: string, p: string) => `CASE WHEN ${u}.deleted_at IS NOT NULL THEN 'Former member' ELSE COALESCE(${p}.full_name, 'Member') END`;

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

function cleanBody(raw: unknown): string {
  const body = String(raw ?? "").replace(/\r\n/g, "\n").trim();
  if (!body) throw new ValidationError("Write a message.", { body: "Write a message." });
  if (body.length > 2000) throw new ValidationError("Keep messages under 2,000 characters.", { body: "Too long." });
  return body;
}

const dhakaDate = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

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

/**
 * People an approved member can start a conversation with: active accounts whose message settings
 * allow it, with no block either way. Names only (plus department and batch to tell namesakes
 * apart); never emails. A student ID finds someone only when typed in full.
 */
export async function searchRecipients(ctx: Ctx, rawQ: unknown) {
  const actor = await requireSender(ctx);
  const q = String(rawQ ?? "").trim().replace(/[%_]/g, "").slice(0, 60);
  if (q.length < 2) return [];
  const executive = isClubExecutive(actor.subject);
  const rows = await ctx.db.all<{ id: string; full_name: string; user_id: string; person_type: string; department: string | null; batch: string | null; avatar_json: string | null }>(
    `SELECT pr.id, pr.full_name, u.id AS user_id, pr.person_type, pr.department, pr.batch, ${avatarOfUserSql("u.id")} AS avatar_json
     FROM users u JOIN profiles pr ON pr.user_id = u.id AND pr.deleted_at IS NULL
     WHERE u.status = 'ACTIVE' AND u.deleted_at IS NULL AND u.id <> ?4
       AND (pr.full_name LIKE ?1 OR pr.student_id = ?2)
       AND u.message_privacy <> 'NOBODY' AND (u.message_privacy <> 'EXECUTIVES' OR ?5 = 1)
       AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE (b.blocker_id = u.id AND b.blocked_id = ?4) OR (b.blocker_id = ?4 AND b.blocked_id = u.id))
     ORDER BY (pr.full_name LIKE ?3) DESC, pr.full_name LIMIT 10`,
    `%${q}%`, q, `${q}%`, actor.user.id, executive ? 1 : 0);
  return rows.map((r) => ({
    id: r.id, full_name: r.full_name, user_id: r.user_id, person_type: r.person_type, email: null, student_id: null, avatarUrl: avatarUrl(r.avatar_json),
    roles_held: [r.department, r.batch ? `batch ${r.batch}` : null].filter(Boolean).join(", ") || null,
  }));
}

/** Approved members with chat.send, not under a moderator's messaging restriction. */
async function requireSender(ctx: Ctx) {
  const actor = requireActor(ctx);
  if (actor.user.status !== "ACTIVE") throw new ForbiddenError("Messaging opens once your membership is approved.");
  requirePermission(ctx, "chat.send");
  const until = await ctx.db.value<string>("SELECT chat_restricted_until FROM users WHERE id = ?1", actor.user.id);
  if (until && until > nowIso()) {
    throw new ForbiddenError(`A moderator paused your messaging until ${dhakaDate(until)} after a report. You can still read your messages.`);
  }
  return actor;
}

/** Statements that add a message and tell the other person (once per unread stretch). */
async function messageStatements(ctx: Ctx, messageId: string, conversationId: string, recipientId: string, body: string, context?: { type: string; id: string } | null, clientId?: string | null): Promise<D1StatementLike[]> {
  const actor = requireActor(ctx);
  const now = nowIso();
  const quiet = await ctx.db.first<{ unread: number; muted: number }>(
    `SELECT (c.last_message_at IS NOT NULL AND c.last_message_at > COALESCE(m.last_read_at, '')) AS unread, m.muted
     FROM conversations c JOIN conversation_members m ON m.conversation_id = c.id AND m.user_id = ?2 WHERE c.id = ?1`, conversationId, recipientId);
  const name = actor.profile?.full_name ?? "A member";
  return [
    ctx.db.stmt("INSERT INTO messages (id, conversation_id, sender_id, body, context_type, context_id, created_at, client_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
      messageId, conversationId, actor.user.id, body, context?.type ?? null, context?.id ?? null, now, clientId ?? null),
    ctx.db.stmt("UPDATE conversations SET last_message_at = ?2 WHERE id = ?1", conversationId, now),
    ctx.db.stmt("UPDATE conversation_members SET last_read_at = ?3, archived_at = NULL WHERE conversation_id = ?1 AND user_id = ?2", conversationId, actor.user.id, now),
    ctx.db.stmt("UPDATE conversation_members SET archived_at = NULL WHERE conversation_id = ?1 AND user_id = ?2", conversationId, recipientId),
    ...(quiet && !quiet.unread && !quiet.muted
      ? notifyStmts(ctx, [recipientId], { type: "message.received", title: `New message from ${name}`, body: body.slice(0, 140), link: `/dashboard/chat/${conversationId}`, resourceType: "message", resourceId: messageId })
      : []),
  ];
}

/** A message id chosen by the browser, so a double Enter or a retry after a dropped connection sends once. */
function clientIdOf(raw: unknown): string | null {
  const v = typeof raw === "string" ? raw.trim() : "";
  return /^[A-Za-z0-9_-]{8,64}$/.test(v) ? v : null;
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
  let conv = await ctx.db.first<{ id: string }>("SELECT id FROM conversations WHERE pair_key = ?1", key);
  const stmts: D1StatementLike[] = [];
  if (!conv) {
    await limit(ctx, "chat.newConversation", actor.user.id);
    conv = { id: newId("cnv") };
    stmts.push(
      ctx.db.stmt("INSERT INTO conversations (id, kind, pair_key, created_by, created_at) VALUES (?1, 'DIRECT', ?2, ?3, ?4) ON CONFLICT(pair_key) DO NOTHING", conv.id, key, actor.user.id, nowIso()),
      ctx.db.stmt("INSERT OR IGNORE INTO conversation_members (conversation_id, user_id) VALUES (?1, ?2), (?1, ?3)", conv.id, actor.user.id, recipientId),
    );
    await ctx.db.batch(stmts);
    // A concurrent first message may have created the thread: use whichever exists.
    conv = (await ctx.db.first<{ id: string }>("SELECT id FROM conversations WHERE pair_key = ?1", key))!;
  }
  await ctx.db.batch(await messageStatements(ctx, newId("msg"), conv.id, recipientId, body, context));
  return { conversationId: conv.id };
}

async function membership(ctx: Ctx, conversationId: string) {
  const actor = requireActor(ctx);
  const row = await ctx.db.first<{ other_id: string }>(
    `SELECT o.user_id AS other_id FROM conversation_members me JOIN conversation_members o ON o.conversation_id = me.conversation_id AND o.user_id <> me.user_id
     WHERE me.conversation_id = ?1 AND me.user_id = ?2`, conversationId, actor.user.id);
  if (!row) throw new NotFoundError("Conversation");
  return row.other_id;
}

/** Send in an existing thread. Returns the message as stored, so the page shows it at once. */
export async function sendInThread(ctx: Ctx, conversationId: string, rawBody: unknown, rawClientId?: unknown): Promise<{ id: string; at: string }> {
  const actor = await requireSender(ctx);
  const other = await membership(ctx, conversationId);
  const body = cleanBody(rawBody);
  const clientId = clientIdOf(rawClientId);
  if (clientId) {
    const sent = await ctx.db.first<{ id: string; created_at: string }>("SELECT id, created_at FROM messages WHERE sender_id = ?1 AND client_id = ?2", actor.user.id, clientId);
    if (sent) return { id: sent.id, at: sent.created_at };
  }
  const blocked = await ctx.db.first("SELECT 1 FROM user_blocks WHERE (blocker_id = ?1 AND blocked_id = ?2) OR (blocker_id = ?2 AND blocked_id = ?1)", actor.user.id, other);
  if (blocked) throw new ForbiddenError("Messages between you are blocked.");
  const active = await ctx.db.first<{ status: string }>("SELECT status FROM users WHERE id = ?1 AND deleted_at IS NULL", other);
  if (!active || active.status !== "ACTIVE") throw new AppError(409, "UNAVAILABLE", "This person's account isn't active any more.");
  await limit(ctx, "chat.send", actor.user.id);
  const id = newId("msg");
  try {
    await ctx.db.batch(await messageStatements(ctx, id, conversationId, other, body, null, clientId));
  } catch (e) {
    // The same message arriving twice at the same moment: the first one won.
    const sent = clientId ? await ctx.db.first<{ id: string; created_at: string }>("SELECT id, created_at FROM messages WHERE sender_id = ?1 AND client_id = ?2", actor.user.id, clientId) : null;
    if (sent) return { id: sent.id, at: sent.created_at };
    throw e;
  }
  const at = (await ctx.db.value<string>("SELECT created_at FROM messages WHERE id = ?1", id)) ?? nowIso();
  return { id, at };
}

/** My conversations, newest first, with the other person (name and photo), the last message and unread state. */
export async function myConversations(ctx: Ctx, opts: { archived?: boolean; before?: string | null } = {}) {
  const actor = requireActor(ctx);
  const before = opts.before && /^\d{4}-\d{2}-\d{2}T/.test(opts.before) ? opts.before : null;
  const rows = await ctx.db.all<{ id: string; last_message_at: string | null; muted: number; other_id: string; other_name: string; avatar_json: string | null; blocked: number; last_body: string | null; last_sender: string | null; last_deleted: string | null; unread: number; context_type: string | null }>(
    `SELECT c.id, c.last_message_at, me.muted, o.user_id AS other_id, ${personName("u", "p")} AS other_name, ${avatarOfUserSql("o.user_id")} AS avatar_json,
            EXISTS (SELECT 1 FROM user_blocks b WHERE b.blocker_id = me.user_id AND b.blocked_id = o.user_id) AS blocked,
            lm.body AS last_body, lm.sender_id AS last_sender, lm.deleted_at AS last_deleted, lm.context_type,
            (c.last_message_at IS NOT NULL AND c.last_message_at > COALESCE(me.last_read_at, '')) AS unread
     FROM conversation_members me
     JOIN conversations c ON c.id = me.conversation_id
     JOIN conversation_members o ON o.conversation_id = c.id AND o.user_id <> me.user_id
     JOIN users u ON u.id = o.user_id
     LEFT JOIN profiles p ON p.user_id = o.user_id AND p.deleted_at IS NULL
     LEFT JOIN messages lm ON lm.id = (SELECT id FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1)
     WHERE me.user_id = ?1 AND ${opts.archived ? "me.archived_at IS NOT NULL" : "me.archived_at IS NULL"} AND c.last_message_at IS NOT NULL
       AND (?2 IS NULL OR c.last_message_at < ?2)
     ORDER BY c.last_message_at DESC LIMIT 61`, actor.user.id, before);
  return rows.slice(0, 60).map(({ avatar_json, ...r }) => ({ ...r, avatarUrl: avatarUrl(avatar_json), more: rows.length > 60 }));
}

/**
 * "Anything new here?" in one statement: a fingerprint of the thread (last message, the newest
 * edit or deletion, the other person's read marker, blocks). The page fetches the whole thread
 * only when it changes. Answered from the session alone (no permission load), so a quiet open
 * conversation costs about two D1 statements per check instead of thirteen.
 */
export async function pulse(ctx: Ctx, conversationId: string): Promise<{ sig: string }> {
  const userId = ctx.session?.userId ?? ctx.actor?.user.id;
  if (!userId) throw new AuthRequiredError();
  const r = await ctx.db.first<{ sig: string }>(
    `SELECT COALESCE(c.last_message_at, '') || '|' ||
            COALESCE((SELECT MAX(max(m.created_at, COALESCE(m.edited_at, ''), COALESCE(m.deleted_at, ''))) FROM messages m WHERE m.conversation_id = c.id), '') || '|' ||
            COALESCE(o.last_read_at, '') || '|' || me.muted || '|' || (me.archived_at IS NULL) || '|' ||
            (SELECT COUNT(*) FROM user_blocks b WHERE (b.blocker_id = me.user_id AND b.blocked_id = o.user_id) OR (b.blocker_id = o.user_id AND b.blocked_id = me.user_id)) AS sig
     FROM conversation_members me JOIN conversations c ON c.id = me.conversation_id
     JOIN conversation_members o ON o.conversation_id = c.id AND o.user_id <> me.user_id
     WHERE me.conversation_id = ?1 AND me.user_id = ?2`, conversationId, userId);
  if (!r) throw new NotFoundError("Conversation");
  return { sig: r.sig };
}

/** A thread (40 messages per page, newest last), marking it read. */
export async function thread(ctx: Ctx, conversationId: string, opts: { before?: string } = {}) {
  const actor = requireActor(ctx);
  const other = await membership(ctx, conversationId);
  const [person, rows, me] = await Promise.all([
    ctx.db.first<{ id: string; name: string; handle: string | null; status: string; deleted: number; read_receipts: number; last_read_at: string | null; blocked: number; blocked_me: number; avatar_json: string | null }>(
      `SELECT u.id, ${personName("u", "p")} AS name, CASE WHEN u.deleted_at IS NULL THEN COALESCE(p.slug, p.id) END AS handle, u.status, (u.deleted_at IS NOT NULL) AS deleted, u.read_receipts, o.last_read_at, ${avatarOfUserSql("u.id")} AS avatar_json,
              EXISTS (SELECT 1 FROM user_blocks WHERE blocker_id = ?3 AND blocked_id = u.id) AS blocked,
              EXISTS (SELECT 1 FROM user_blocks WHERE blocker_id = u.id AND blocked_id = ?3) AS blocked_me
       FROM users u JOIN conversation_members o ON o.user_id = u.id AND o.conversation_id = ?1
       LEFT JOIN profiles p ON p.user_id = u.id AND p.deleted_at IS NULL WHERE u.id = ?2`, conversationId, other, actor.user.id),
    ctx.db.all<{ id: string; sender_id: string; body: string; context_type: string | null; context_id: string | null; created_at: string; edited_at: string | null; deleted_at: string | null; reported: number }>(
      `SELECT id, sender_id, body, context_type, context_id, created_at, edited_at, deleted_at,
              EXISTS (SELECT 1 FROM reports r WHERE r.resource_type = 'message' AND r.resource_id = messages.id AND r.reporter_id = ?3) AS reported
       FROM messages WHERE conversation_id = ?1 AND (?2 IS NULL OR created_at < ?2) ORDER BY created_at DESC LIMIT 40`, conversationId, opts.before ?? null, actor.user.id),
    ctx.db.first<{ read_receipts: number; muted: number; archived: number; last_read_at: string | null }>(
      "SELECT u.read_receipts, m.muted, (m.archived_at IS NOT NULL) AS archived, m.last_read_at FROM users u JOIN conversation_members m ON m.user_id = u.id AND m.conversation_id = ?2 WHERE u.id = ?1",
      actor.user.id, conversationId),
  ]);
  // Opening the newest messages marks them read; a write only when there's something new (polling
  // stays read-only while the thread is quiet), and never for older pages.
  if (!opts.before) {
    await ctx.db.run(
      `UPDATE conversation_members SET last_read_at = ?3 WHERE conversation_id = ?1 AND user_id = ?2
         AND (last_read_at IS NULL OR last_read_at < (SELECT last_message_at FROM conversations WHERE id = ?1))`, conversationId, actor.user.id, nowIso());
  }
  // Contexts: lost & found post titles for the chips above messages.
  const ctxIds = [...new Set(rows.filter((r) => r.context_type === "lost_found_post" && r.context_id).map((r) => r.context_id!))];
  const posts = ctxIds.length
    ? await ctx.db.all<{ id: string; title: string }>("SELECT id, title FROM lost_found_posts WHERE id IN (SELECT value FROM json_each(?1))", JSON.stringify(ctxIds))
    : [];
  const titles = Object.fromEntries(posts.map((p) => [p.id, p.title]));
  // "Seen" only when both people share read receipts.
  const seenAt = person && person.read_receipts && me?.read_receipts ? person.last_read_at : null;
  const { sig } = opts.before ? { sig: "" } : await pulse(ctx, conversationId);
  return {
    person: person && {
      id: person.id, name: person.name, handle: person.handle, avatarUrl: avatarUrl(person.avatar_json), active: person.status === "ACTIVE" && !person.deleted,
      blocked: Boolean(person.blocked), blockedMe: Boolean(person.blocked_me),
    },
    muted: Boolean(me?.muted),
    archived: Boolean(me?.archived),
    /** Where "New messages" starts: my read marker before this visit. */
    readUpTo: me?.last_read_at ?? null,
    messages: rows.reverse().map((m) => ({
      id: m.id, mine: m.sender_id === actor.user.id, body: m.deleted_at ? null : m.body, deleted: Boolean(m.deleted_at), edited: Boolean(m.edited_at),
      at: m.created_at, editable: m.sender_id === actor.user.id && !m.deleted_at && Date.now() - new Date(m.created_at).getTime() < EDIT_WINDOW_MS,
      reported: Boolean(m.reported),
      context: m.context_type === "lost_found_post" && m.context_id ? { title: titles[m.context_id] ?? "Lost & found post", href: "/lost-found" } : null,
    })),
    seenAt,
    more: rows.length === 40,
    sig,
  };
}

export async function editMessage(ctx: Ctx, messageId: string, rawBody: unknown): Promise<void> {
  const actor = requireActor(ctx);
  const m = await ctx.db.first<{ sender_id: string; created_at: string; deleted_at: string | null }>("SELECT sender_id, created_at, deleted_at FROM messages WHERE id = ?1", messageId);
  if (!m || m.sender_id !== actor.user.id || m.deleted_at) throw new NotFoundError("Message");
  if (Date.now() - new Date(m.created_at).getTime() > EDIT_WINDOW_MS) throw new AppError(409, "TOO_LATE", "Messages can be edited for 15 minutes after sending.");
  await ctx.db.run("UPDATE messages SET body = ?2, edited_at = ?3 WHERE id = ?1", messageId, cleanBody(rawBody), nowIso());
}

/** The notification preview of a message that was deleted or removed no longer shows its text. */
const redactNotices = (ctx: Ctx, messageId: string) =>
  ctx.db.stmt("UPDATE notifications SET body = NULL WHERE resource_type = 'message' AND resource_id = ?1", messageId);

export async function deleteMessage(ctx: Ctx, messageId: string): Promise<void> {
  const actor = requireActor(ctx);
  // A report keeps its own copy of the text (reports.snapshot), so deleting can't erase evidence.
  const n = await ctx.db.run("UPDATE messages SET deleted_at = ?3, body = '[deleted]' WHERE id = ?1 AND sender_id = ?2 AND deleted_at IS NULL", messageId, actor.user.id, nowIso());
  if (!n) throw new NotFoundError("Message");
  await redactNotices(ctx, messageId).run();
}

export async function setConversationState(ctx: Ctx, conversationId: string, state: { muted?: boolean; archived?: boolean }): Promise<void> {
  const actor = requireActor(ctx);
  await membership(ctx, conversationId);
  await ctx.db.run(
    `UPDATE conversation_members SET muted = COALESCE(?3, muted), archived_at = CASE WHEN ?4 IS NULL THEN archived_at WHEN ?4 = 1 THEN ?5 ELSE NULL END
     WHERE conversation_id = ?1 AND user_id = ?2`,
    conversationId, actor.user.id, state.muted === undefined ? null : state.muted ? 1 : 0, state.archived === undefined ? null : state.archived ? 1 : 0, nowIso());
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
}

export async function setMessagePrivacy(ctx: Ctx, input: { privacy?: unknown; readReceipts?: unknown }): Promise<void> {
  const actor = requireActor(ctx);
  const privacy = ["EVERYONE", "EXECUTIVES", "NOBODY"].includes(String(input.privacy)) ? String(input.privacy) : null;
  await ctx.db.run("UPDATE users SET message_privacy = COALESCE(?2, message_privacy), read_receipts = COALESCE(?3, read_receipts) WHERE id = ?1",
    actor.user.id, privacy, input.readReceipts === undefined ? null : input.readReceipts ? 1 : 0);
}

/**
 * The messages page in one call: conversations, my message settings (so the form shows what I
 * chose), the people I blocked, and whether a moderator paused my messaging.
 */
export async function chatHome(ctx: Ctx, opts: { archived?: boolean; to?: string | null } = {}) {
  const actor = requireActor(ctx);
  const [conversations, me, blocked, to] = await Promise.all([
    myConversations(ctx, opts),
    ctx.db.first<{ message_privacy: string; read_receipts: number; chat_restricted_until: string | null }>(
      "SELECT message_privacy, read_receipts, chat_restricted_until FROM users WHERE id = ?1", actor.user.id),
    myBlocks(ctx),
    // "Message" from a profile or a post: who the new message goes to (name and photo only).
    opts.to && opts.to !== actor.user.id
      ? ctx.db.first<{ id: string; name: string; avatar_json: string | null }>(
        `SELECT u.id, ${personName("u", "p")} AS name, ${avatarOfUserSql("u.id")} AS avatar_json FROM users u
         LEFT JOIN profiles p ON p.user_id = u.id AND p.deleted_at IS NULL WHERE u.id = ?1 AND u.status = 'ACTIVE' AND u.deleted_at IS NULL`, opts.to)
      : Promise.resolve(null),
  ]);
  const until = me?.chat_restricted_until && me.chat_restricted_until > nowIso() ? me.chat_restricted_until : null;
  return {
    conversations,
    settings: { privacy: (me?.message_privacy ?? "EVERYONE") as "EVERYONE" | "EXECUTIVES" | "NOBODY", readReceipts: Boolean(me?.read_receipts ?? 1) },
    blocked,
    restrictedUntil: until,
    to: to ? { id: to.id, name: to.name, avatarUrl: avatarUrl(to.avatar_json) } : null,
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
  const m = await ctx.db.first<{ conversation_id: string; sender_id: string; body: string; created_at: string; deleted_at: string | null }>(
    "SELECT conversation_id, sender_id, body, created_at, deleted_at FROM messages WHERE id = ?1", messageId);
  if (!m || m.deleted_at) throw new NotFoundError("Message");
  await membership(ctx, m.conversation_id);
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
    const before = await ctx.db.all<{ mine: number; body: string; deleted_at: string | null }>(
      `SELECT (sender_id = ?3) AS mine, body, deleted_at FROM messages WHERE conversation_id = ?1 AND created_at < ?2 ORDER BY created_at DESC LIMIT 2`,
      m.conversation_id, m.created_at, actor.user.id);
    const lines = before.reverse().map((b) => `${b.mine ? "Reporter" : "Sender"}: ${b.deleted_at ? "(deleted)" : b.body}`);
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
    ? await ctx.db.first<{ sender_id: string }>("SELECT sender_id FROM messages WHERE id = ?1", r.resource_id)
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
