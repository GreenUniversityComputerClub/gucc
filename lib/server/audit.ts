/**
 * Append-only audit log. The table rejects UPDATE and DELETE at the database
 * level (triggers in 0001_core_schema.sql), so history cannot be rewritten
 * through the application or by an administrator with API access.
 *
 * Use `auditStmt()` inside the same db.batch() as the write it describes, so
 * the change and its audit record commit or fail together.
 */
import type { Decision } from "../governance/types";
import type { Ctx } from "./context";
import { newId, nowIso, type D1StatementLike } from "./db";

export interface AuditEntry {
  action: string;
  resourceType?: string;
  resourceId?: string | null;
  reason?: string | null;
  before?: unknown;
  after?: unknown;
  decision?: Decision;
  /** Override the actor (e.g. failed logins have none). */
  actorUserId?: string | null;
  actorLabel?: string | null;
}

/** Strip values that must never be stored in the audit trail. */
function redact(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  const SECRET = /^(password|password_hash|token|token_hash|phone|contact|whatsapp|contact_value)$/i;
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = SECRET.test(k) ? "[redacted]" : walk(val);
      return out;
    }
    return v;
  };
  return walk(value);
}

export function auditStmt(ctx: Ctx, e: AuditEntry): D1StatementLike {
  const actorId = e.actorUserId !== undefined ? e.actorUserId : (ctx.actor?.user.id ?? null);
  const label = e.actorLabel ?? ctx.actor?.profile?.full_name ?? ctx.actor?.user.email ?? null;
  const json = (v: unknown) => (v === undefined ? null : JSON.stringify(redact(v)));
  return ctx.db.stmt(
    `INSERT INTO audit_logs (id, actor_user_id, actor_label, action, resource_type, resource_id, reason, request_id, ip_hash, user_agent,
                             before_json, after_json, decision_json, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)`,
    newId("aud"),
    actorId,
    label,
    e.action,
    e.resourceType ?? null,
    e.resourceId ?? null,
    e.reason ?? null,
    ctx.meta.requestId,
    ctx.meta.ipHash,
    ctx.meta.userAgent?.slice(0, 300) ?? null,
    json(e.before),
    json(e.after),
    e.decision ? JSON.stringify({ outcome: e.decision.outcome, permission: e.decision.permission, summary: e.decision.summary, rules: e.decision.matchedRules.map((r) => r.name) }) : null,
    nowIso(),
  );
}

/**
 * Many audit records in one statement (bulk operations: D1 counts statements per Worker
 * invocation). Same columns and redaction as auditStmt().
 */
export function auditManyStmt(ctx: Ctx, entries: AuditEntry[]): D1StatementLike[] {
  if (entries.length === 0) return [];
  const json = (v: unknown) => (v === undefined ? null : JSON.stringify(redact(v)));
  const now = nowIso();
  const rows = entries.map((e) => ({
    id: newId("aud"),
    actor: e.actorUserId !== undefined ? e.actorUserId : (ctx.actor?.user.id ?? null),
    label: e.actorLabel ?? ctx.actor?.profile?.full_name ?? ctx.actor?.user.email ?? null,
    action: e.action,
    type: e.resourceType ?? null,
    rid: e.resourceId ?? null,
    reason: e.reason ?? null,
    before: json(e.before),
    after: json(e.after),
    decision: e.decision ? JSON.stringify({ outcome: e.decision.outcome, permission: e.decision.permission, summary: e.decision.summary, rules: e.decision.matchedRules.map((r) => r.name) }) : null,
  }));
  return [
    ctx.db.stmt(
      `INSERT INTO audit_logs (id, actor_user_id, actor_label, action, resource_type, resource_id, reason, request_id, ip_hash, user_agent,
                               before_json, after_json, decision_json, created_at)
       SELECT json_extract(j.value, '$.id'), json_extract(j.value, '$.actor'), json_extract(j.value, '$.label'), json_extract(j.value, '$.action'),
              json_extract(j.value, '$.type'), json_extract(j.value, '$.rid'), json_extract(j.value, '$.reason'), ?2, ?3, ?4,
              json_extract(j.value, '$.before'), json_extract(j.value, '$.after'), json_extract(j.value, '$.decision'), ?5
       FROM json_each(?1) AS j`,
      JSON.stringify(rows), ctx.meta.requestId, ctx.meta.ipHash, ctx.meta.userAgent?.slice(0, 300) ?? null, now,
    ),
  ];
}

export async function audit(ctx: Ctx, e: AuditEntry): Promise<void> {
  await auditStmt(ctx, e).run();
}
