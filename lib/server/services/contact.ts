/**
 * Contact form → D1 inbox (+ email when SMTP2GO is configured). Every message
 * is stored, so nothing is lost when email is not set up or fails, and the
 * provider's errors never reach the visitor.
 */
import { limit } from "../limits";
import { auditStmt } from "../audit";
import { requireActor, requirePermission } from "../authz";
import { siteUrl, type Ctx } from "../context";
import { newId, nowIso } from "../db";
import { NotFoundError, ValidationError } from "../errors";
import { deliverEmail, verifyTurnstile } from "../security";
import { Validator } from "../validate";
import { notifyStmts, usersWithPermission } from "../notifications";
import { triggerStmts } from "../triggers";
import { CONTACT_TOPICS, topicOf, type ContactTopic } from "../../contact/topics";

export async function submitContact(ctx: Ctx, input: Record<string, unknown>): Promise<{ message: string }> {
  await limit(ctx, "contact.submit", ctx.meta.ipHash ?? "unknown");
  const v = new Validator(input);
  const d = {
    name: v.string("name", { required: true, min: 2, max: 100, label: "Name" }),
    email: v.email("email"),
    message: v.string("message", { required: true, min: 10, max: 5000, label: "Message" }),
  };
  v.done();
  const topic = topicOf(input.topic);
  const about = topic && topic !== "general" ? ` (${CONTACT_TOPICS[topic]})` : "";
  // Honeypot: a hidden field only bots fill in. Pretend success.
  if (typeof input.website === "string" && input.website.trim()) return { message: "Thanks! We'll get back to you soon." };
  await verifyTurnstile(ctx, input.turnstileToken as string | undefined);
  const id = newId("msg");
  const rules = await triggerStmts(ctx, "message.received", { type: "contact_message", id }, { title: d.name!, link: "/dashboard/messages" });
  // Without a rule of their own, the people who handle the inbox get one in-app notice (never emailed:
  // the inbox address below already gets the message).
  const inbox = rules.length ? [] : notifyStmts(ctx, await usersWithPermission(ctx, "messages.read"), {
    type: "contact.new", title: `Contact message from ${d.name}${about}`.slice(0, 200), body: d.message!.slice(0, 160), link: "/dashboard/messages", resourceType: "contact_message", resourceId: id,
  });
  await ctx.db.batch([
    ctx.db.stmt("INSERT INTO contact_messages (id, name, email, message, ip_hash, created_at, topic) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)", id, d.name, d.email, d.message, ctx.meta.ipHash, nowIso(), topic),
    ...rules,
    ...inbox,
  ]);
  const to = ctx.env.CONTACT_EMAIL ?? ctx.env.EMAIL_FROM;
  if (to) {
    await deliverEmail(ctx, {
      to,
      replyTo: d.email!,
      subject: `New contact message from ${d.name}${about}`,
      text: `From: ${d.name} <${d.email}>${topic ? `\nTopic: ${CONTACT_TOPICS[topic]}` : ""}\n\n${d.message}\n\n— Open the inbox: ${siteUrl(ctx, "/dashboard/messages")}`,
    }, { type: "contact" });
  }
  return { message: "Thanks! We'll get back to you soon." };
}

export async function listMessages(ctx: Ctx, input: { status?: string; page?: number }) {
  requirePermission(ctx, "messages.read");
  const status = ["NEW", "READ", "ARCHIVED"].includes(String(input.status)) ? String(input.status) : null;
  const page = Math.max(1, Number(input.page) || 1);
  const rows = await ctx.db.all<{ id: string; name: string; email: string; message: string; topic: ContactTopic | null; status: string; created_at: string; handled_by_name: string | null; handled_at: string | null }>(
    `SELECT m.id, m.name, m.email, m.message, m.topic, m.status, m.created_at, m.handled_at, COALESCE(p.full_name, u.email) AS handled_by_name
     FROM contact_messages m LEFT JOIN users u ON u.id = m.handled_by LEFT JOIN profiles p ON p.user_id = u.id AND p.deleted_at IS NULL
     WHERE (?1 IS NULL AND m.status <> 'ARCHIVED') OR m.status = ?1 ORDER BY m.created_at DESC LIMIT 30 OFFSET ?2`,
    status, (page - 1) * 30);
  const unread = (await ctx.db.value<number>("SELECT COUNT(*) FROM contact_messages WHERE status = 'NEW'")) ?? 0;
  return { rows, page, hasMore: rows.length === 30, unread };
}

export async function setMessageStatus(ctx: Ctx, id: string, status: string): Promise<void> {
  const actor = requireActor(ctx);
  const decision = requirePermission(ctx, "messages.read");
  if (!["NEW", "READ", "ARCHIVED"].includes(status)) throw new ValidationError("Unknown status.");
  const changed = await ctx.db.run("UPDATE contact_messages SET status = ?2, handled_by = ?3, handled_at = ?4 WHERE id = ?1", id, status, actor.user.id, nowIso());
  if (!changed) throw new NotFoundError("Message");
  await auditStmt(ctx, { action: "message.status", resourceType: "contact_message", resourceId: id, after: { status }, decision }).run();
}
