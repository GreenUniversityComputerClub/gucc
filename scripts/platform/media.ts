#!/usr/bin/env bun
/**
 * Legacy media → R2.
 *
 *   bun scripts/platform/media.ts --target local                  (writes to local R2 state used by `bun run preview`)
 *   bun scripts/platform/media.ts --target staging                (needs R2 enabled on the account)
 *   bun scripts/platform/media.ts --target production --confirm-production
 *   add --dry-run to report what would happen without uploading
 *
 * For every media row still served from /public (storage = STATIC):
 *   1. read the original file and check it is a real image (or PDF);
 *   2. apply EXIF orientation and drop all metadata (sharp strips it by default);
 *   3. encode WebP variants — thumb 400, sm 800, md 1280, lg 1920, master ≤2560 —
 *      only those smaller than the source (never upscaled), keeping alpha;
 *   4. upload them to R2 under media/legacy/<media id>/<variant>.webp;
 *   5. point the row at R2 (object_key, variants, checksum, size, dimensions).
 *
 * Safe to re-run: only STATIC rows are processed and object keys are
 * deterministic, so an interrupted run simply continues. Files in /public are
 * never deleted by this script; the verification step checks that every
 * migrated row resolves before anyone removes them.
 *
 * Remote targets upload through R2's S3 API when R2_ACCESS_KEY_ID /
 * R2_SECRET_ACCESS_KEY are set, otherwise with `wrangler r2 bulk put` (needs no
 * extra credentials). Database rows are updated only after every upload succeeds.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { AwsClient } from "aws4fetch";
import { sqlValue } from "../../lib/migration/sql";
import { assertProductionConfirmed, d1ExecuteFile, d1Query, loadCloudflareEnv, parseTarget, wrangler, type Target } from "./lib/wrangler";

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const target = parseTarget(argv);
const DRY = argv.includes("--dry-run");
if (!DRY) assertProductionConfirmed(target, argv, "migrate media");

// Legacy media are public: they go to the public bucket of each environment.
const BUCKET: Record<Target, string> = { local: "gucc-media-public-dev", staging: "gucc-media-public-staging", production: "gucc-media-public-production" };
const VARIANTS: Array<[string, number]> = [["thumb", 400], ["sm", 800], ["md", 1280], ["lg", 1920]];
const MASTER_MAX = 2560;
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

type Uploader = { put(key: string, body: Uint8Array, type: string): Promise<void>; close(): Promise<void> };

async function uploader(t: Target): Promise<Uploader> {
  const cache = "public, max-age=31536000, immutable";
  if (t === "local") {
    // Stage files, then hand them to a Node helper (Bun cannot host workerd for getPlatformProxy).
    const dir = mkdtempSync(path.join(tmpdir(), "gucc-media-local-"));
    const manifest: Array<{ key: string; file: string; type: string; cacheControl: string }> = [];
    return {
      put: async (key, body, type) => {
        const file = path.join(dir, `${manifest.length}.bin`);
        writeFileSync(file, body);
        manifest.push({ key, file, type, cacheControl: cache });
      },
      close: async () => {
        const list = path.join(dir, "manifest.json");
        writeFileSync(list, JSON.stringify(manifest));
        const r = spawnSync("node", [path.join(ROOT, "scripts/platform/lib/r2-local-put.mjs"), list], { stdio: "inherit" });
        rmSync(dir, { recursive: true, force: true });
        if (r.status !== 0) throw new Error("Writing to local R2 failed");
      },
    };
  }
  const env = loadCloudflareEnv();
  if (env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.CLOUDFLARE_ACCOUNT_ID) {
    const client = new AwsClient({ accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY, service: "s3", region: "auto" });
    const base = `https://${env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET[t]}`;
    return {
      put: async (key, body, type) => {
        const res = await client.fetch(`${base}/${key}`, { method: "PUT", body: body as unknown as BodyInit, headers: { "Content-Type": type, "Cache-Control": cache } });
        if (!res.ok) throw new Error(`R2 upload of ${key} failed (${res.status})`);
      },
      close: async () => {},
    };
  }
  // No S3 credentials: stage the files and upload them with `wrangler r2 bulk put`
  // (one call per content type, 20 uploads at a time).
  const dir = mkdtempSync(path.join(tmpdir(), "gucc-media-"));
  const byType = new Map<string, Array<{ key: string; file: string }>>();
  let n = 0;
  return {
    put: async (key, body, type) => {
      const file = path.join(dir, `obj-${n++}`);
      writeFileSync(file, body);
      byType.set(type, [...(byType.get(type) ?? []), { key, file }]);
    },
    close: async () => {
      try {
        for (const [type, entries] of byType) {
          const list = path.join(dir, "manifest.json");
          writeFileSync(list, JSON.stringify(entries));
          const r = wrangler(["r2", "bulk", "put", BUCKET[t], "--filename", list, "--content-type", type, "--cache-control", cache, "--remote", "--force"]);
          if (!r.ok) throw new Error(`Uploading ${entries.length} ${type} objects to ${BUCKET[t]} failed`);
          console.log(`  uploaded ${entries.length} ${type} objects`);
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}

interface Row {
  id: string;
  legacy_path: string;
  mime_type: string | null;
}

async function main() {
  const rows = d1Query<Row>(target, "SELECT id, legacy_path, mime_type FROM media WHERE storage = 'STATIC' AND deleted_at IS NULL AND legacy_path IS NOT NULL ORDER BY legacy_path");
  console.log(`${rows.length} legacy media rows to process on ${target}${DRY ? " (dry run)" : ""}`);
  const up = DRY ? null : await uploader(target);
  const updates: string[] = [];
  const seen = new Map<string, string>(); // master checksum → media id
  const report = { migrated: 0, skipped: [] as Array<{ path: string; reason: string }>, duplicates: [] as Array<{ path: string; sameAs: string }>, bytesBefore: 0, bytesAfter: 0, objects: 0 };
  const now = new Date().toISOString();

  for (const [i, row] of rows.entries()) {
    const file = path.join(ROOT, "public", row.legacy_path);
    if (!existsSync(file)) {
      report.skipped.push({ path: row.legacy_path, reason: "file missing" });
      continue;
    }
    const buf = new Uint8Array(readFileSync(file));
    report.bytesBefore += buf.length;
    const ext = path.extname(file).toLowerCase();
    if (ext === ".svg") {
      report.skipped.push({ path: row.legacy_path, reason: "SVG stays a static asset (vector logos can carry scripts; not served from R2)" });
      continue;
    }
    if (ext === ".pdf") {
      if (!Buffer.from(buf.subarray(0, 5)).toString("latin1").startsWith("%PDF-")) {
        report.skipped.push({ path: row.legacy_path, reason: "not a real PDF" });
        continue;
      }
      const key = `media/legacy/${row.id}/master.pdf`;
      if (up) await up.put(key, buf, "application/pdf");
      report.objects++;
      report.bytesAfter += buf.length;
      updates.push(`UPDATE media SET storage = 'R2', object_key = ${sqlValue(key)}, mime_type = 'application/pdf', size_bytes = ${buf.length}, checksum_sha256 = ${sqlValue(sha(buf))}, variants_json = ${sqlValue({ master: { key, size: buf.length } })}, updated_at = ${sqlValue(now)} WHERE id = ${sqlValue(row.id)} AND storage = 'STATIC';`);
      report.migrated++;
      continue;
    }

    let meta;
    try {
      meta = await sharp(buf, { failOn: "error" }).metadata();
    } catch {
      report.skipped.push({ path: row.legacy_path, reason: "not a readable image" });
      continue;
    }
    if (!meta.width || !meta.height || !["jpeg", "png", "webp", "gif", "avif", "tiff"].includes(meta.format ?? "")) {
      report.skipped.push({ path: row.legacy_path, reason: `unsupported format ${meta.format}` });
      continue;
    }
    // EXIF orientations 5–8 swap width and height.
    const rotated = (meta.orientation ?? 1) >= 5;
    const w = rotated ? meta.height : meta.width;
    const h = rotated ? meta.width : meta.height;
    const longest = Math.max(w, h);
    const alpha = Boolean(meta.hasAlpha);
    const encode = (max: number, quality: number) =>
      sharp(buf, { failOn: "none" })
        .rotate()
        .resize({ width: w >= h ? Math.min(max, w) : undefined, height: h > w ? Math.min(max, h) : undefined, fit: "inside", withoutEnlargement: true })
        .webp({ quality, alphaQuality: alpha ? 90 : 100, effort: 5, smartSubsample: true })
        .toBuffer({ resolveWithObject: true });

    const master = await encode(MASTER_MAX, 86);
    const masterBytes = new Uint8Array(master.data);
    const checksum = sha(masterBytes);
    const dup = seen.get(checksum);
    if (dup) {
      // Identical picture already migrated in this run: point references at it.
      report.duplicates.push({ path: row.legacy_path, sameAs: dup });
      for (const [table, col] of [["profiles", "avatar_media_id"], ["committee_members", "avatar_media_id"], ["events", "banner_media_id"], ["posts", "featured_media_id"]]) {
        updates.push(`UPDATE ${table} SET ${col} = ${sqlValue(dup)} WHERE ${col} = ${sqlValue(row.id)};`);
      }
      updates.push(`UPDATE OR IGNORE event_media SET media_id = ${sqlValue(dup)} WHERE media_id = ${sqlValue(row.id)};`);
      updates.push(`UPDATE OR IGNORE contest_media SET media_id = ${sqlValue(dup)} WHERE media_id = ${sqlValue(row.id)};`);
      updates.push(`UPDATE media SET status = 'ARCHIVED', deleted_at = ${sqlValue(now)}, alt_text = COALESCE(alt_text, ${sqlValue(`Duplicate of ${dup}`)}) WHERE id = ${sqlValue(row.id)};`);
      continue;
    }
    seen.set(checksum, row.id);

    const variants: Record<string, { key: string; width: number; height: number; size: number }> = {};
    const put = async (name: string, data: Uint8Array, width: number, height: number) => {
      const key = `media/legacy/${row.id}/${name}.webp`;
      if (up) await up.put(key, data, "image/webp");
      variants[name] = { key, width, height, size: data.length };
      report.objects++;
      report.bytesAfter += data.length;
    };
    for (const [name, max] of VARIANTS) {
      if (longest <= max) continue;
      const v = await encode(max, name === "thumb" ? 80 : 84);
      await put(name, new Uint8Array(v.data), v.info.width, v.info.height);
    }
    await put("master", masterBytes, master.info.width, master.info.height);

    updates.push(
      `UPDATE media SET storage = 'R2', object_key = ${sqlValue(variants.master.key)}, mime_type = 'image/webp', size_bytes = ${masterBytes.length}, ` +
        `width = ${master.info.width}, height = ${master.info.height}, checksum_sha256 = ${sqlValue(checksum)}, source_checksum = COALESCE(source_checksum, ${sqlValue(sha(buf))}), ` +
        `variants_json = ${sqlValue(variants)}, updated_at = ${sqlValue(now)} WHERE id = ${sqlValue(row.id)} AND storage = 'STATIC';`,
    );
    report.migrated++;
    if ((i + 1) % 25 === 0) console.log(`  ${i + 1}/${rows.length}`);
  }
  await up?.close();

  const dir = path.join(ROOT, "migration", "out");
  mkdirSync(dir, { recursive: true });
  const sqlFile = path.join(dir, `media-${target}.sql`);
  writeFileSync(sqlFile, `${updates.join("\n")}\n`);
  if (!DRY && updates.length) {
    if (!d1ExecuteFile(target, sqlFile)) process.exit(1);
  }

  const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
  const md = [
    "# Media migration report",
    "",
    `Target **${target}**${DRY ? " (dry run — nothing uploaded)" : ""} · ${now}`,
    "",
    "| | |",
    "| --- | --- |",
    `| Legacy files processed | ${rows.length} |`,
    `| Moved to R2 | ${report.migrated} |`,
    `| Duplicates merged | ${report.duplicates.length} |`,
    `| Left as static assets | ${report.skipped.length} |`,
    `| R2 objects written (all variants) | ${report.objects} |`,
    `| Size of originals | ${mb(report.bytesBefore)} |`,
    `| Size in R2 (all variants) | ${mb(report.bytesAfter)} |`,
    "",
    "Images were re-encoded to WebP with orientation applied and all metadata (EXIF, GPS, XMP) removed. Nothing was upscaled; alpha channels are preserved.",
    "",
    ...(report.skipped.length ? ["## Left as static assets", "", ...report.skipped.map((s) => `- \`${s.path}\` — ${s.reason}`), ""] : []),
    ...(report.duplicates.length ? ["## Duplicates merged", "", ...report.duplicates.map((d) => `- \`${d.path}\` → ${d.sameAs}`), ""] : []),
  ];
  writeFileSync(path.join(ROOT, "migration", "reports", `MEDIA_MIGRATION_REPORT${target === "local" ? "" : `.${target}`}.md`), md.join("\n"));
  console.log(`Done: ${report.migrated} moved, ${report.duplicates.length} merged, ${report.skipped.length} left static. ${mb(report.bytesBefore)} originals → ${mb(report.bytesAfter)} in R2.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
