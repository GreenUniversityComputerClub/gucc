/**
 * Tamper evidence for the activity log. The table already refuses updates and deletes (triggers);
 * on top of that, every hour the new rows are hashed together with the previous seal's digest (a
 * hash chain), so a row changed or removed after dropping those triggers no longer matches its
 * seal. Someone with direct database access could rewrite the seals too, which is why each digest
 * is also written to the Worker's log.
 */
import { requirePermission } from "../authz";
import type { Ctx } from "../context";
import { sha256Hex } from "../crypto";

/** Small enough to hash well inside the free plan's 10 ms of CPU; 7,200 entries a day at one seal an hour. */
export const MAX_ROWS_PER_SEAL = 300;
/** Seals whose chain links the dashboard checks (about three weeks); the offline verifier checks all. */
const CHAIN_WINDOW = 500;
type Row = Record<string, string | number | null>;
type Seal = { id: number; first_rowid: number; last_rowid: number; row_count: number; digest: string; prev_digest: string | null; created_at: string };

const COLUMNS = "rowid AS rid, id, actor_user_id, actor_label, action, resource_type, resource_id, reason, request_id, before_json, after_json, decision_json, created_at";
const line = (r: Row) => JSON.stringify([r.rid, r.id, r.actor_user_id, r.actor_label, r.action, r.resource_type, r.resource_id, r.reason, r.request_id, r.before_json, r.after_json, r.decision_json, r.created_at]);
const digestOf = (prev: string | null, rows: Row[]) => sha256Hex(`${prev ?? "genesis"}\n${rows.map(line).join("\n")}`);

/** Seal audit rows written since the last seal (at most MAX_ROWS_PER_SEAL per run). */
export async function sealAuditLog(ctx: Ctx): Promise<{ sealed: number; digest: string | null }> {
  const last = await ctx.db.first<Seal>("SELECT * FROM audit_seals ORDER BY id DESC LIMIT 1");
  const rows = await ctx.db.all<Row>(`SELECT ${COLUMNS} FROM audit_logs WHERE rowid > ?1 ORDER BY rowid LIMIT ?2`, last?.last_rowid ?? 0, MAX_ROWS_PER_SEAL);
  if (rows.length === 0) return { sealed: 0, digest: null };
  const digest = await digestOf(last?.digest ?? null, rows);
  await ctx.db.run("INSERT INTO audit_seals (first_rowid, last_rowid, row_count, digest, prev_digest) VALUES (?1, ?2, ?3, ?4, ?5)",
    Number(rows[0]!.rid), Number(rows.at(-1)!.rid), rows.length, digest, last?.digest ?? null);
  return { sealed: rows.length, digest };
}

/**
 * Check the chain links of the recent seals and recompute the newest few from the rows. Kept small
 * so it fits the Workers free plan; `scripts/platform/verify-audit.ts` checks everything offline.
 */
export async function verifyAuditLog(ctx: Ctx, recompute = 3) {
  requirePermission(ctx, "audit.read");
  return checkAuditSeals(ctx, recompute);
}

/** The check itself, for System health (whose viewers may not read the log's entries). */
export async function checkAuditSeals(ctx: Ctx, recompute = 1) {
  const seals = await ctx.db.all<Seal>(`SELECT * FROM (SELECT * FROM audit_seals ORDER BY id DESC LIMIT ${CHAIN_WINDOW}) ORDER BY id`);
  if (seals.length === 0) return { ok: true, seals: 0, checkedUpTo: null as string | null, problem: null as string | null };
  for (let i = 1; i < seals.length; i++) {
    if (seals[i]!.prev_digest !== seals[i - 1]!.digest || seals[i]!.first_rowid <= seals[i - 1]!.last_rowid) {
      return { ok: false, seals: seals.length, checkedUpTo: seals[i - 1]!.created_at, problem: `The seal from ${seals[i]!.created_at} doesn't follow the one before it.` };
    }
  }
  for (const s of seals.slice(-recompute)) {
    const rows = await ctx.db.all<Row>(`SELECT ${COLUMNS} FROM audit_logs WHERE rowid BETWEEN ?1 AND ?2 ORDER BY rowid`, s.first_rowid, s.last_rowid);
    if (rows.length !== s.row_count || (await digestOf(s.prev_digest, rows)) !== s.digest) {
      return { ok: false, seals: seals.length, checkedUpTo: null, problem: `Entries sealed at ${s.created_at} were changed or removed.` };
    }
  }
  return { ok: true, seals: seals.length, checkedUpTo: seals.at(-1)!.created_at, problem: null };
}

/** For the offline verifier: recompute one seal from exported rows. */
export { digestOf as auditDigest };
