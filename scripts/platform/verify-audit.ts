/**
 * Verify the whole activity-log seal chain (read-only). Recomputes every seal from the rows,
 * which is too heavy for a request on the free plan, so it runs here.
 *
 *   bun scripts/platform/verify-audit.ts --target local|staging|production
 */
import { auditDigest } from "../../lib/server/services/audit-seal";
import { d1Query, parseTarget } from "./lib/wrangler";

const target = parseTarget(process.argv.slice(2));
type Seal = { id: number; first_rowid: number; last_rowid: number; row_count: number; digest: string; prev_digest: string | null; created_at: string };
const seals = d1Query<Seal>(target, "SELECT * FROM audit_seals ORDER BY id");
if (seals.length === 0) {
  console.log("No seals yet (the hourly job writes the first one after the next audit entry).");
  process.exit(0);
}
let prev: Seal | null = null;
let bad = 0;
for (const s of seals) {
  if (prev && (s.prev_digest !== prev.digest || s.first_rowid <= prev.last_rowid)) {
    console.error(`✗ seal ${s.id} (${s.created_at}) does not follow seal ${prev.id}`);
    bad++;
  }
  const rows = d1Query<Record<string, string | number | null>>(target,
    `SELECT rowid AS rid, id, actor_user_id, actor_label, action, resource_type, resource_id, reason, request_id, before_json, after_json, decision_json, created_at
     FROM audit_logs WHERE rowid BETWEEN ${Number(s.first_rowid)} AND ${Number(s.last_rowid)} ORDER BY rowid`);
  if (rows.length !== s.row_count || (await auditDigest(s.prev_digest, rows)) !== s.digest) {
    console.error(`✗ seal ${s.id} (${s.created_at}): entries ${s.first_rowid}–${s.last_rowid} were changed or removed`);
    bad++;
  }
  prev = s;
}
const unsealed = d1Query<{ n: number }>(target, `SELECT COUNT(*) AS n FROM audit_logs WHERE rowid > ${Number(prev!.last_rowid)}`)[0]?.n ?? 0;
console.log(`${bad ? "✗" : "✓"} ${seals.length} seals checked, newest ${prev!.created_at}; ${unsealed} newer entries not sealed yet.`);
process.exit(bad ? 1 : 0);
