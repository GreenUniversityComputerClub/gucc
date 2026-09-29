/**
 * Member-to-member messages. One thread per pair of people; a lost & found post or other item
 * can be attached as context. Privacy settings and blocks are enforced both ways, sending is
 * rate-limited, and leaders never read direct messages: moderators see only messages someone
 * reported, with a little context.
 */
import { limit } from "../limits";
import { isClubExecutive } from "../../governance/engine";
import { auditStmt } from "../audit";
import { can, requireActor, requirePermission } from "../authz";
import type { Ctx } from "../context";
import { newId, nowIso, type D1StatementLike } from "../db";
import { AppError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { notifyStmts, usersWithPermission } from "../notifications";
import { takeDownIfUnused } from "./media";

const EDIT_WINDOW_MS = 15 * 60_000;
const pairKey = (a: string, b: string) => (a < b ? `${a}:${b}` : `${b}:${a}`);

function cleanBody(raw: unknown): string {
  const body = String(raw ?? "").replace(/\r\n/g, "\n").trim();
  if (!body) throw new ValidationError("Write a message.", { body: "Write a message." });
  if (body.length > 2000) throw new ValidationError("Keep messages under 2,000 characters.", { body: "Too long." });
  return body;
}

/** Whether the actor may message this person at all, and why not. */
async function reachable(ctx: Ctx, recipientId: string): Promise<void> {
  const actor = requireActor(ctx);
  if (recipientId === actor.user.id) throw new ValidationError("You can't message yourself.");
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
  const actor = requireSender(ctx);
  const q = String(rawQ ?? "").trim().replace(/[%_]/g, "").slice(0, 60);
  if (q.length < 2) return [];
  const executive = isClubExecutive(actor.subject);
  const rows = await ctx.db.all<{ id: string; full_name: string; user_id: string; person_type: string; department: string | null; batch: string | null }>(
    `SELECT pr.id, pr.full_name, u.id AS user_id, pr.person_type, pr.department, pr.batch
     FROM users u JOIN profiles pr ON pr.user_id = u.id AND pr.deleted_at IS NULL
     WHERE u.status = 'ACTIVE' AND u.deleted_at IS NULL AND u.id <> ?4
       AND (pr.full_name LIKE ?1 OR pr.student_id = ?2)
       AND u.message_privacy <> 'NOBODY' AND (u.message_privacy <> 'EXECUTIVES' OR ?5 = 1)
       AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE (b.blocker_id = u.id AND b.blocked_id = ?4) OR (b.blocker_id = ?4 AND b.blocked_id = u.id))
     ORDER BY (pr.full_name LIKE ?3) DESC, pr.full_name LIMIT 10`,
    `%${q}%`, q, `${q}%`, actor.user.id, executive ? 1 : 0);
  return rows.map((r) => ({
    id: r.id, full_name: r.full_name, user_id: r.user_id, person_type: r.person_type, email: null, student_id: null,
    roles_held: [r.department, r.batch ? `batch ${r.batch}` : null].filter(Boolean).join(", ") || null,
  }));
}

function requireSender(ctx: Ctx) {
  const actor = requireActor(ctx);
  if (actor.user.status !== "ACTIVE") throw new ForbiddenError("Messaging opens once your membership is approved.");
  requirePermission(ctx, "chat.send");
  return actor;
}

/** Statements that add a message and tell the other person (once per unread stretch). */
async function messageStatements(ctx: Ctx, conversationId: string, recipientId: string, body: string, context?: { type: string; id: string } | null): Promise<D1StatementLike[]> {
  const actor = requireActor(ctx);
  const now = nowIso();
  const quiet = await ctx.db.first<{ unread: number; muted: number }>(
    `SELECT (c.last_message_at IS NOT NULL AND c.last_message_at > COALESCE(m.last_read_at, '')) AS unread, m.muted
     FROM conversations c JOIN conversation_members m ON m.conversation_id = c.id AND m.user_id = ?2 WHERE c.id = ?1`, conversationId, recipientId);
  const name = actor.profile?.full_name ?? actor.user.email;
  const messageId = newId("msg");
  return [
    ctx.db.stmt("INSERT INTO messages (id, conversation_id, sender_id, body, context_type, context_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
      messageId, conversationId, actor.user.id, body, context?.type ?? null, context?.id ?? null, now),
    ctx.db.stmt("UPDATE conversations SET last_message_at = ?2 WHERE id = ?1", conversationId, now),
    ctx.db.stmt("UPDATE conversation_members SET last_read_at = ?3, archived_at = NULL WHERE conversation_id = ?1 AND user_id = ?2", conversationId, actor.user.id, now),
    ctx.db.stmt("UPDATE conversation_members SET archived_at = NULL WHERE conversation_id = ?1 AND user_id = ?2", conversationId, recipientId),
    ...(quiet && !quiet.unread && !quiet.muted
      ? notifyStmts(ctx, [recipientId], { type: "message.received", title: `New message from ${name}`, body: body.slice(0, 140), link: `/dashboard/chat/${conversationId}`, resourceType: "message", resourceId: messageId })
      : []),
  ];
}

/** Start (or continue) the thread with someone; optionally about an item such as a lost & found post. */
export async function sendToPerson(ctx: Ctx, input: { userId?: unknown; body?: unknown; contextType?: unknown; contextId?: unknown }): Promise<{ conversationId: string }> {
  const actor = requireSender(ctx);
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
  await ctx.db.batch(await messageStatements(ctx, conv.id, recipientId, body, context));
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

export async function sendInThread(ctx: Ctx, conversationId: string, rawBody: unknown): Promise<void> {
  const actor = requireSender(ctx);
  const other = await membership(ctx, conversationId);
  const body = cleanBody(rawBody);
  const blocked = await ctx.db.first("SELECT 1 FROM user_blocks WHERE (blocker_id = ?1 AND blocked_id = ?2) OR (blocker_id = ?2 AND blocked_id = ?1)", actor.user.id, other);
  if (blocked) throw new ForbiddenError("Messages between you are blocked.");
  const active = await ctx.db.first<{ status: string }>("SELECT status FROM users WHERE id = ?1 AND deleted_at IS NULL", other);
  if (!active || active.status !== "ACTIVE") throw new AppError(409, "UNAVAILABLE", "This person's account isn't active any more.");
  await limit(ctx, "chat.send", actor.user.id);
  await ctx.db.batch(await messageStatements(ctx, conversationId, other, body));
}

/** My conversations, newest first, with the other person, the last message and unread state. */
export async function myConversations(ctx: Ctx, opts: { archived?: boolean } = {}) {
  const actor = requireActor(ctx);
  return ctx.db.all<{ id: string; last_message_at: string | null; muted: number; other_id: string; other_name: string | null; other_email: string; last_body: string | null; last_sender: string | null; last_deleted: string | null; unread: number; context_type: string | null }>(
    `SELECT c.id, c.last_message_at, me.muted, o.user_id AS other_id, p.full_name AS other_name, u.email AS other_email,
            lm.body AS last_body, lm.sender_id AS last_sender, lm.deleted_at AS last_deleted, lm.context_type,
            (c.last_message_at IS NOT NULL AND c.last_message_at > COALESCE(me.last_read_at, '')) AS unread
     FROM conversation_members me
     JOIN conversations c ON c.id = me.conversation_id
     JOIN conversation_members o ON o.conversation_id = c.id AND o.user_id <> me.user_id
     JOIN users u ON u.id = o.user_id
     LEFT JOIN profiles p ON p.user_id = o.user_id AND p.deleted_at IS NULL
     LEFT JOIN messages lm ON lm.id = (SELECT id FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1)
     WHERE me.user_id = ?1 AND ${opts.archived ? "me.archived_at IS NOT NULL" : "me.archived_at IS NULL"} AND c.last_message_at IS NOT NULL
     ORDER BY c.last_message_at DESC LIMIT 60`, actor.user.id);
}

export async function unreadConversations(ctx: Ctx): Promise<number> {
  const actor = requireActor(ctx);
  return (await ctx.db.value<number>(
    `SELECT COUNT(*) FROM conversation_members me JOIN conversations c ON c.id = me.conversation_id
     WHERE me.user_id = ?1 AND me.archived_at IS NULL AND me.muted = 0 AND c.last_message_at > COALESCE(me.last_read_at, '')`, actor.user.id)) ?? 0;
}

/** A thread (40 messages per page, newest last), marking it read. */
export async function thread(ctx: Ctx, conversationId: string, opts: { before?: string } = {}) {
  const actor = requireActor(ctx);
  const other = await membership(ctx, conversationId);
  const [person, rows] = await Promise.all([
    ctx.db.first<{ id: string; name: string | null; email: string; status: string; read_receipts: number; last_read_at: string | null; blocked: number; blocked_me: number }>(
      `SELECT u.id, p.full_name AS name, u.email, u.status, u.read_receipts, o.last_read_at,
              EXISTS (SELECT 1 FROM user_blocks WHERE blocker_id = ?3 AND blocked_id = u.id) AS blocked,
              EXISTS (SELECT 1 FROM user_blocks WHERE blocker_id = u.id AND blocked_id = ?3) AS blocked_me
       FROM users u JOIN conversation_members o ON o.user_id = u.id AND o.conversation_id = ?1
       LEFT JOIN profiles p ON p.user_id = u.id AND p.deleted_at IS NULL WHERE u.id = ?2`, conversationId, other, actor.user.id),
    ctx.db.all<{ id: string; sender_id: string; body: string; context_type: string | null; context_id: string | null; created_at: string; edited_at: string | null; deleted_at: string | null }>(
      `SELECT id, sender_id, body, context_type, context_id, created_at, edited_at, deleted_at FROM messages
       WHERE conversation_id = ?1 AND (?2 IS NULL OR created_at < ?2) ORDER BY created_at DESC LIMIT 40`, conversationId, opts.before ?? null),
  ]);
  const me = await ctx.db.first<{ read_receipts: number; muted: number }>("SELECT u.read_receipts, m.muted FROM users u JOIN conversation_members m ON m.user_id = u.id AND m.conversation_id = ?2 WHERE u.id = ?1", actor.user.id, conversationId);
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
  return {
    person: person && { id: person.id, name: person.name ?? person.email, active: person.status === "ACTIVE", blocked: Boolean(person.blocked), blockedMe: Boolean(person.blocked_me) },
    muted: Boolean(me?.muted),
    messages: rows.reverse().map((m) => ({
      id: m.id, mine: m.sender_id === actor.user.id, body: m.deleted_at ? null : m.body, deleted: Boolean(m.deleted_at), edited: Boolean(m.edited_at),
      at: m.created_at, editable: m.sender_id === actor.user.id && !m.deleted_at && Date.now() - new Date(m.created_at).getTime() < EDIT_WINDOW_MS,
      context: m.context_type === "lost_found_post" && m.context_id ? { title: titles[m.context_id] ?? "Lost & found post", href: "/lost-found" } : null,
    })),
    seenAt,
    more: rows.length === 40,
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

/** Report a message: moderators see it (and only it) with a little context. */
export async function reportMessage(ctx: Ctx, messageId: string, reasonRaw: unknown): Promise<void> {
  const actor = requireActor(ctx);
  const reason = String(reasonRaw ?? "").trim().slice(0, 500);
  if (reason.length < 3) throw new ValidationError("Say briefly what's wrong.", { reason: "Give a reason." });
  const m = await ctx.db.first<{ conversation_id: string; sender_id: string; body: string; deleted_at: string | null }>("SELECT conversation_id, sender_id, body, deleted_at FROM messages WHERE id = ?1", messageId);
  if (!m || m.deleted_at) throw new NotFoundError("Message");
  await membership(ctx, m.conversation_id);
  if (m.sender_id === actor.user.id) throw new ValidationError("You can't report your own message.");
  await limit(ctx, "report", actor.user.id);
  // Reporting the same message again changes nothing and doesn't notify the moderators twice.
  if (await ctx.db.first("SELECT 1 FROM reports WHERE resource_type = 'message' AND resource_id = ?1 AND reporter_id = ?2", messageId, actor.user.id)) return;
  const moderators = await usersWithPermission(ctx, "chat.moderate");
  await ctx.db.batch([
    // The text as it was when reported: a later edit or delete can't hide it from the moderators.
    ctx.db.stmt("INSERT INTO reports (id, resource_type, resource_id, reporter_id, reason, snapshot, created_at) VALUES (?1, 'message', ?2, ?3, ?4, ?5, ?6) ON CONFLICT DO NOTHING",
      newId("rep"), messageId, actor.user.id, reason, m.body.slice(0, 4000), nowIso()),
    auditStmt(ctx, { action: "message.report", resourceType: "message", resourceId: messageId, reason }),
    ...notifyStmts(ctx, moderators, { type: "report.new", title: "A message was reported", body: reason.slice(0, 140), link: "/dashboard/reports" }),
  ]);
}

/** Open reports (messages and lost & found posts) for moderators. */
export async function listReports(ctx: Ctx, opts: { status?: string } = {}) {
  // Message reports for chat moderators, post reports for lost & found moderators.
  const types = [...(can(ctx, "chat.moderate") ? ["message"] : []), ...(can(ctx, "lostfound.moderate") ? ["lost_found_post"] : [])];
  if (types.length === 0) requirePermission(ctx, "chat.moderate");
  const status = ["OPEN", "DISMISSED", "ACTIONED"].includes(opts.status ?? "") ? opts.status! : "OPEN";
  const rows = await ctx.db.all<{ id: string; resource_type: string; resource_id: string; reason: string; status: string; created_at: string; reporter: string | null;
    body: string | null; sender: string | null; sender_id: string | null; conversation_id: string | null; post_title: string | null }>(
    `SELECT r.id, r.resource_type, r.resource_id, r.reason, r.status, r.created_at, COALESCE(rp.full_name, ru.email) AS reporter,
            COALESCE(r.snapshot, m.body) AS body, COALESCE(sp.full_name, su.email) AS sender, m.sender_id, m.conversation_id, lf.title AS post_title
     FROM reports r
     JOIN users ru ON ru.id = r.reporter_id LEFT JOIN profiles rp ON rp.user_id = ru.id
     LEFT JOIN messages m ON r.resource_type = 'message' AND m.id = r.resource_id
     LEFT JOIN users su ON su.id = m.sender_id LEFT JOIN profiles sp ON sp.user_id = su.id
     LEFT JOIN lost_found_posts lf ON r.resource_type = 'lost_found_post' AND lf.id = r.resource_id
     WHERE r.status = ?1 AND r.resource_type IN (SELECT value FROM json_each(?2)) ORDER BY r.created_at DESC LIMIT 50`, status, JSON.stringify(types));
  return rows.map(({ conversation_id: _c, ...r }) => r);
}

/** Close a report; "remove" hides the reported message or post. */
export async function resolveReport(ctx: Ctx, reportId: string, outcome: "DISMISSED" | "ACTIONED", note: string | null, remove: boolean): Promise<void> {
  const actor = requireActor(ctx);
  const r = await ctx.db.first<{ resource_type: string; resource_id: string; status: string }>("SELECT resource_type, resource_id, status FROM reports WHERE id = ?1", reportId);
  if (!r) throw new NotFoundError("Report");
  const decision = requirePermission(ctx, r.resource_type === "message" ? "chat.moderate" : "lostfound.moderate");
  if (r.status !== "OPEN") throw new AppError(409, "RESOLVED", "This report is already closed.");
  const now = nowIso();
  await ctx.db.batch([
    ctx.db.stmt("UPDATE reports SET status = ?2, handled_by = ?3, handled_at = ?4, note = ?5 WHERE (id = ?1 OR (resource_type = ?6 AND resource_id = ?7)) AND status = 'OPEN'",
      reportId, outcome, actor.user.id, now, note, r.resource_type, r.resource_id),
    ...(remove && r.resource_type === "message" ? [ctx.db.stmt("UPDATE messages SET deleted_at = ?2, body = '[removed by a moderator]' WHERE id = ?1", r.resource_id, now), redactNotices(ctx, r.resource_id)] : []),
    ...(remove && r.resource_type === "lost_found_post" ? [ctx.db.stmt("UPDATE lost_found_posts SET deleted_at = ?2 WHERE id = ?1", r.resource_id, now),
      ctx.db.stmt("DELETE FROM media_references WHERE resource_type = 'lost_found' AND resource_id = ?1", r.resource_id)] : []),
    auditStmt(ctx, { action: "report.resolve", resourceType: r.resource_type, resourceId: r.resource_id, after: { outcome, removed: remove }, reason: note, decision }),
  ]);
  if (remove && r.resource_type === "lost_found_post") {
    const image = await ctx.db.value<string>("SELECT image_media_id FROM lost_found_posts WHERE id = ?1", r.resource_id);
    await takeDownIfUnused(ctx, image, "The post was removed after a report");
  }
}
