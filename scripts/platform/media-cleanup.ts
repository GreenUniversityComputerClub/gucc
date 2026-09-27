#!/usr/bin/env bun
/**
 * Media housekeeping. Report-only unless --apply is given.
 *
 *   bun scripts/platform/media-cleanup.ts --target local              list unused and removable media
 *   bun scripts/platform/media-cleanup.ts --target staging --apply    delete R2 objects of archived, unreferenced media
 *
 * Rules (conservative on purpose):
 *  - "Unused" = active media that nothing references (profiles, committee
 *    listings, events, posts, contests, lost & found, media_references, or a
 *    path inside organization settings). Unused media are only REPORTED.
 *  - Objects are deleted only for media an administrator already ARCHIVED,
 *    that are still unreferenced, and were archived at least --days ago
 *    (default 30). The D1 row stays (history), marked as purged.
 */
import { assertProductionConfirmed, d1ExecuteFile, d1Query, parseTarget, wrangler } from "./lib/wrangler";
import { sqlValue } from "../../lib/migration/sql";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const argv = process.argv.slice(2);
const target = parseTarget(argv);
const APPLY = argv.includes("--apply");
if (APPLY) assertProductionConfirmed(target, argv, "delete media objects");
const days = Number(argv.includes("--days") ? argv[argv.indexOf("--days") + 1] : 30);
const env = target === "local" ? "dev" : target;
const BUCKETS = { public: `gucc-media-public-${env}`, private: `gucc-media-private-${env}` };

const REFERENCED = `
  EXISTS (SELECT 1 FROM media_references r WHERE r.media_id = m.id)
  OR EXISTS (SELECT 1 FROM profiles p WHERE p.avatar_media_id = m.id)
  OR EXISTS (SELECT 1 FROM committee_members c WHERE c.avatar_media_id = m.id)
  OR EXISTS (SELECT 1 FROM events e WHERE e.banner_media_id = m.id)
  OR EXISTS (SELECT 1 FROM event_media em WHERE em.media_id = m.id)
  OR EXISTS (SELECT 1 FROM posts po WHERE po.featured_media_id = m.id)
  OR EXISTS (SELECT 1 FROM recruitment_applications ra WHERE m.id IN (ra.cv_media_id, ra.photo_media_id, ra.id_card_media_id))
  OR EXISTS (SELECT 1 FROM contest_media cm WHERE cm.media_id = m.id)
  OR EXISTS (SELECT 1 FROM lost_found_posts lf WHERE lf.image_media_id = m.id)
  OR EXISTS (SELECT 1 FROM organization_settings s WHERE m.legacy_path IS NOT NULL AND instr(s.value_json, m.legacy_path) > 0)`;

const unused = d1Query<{ id: string; name: string; storage: string; size_bytes: number | null }>(target,
  `SELECT m.id, COALESCE(m.original_filename, m.legacy_path) AS name, m.storage, m.size_bytes FROM media m WHERE m.deleted_at IS NULL AND NOT (${REFERENCED}) ORDER BY m.created_at`);
const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
const removable = d1Query<{ id: string; variants_json: string | null; object_key: string | null; bucket: "public" | "private" }>(target,
  `SELECT m.id, m.variants_json, m.object_key, m.bucket FROM media m WHERE m.status = 'ARCHIVED' AND m.storage = 'R2' AND m.deleted_at IS NOT NULL AND m.deleted_at < ${sqlValue(cutoff)} AND NOT (${REFERENCED})`);

console.log(`Unused active media (report only): ${unused.length}`);
for (const u of unused.slice(0, 50)) console.log(`  ${u.id}  ${u.storage}  ${u.name ?? ""}`);
console.log(`Archived > ${days} days and unreferenced (objects removable): ${removable.length}`);
if (!APPLY || removable.length === 0) {
  if (!APPLY) console.log("Report only. Re-run with --apply to delete the removable objects.");
  process.exit(0);
}

const updates: string[] = [];
for (const m of removable) {
  const keys = Object.values(JSON.parse(m.variants_json ?? "{}") as Record<string, { key: string }>).map((v) => v.key);
  if (m.object_key && !keys.includes(m.object_key)) keys.push(m.object_key);
  for (const key of keys) {
    const r = wrangler(["r2", "object", "delete", `${BUCKETS[m.bucket ?? "public"]}/${key}`, ...(target === "local" ? ["--local"] : ["--remote"])], { quiet: true });
    if (!r.ok) console.warn(`  could not delete ${key}`);
  }
  updates.push(`UPDATE media SET storage = 'EXTERNAL', external_url = NULL, variants_json = NULL, object_key = NULL, alt_text = COALESCE(alt_text, 'Objects purged by media-cleanup') WHERE id = ${sqlValue(m.id)};`);
  updates.push(`INSERT INTO audit_logs (id, actor_label, action, resource_type, resource_id, reason, created_at) VALUES (${sqlValue(`aud_${crypto.randomUUID()}`)}, 'media-cleanup-cli', 'media.purge', 'media', ${sqlValue(m.id)}, ${sqlValue(`Archived more than ${days} days and unreferenced`)}, ${sqlValue(new Date().toISOString())});`);
}
const dir = mkdtempSync(path.join(tmpdir(), "gucc-cleanup-"));
const file = path.join(dir, "cleanup.sql");
writeFileSync(file, updates.join("\n"));
const ok = d1ExecuteFile(target, file);
rmSync(dir, { recursive: true, force: true });
process.exit(ok ? 0 : 1);
