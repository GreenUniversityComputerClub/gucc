#!/usr/bin/env bun
/**
 * Legacy data migration: data/*.json, static TS data and public/ media → D1.
 *
 *   bun scripts/platform/migrate.ts --dry-run                       generate SQL + reports only
 *   bun scripts/platform/migrate.ts --target local                  import into local D1
 *   bun scripts/platform/migrate.ts --target staging                import into staging
 *   bun scripts/platform/migrate.ts --target production --confirm-production
 *   add --mode refresh to update rows no administrator has edited since import
 *
 * Safe to re-run: ids are deterministic and every statement is an upsert, so
 * nothing is duplicated. The default mode never overwrites existing rows.
 * Legacy source files are only read, never modified or deleted.
 *
 * Writes:
 *   migration/backup/<timestamp>/   copies + checksums of every source (git-ignored; contains private data)
 *   migration/out/import-<target>.sql  the generated statements   (git-ignored; contains private data)
 *   migration/reports/*.{md,json}   the migration report          (committed; private values masked)
 */
import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { transformLegacy, type MediaFile } from "../../lib/migration/transform";
import { insertSql } from "../../lib/migration/sql";
import { assertProductionConfirmed, d1ExecuteFile, d1Export, migrationsApply, parseTarget } from "./lib/wrangler";
import { writeReports } from "./lib/report";

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const DRY = argv.includes("--dry-run");
const target = parseTarget(argv);
const mode = argv.includes("--mode") && argv[argv.indexOf("--mode") + 1] === "refresh" ? "refresh" : "insert-missing";
if (!DRY) assertProductionConfirmed(target, argv, "import legacy data");

const MEDIA_DIRS = ["events", "executives", "contests", "blog", "collaborators", "sponsors", "certificates"];
const MIME: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml",
  ".avif": "image/avif", ".pdf": "application/pdf",
};

const readJson = <T>(rel: string): T => JSON.parse(readFileSync(path.join(ROOT, rel), "utf8")) as T;
const sha = (buf: Buffer | string) => createHash("sha256").update(buf).digest("hex");

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

async function inventoryMedia(): Promise<MediaFile[]> {
  const files: MediaFile[] = [];
  for (const d of MEDIA_DIRS) {
    for (const full of walk(path.join(ROOT, "public", d))) {
      const ext = path.extname(full).toLowerCase();
      if (!MIME[ext]) continue;
      const buf = readFileSync(full);
      const rel = `/${path.relative(path.join(ROOT, "public"), full).split(path.sep).join("/")}`;
      let width: number | undefined;
      let height: number | undefined;
      let mime = MIME[ext];
      if (mime.startsWith("image/") && ext !== ".svg") {
        try {
          const meta = await sharp(buf).metadata();
          width = meta.width;
          height = meta.height;
          // Several legacy "JPEGs" are really PNGs; record the true type.
          if (meta.format === "png") mime = "image/png";
          if (meta.format === "jpeg") mime = "image/jpeg";
          if (meta.format === "webp") mime = "image/webp";
        } catch {
          // Unreadable image: still inventoried, flagged by the report as missing dimensions.
        }
      }
      files.push({ path: rel, size: buf.length, sha256: sha(buf), width, height, mime });
    }
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function backupSources(stamp: string, mediaFiles: MediaFile[]): string {
  const dir = path.join(ROOT, "migration", "backup", stamp);
  mkdirSync(dir, { recursive: true });
  const sources = [
    ...readdirSync(path.join(ROOT, "data")).map((f) => `data/${f}`),
    "migration/sources/legacy-blog-posts.json",
    "migration/sources/legacy-collaborators.json",
    "lib/lost-found/config.ts",
    "app/executives/avatars.ts",
  ];
  const checksums: Record<string, string> = {};
  for (const rel of sources) {
    const src = path.join(ROOT, rel);
    if (!existsSync(src)) continue;
    const dest = path.join(dir, rel.replace(/\//g, "__"));
    copyFileSync(src, dest);
    checksums[rel] = sha(readFileSync(src));
  }
  writeFileSync(path.join(dir, "checksums.json"), JSON.stringify({ sources: checksums, media: Object.fromEntries(mediaFiles.map((m) => [m.path, m.sha256])) }, null, 2));
  return dir;
}

async function main() {
  const started = new Date().toISOString();
  const stamp = started.replace(/[:.]/g, "-");
  const runId = `run_${stamp}_${randomUUID().slice(0, 8)}`;

  console.log(`Legacy migration → ${DRY ? "dry run" : target} (mode: ${mode})`);
  const mediaFiles = await inventoryMedia();
  console.log(`  media inventoried: ${mediaFiles.length} files`);
  const backupDir = backupSources(stamp, mediaFiles);
  console.log(`  sources backed up: ${path.relative(ROOT, backupDir)}`);

  const collaborations = (await import("../../data/collaborations")).featuredCollaborations;
  const lostFound = await import("../../lib/lost-found/config");
  const avatars = await import("../../app/executives/avatars");

  const sources = {
    executives: readJson<Record<string, unknown>[]>("data/executives.json"),
    events: readJson<Record<string, unknown>[]>("data/events.json"),
    contests: readJson<{ contests: Record<string, unknown>[] }>("data/contests.json"),
    forms: readJson<Record<string, unknown>[]>("data/forms.json"),
    hacktheai: readJson<Record<string, unknown>[]>("data/hacktheaiteam.json"),
    sponsors: readJson<unknown>("data/sponsors.json"),
    predefined: readJson<unknown>("data/predefined.json"),
    featuredCollaborations: collaborations,
    partners: readJson<{ partners: unknown[] }>("migration/sources/legacy-collaborators.json").partners,
    lostFoundConfig: {
      categories: lostFound.lostFoundCategories,
      locations: lostFound.lostFoundLocations,
      contactMethods: lostFound.lostFoundContactMethods,
      allowedStudentDomains: lostFound.allowedStudentDomains,
    },
    blogPosts: readJson<{ posts: Record<string, unknown>[] }>("migration/sources/legacy-blog-posts.json").posts,
    avatarManifest: [...avatars.EXECUTIVE_AVATAR_FILES],
    mediaFiles,
  };

  const result = transformLegacy(sources, { runId, mode, now: started });

  // The old lost & found moderator list becomes a permission, not an email list.
  result.issues.push({
    // One account was on the list at commit eb33507; the list itself is intentionally not reproduced here.
    entity: "lostfound", key: "adminEmails", kind: "NOTE", detail: { accounts: 1 },
    resolution: "Hard-coded lost & found admin emails are replaced by the lostfound.moderate permission. Grant it (e.g. via a position or the Administrator role) once that person registers.",
  });

  const outDir = path.join(ROOT, "migration", "out");
  mkdirSync(outDir, { recursive: true });
  const sqlFile = path.join(outDir, `import-${DRY ? "dry-run" : target}.sql`);
  const runRow = (status: string, finished: string | null) =>
    insertSql("migration_runs", { id: runId, started_at: started, finished_at: finished, mode, status,
      summary_json: { counts: result.counts, expectedRows: result.expectedRows, issues: result.issues.filter((i) => i.kind !== "NOTE").length } }, { mode: "update" });
  writeFileSync(sqlFile, [
    `-- Generated ${started} by scripts/platform/migrate.ts (run ${runId}). Contains private data: do not commit or share.`,
    runRow("RUNNING", null),
    ...result.statements,
    runRow("IMPORTED", new Date().toISOString()),
    "",
  ].join("\n"));
  console.log(`  statements: ${result.statements.length} → ${path.relative(ROOT, sqlFile)}`);

  const reports = writeReports(result, { runId, started, target: DRY ? "dry-run" : target, mode, sources, backupDir: path.relative(ROOT, backupDir) });
  console.log(`  report: ${reports.map((r) => path.relative(ROOT, r)).join(", ")}`);

  if (DRY) {
    console.log("Dry run complete. Nothing was written to any database.");
    return;
  }

  if (target !== "local") {
    const snap = path.join(backupDir, `d1-${target}-before-import.sql`);
    console.log(`  exporting ${target} database before import…`);
    if (!d1Export(target, snap)) {
      console.error("Pre-import export failed; aborting so there is always a restore point.");
      process.exit(1);
    }
  }
  console.log("  applying schema migrations…");
  if (!migrationsApply(target)) process.exit(1);
  console.log("  importing…");
  if (!d1ExecuteFile(target, sqlFile)) {
    console.error("Import failed. The database may be partially imported; re-running is safe (idempotent). Restore point:", path.relative(ROOT, backupDir));
    process.exit(1);
  }
  console.log(`Import finished. Next: bun scripts/platform/verify.ts --target ${target}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
