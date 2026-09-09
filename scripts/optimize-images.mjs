#!/usr/bin/env node
/**
 * Build-time image optimisation.
 *
 * `public/` shipped ~400 MB of source images — event photos straight off a
 * camera (6000px, up to 38 MB each, several actually PNGs saved with a .jpg
 * extension) and 163 executive portraits at ~940px that render at 160px. That
 * weight slows every deploy, and makes Next's on-demand image optimiser decode
 * enormous sources on the first request for each one.
 *
 * This normalises them in place before `next build`. It is deliberately
 * idempotent: a file is rewritten only when it is over the size budget, over
 * the width cap, or in the wrong container. Once processed it satisfies all
 * three, so later builds skip it and quality never compounds.
 *
 * Run directly with `bun run optimize:images`, or let `prebuild` invoke it.
 *   --dry-run   report what would change, write nothing
 *   --force     reprocess even files already within budget
 */
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

const ROOT = process.cwd();
const DRY_RUN = process.argv.includes("--dry-run");
const FORCE = process.argv.includes("--force");

/**
 * Per-directory rules. `maxWidth` is generous relative to real display size so
 * retina and OG-card crops stay sharp.
 */
const TARGETS = [
  {
    dir: "public/events",
    // Event covers render up to full-bleed on a large screen.
    maxWidth: 1600,
    format: "jpeg",
    quality: 75,
    // Anything past this is re-encoded even if already a JPEG of legal width.
    maxBytes: 600 * 1024,
    label: "event covers",
  },
  {
    dir: "public/executives",
    // Portraits are cut-outs with transparency, so they stay PNG — JPEG would
    // flatten the alpha to black. Largest real use is the 340px OG card.
    maxWidth: 800,
    format: "png",
    quality: 80,
    maxBytes: 250 * 1024,
    label: "executive portraits",
  },
  {
    dir: "public/collaborators",
    maxWidth: 1200,
    format: "keep",
    quality: 80,
    maxBytes: 250 * 1024,
    label: "partner logos",
  },
  {
    dir: "public/sponsors",
    maxWidth: 1200,
    format: "keep",
    quality: 80,
    maxBytes: 250 * 1024,
    label: "sponsor logos",
  },
  {
    dir: "public/contests",
    maxWidth: 1600,
    format: "keep",
    quality: 78,
    maxBytes: 500 * 1024,
    label: "contest photos",
  },
];

/** Standalone files that are oversized for how they are used. */
const SINGLE_FILES = [
  { file: "public/recruitment-banner.png", maxWidth: 1600, format: "keep", quality: 80, maxBytes: 400 * 1024 },
];

const IMAGE_RE = /\.(jpe?g|png|webp)$/i;
/** Files under this are left alone regardless of dimensions — nothing to win. */
const LEAVE_ALONE_BYTES = 40 * 1024;

/**
 * Records the digest of every file this script produced. Some images cannot be
 * squeezed under their byte budget no matter the settings; without this ledger
 * they would be re-encoded on every single build and lose quality each time.
 * A file whose digest is listed here is one we already did our best on.
 */
const MANIFEST = path.join(ROOT, "public", ".image-optimized.json");

const digest = (buffer) => crypto.createHash("sha1").update(buffer).digest("hex").slice(0, 16);

async function loadManifest() {
  try {
    return JSON.parse(await fs.readFile(MANIFEST, "utf8"));
  } catch {
    return {};
  }
}
const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;
const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;

async function walk(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (IMAGE_RE.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * Decides the container to encode into. `keep` preserves the real format, which
 * matters for anything carrying transparency; a PNG mislabelled `.jpg` is
 * normalised to a true JPEG only when the rule asks for one.
 */
function resolveFormat(rule, meta) {
  if (rule.format !== "keep") return rule.format;
  if (meta.format === "jpeg" || meta.format === "png" || meta.format === "webp") {
    return meta.format;
  }
  return meta.hasAlpha ? "png" : "jpeg";
}

function encode(pipeline, format, quality) {
  if (format === "png") {
    // Palette quantisation is what actually shrinks flat-ish PNG artwork, and
    // unlike JPEG it keeps the alpha channel intact.
    return pipeline.png({ quality, compressionLevel: 9, palette: true, effort: 8 });
  }
  if (format === "webp") return pipeline.webp({ quality, effort: 5 });
  return pipeline.jpeg({ quality, progressive: true, mozjpeg: true });
}

async function processFile(sharp, file, rule, manifest) {
  const key = path.relative(ROOT, file).split(path.sep).join("/");
  const bytes = await fs.readFile(file);
  const before = bytes.length;

  // Already produced by a previous run: leave it alone.
  if (!FORCE && manifest[key] === digest(bytes)) {
    return { file, skipped: true, before, after: before };
  }
  let meta;
  try {
    meta = await sharp(file).metadata();
  } catch (error) {
    return { file, skipped: true, corrupt: true, reason: error.message.slice(0, 60), before, after: before };
  }
  if (!meta.width || !meta.height) {
    return { file, skipped: true, corrupt: true, reason: "no dimensions", before, after: before };
  }

  const target = resolveFormat(rule, meta);
  const ext = path.extname(file).toLowerCase();
  const extFormat = ext === ".jpg" || ext === ".jpeg" ? "jpeg" : ext.slice(1);
  // A .jpg holding PNG bytes is why some "photos" weigh 38 MB.
  const mislabelled = rule.format !== "keep" && meta.format !== extFormat;

  const withinBudget =
    (before <= LEAVE_ALONE_BYTES && !mislabelled) ||
    (meta.width <= rule.maxWidth && before <= rule.maxBytes && meta.format === target && !mislabelled);

  if (withinBudget && !FORCE) {
    return { file, skipped: true, before, after: before };
  }

  if (DRY_RUN) {
    return { file, dryRun: true, before, after: before, meta, target };
  }

  let pipeline = sharp(file, { failOn: "none" }).rotate(); // honour EXIF orientation
  if (meta.width > rule.maxWidth) {
    pipeline = pipeline.resize({ width: rule.maxWidth, withoutEnlargement: true });
  }
  const buffer = await encode(pipeline, target, rule.quality).toBuffer();

  // If re-encoding cannot beat what is already on disk, keep the original.
  if (buffer.length >= before) {
    return { file, skipped: true, before, after: before, reason: "already optimal" };
  }

  // Write via a temp file so an interrupted build cannot leave a truncated image.
  const tmp = `${file}.tmp-${process.pid}`;
  await fs.writeFile(tmp, buffer);
  await fs.rename(tmp, file);
  manifest[key] = digest(buffer);

  return { file, before, after: buffer.length, width: meta.width, target };
}

async function main() {
  let sharp;
  try {
    ({ default: sharp } = await import("sharp"));
  } catch {
    // Never fail the build over an optional optimisation step.
    console.warn("[images] sharp unavailable — skipping optimisation");
    return;
  }

  const jobs = [];
  for (const rule of TARGETS) {
    const dir = path.join(ROOT, rule.dir);
    if (!existsSync(dir)) continue;
    for (const file of await walk(dir)) jobs.push({ file, rule });
  }
  for (const single of SINGLE_FILES) {
    const file = path.join(ROOT, single.file);
    if (existsSync(file)) jobs.push({ file, rule: single });
  }

  if (jobs.length === 0) {
    console.log("[images] nothing to process");
    return;
  }

  const manifest = await loadManifest();

  console.log(
    `[images] scanning ${jobs.length} files${DRY_RUN ? " (dry run)" : ""}${FORCE ? " (forced)" : ""}`
  );

  let before = 0, after = 0, changed = 0, skipped = 0;
  const corrupt = [];
  // Bounded concurrency: sharp is native and will happily exhaust memory on
  // 6000px sources if every file is decoded at once.
  const LIMIT = 4;
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(LIMIT, jobs.length) }, async () => {
      while (cursor < jobs.length) {
        const { file, rule } = jobs[cursor++];
        const r = await processFile(sharp, file, rule, manifest);
        before += r.before;
        after += r.after;
        if (r.corrupt) { corrupt.push(`${path.relative(ROOT, file)} (${r.reason})`); skipped++; continue; }
        if (r.skipped) { skipped++; continue; }
        changed++;
        if (r.dryRun) {
          console.log(`  would optimise ${path.relative(ROOT, file)} — ${r.meta.width}px ${r.meta.format} ${kb(r.before)}`);
        } else {
          console.log(
            `  ${path.relative(ROOT, file).padEnd(38)} ${kb(r.before).padStart(9)} -> ${kb(r.after).padStart(8)} (${r.target})`
          );
        }
      }
    })
  );

  if (!DRY_RUN && changed > 0) {
    await fs.writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  }

  console.log(
    `[images] ${changed} optimised, ${skipped} already within budget` +
      (DRY_RUN ? "" : ` — ${mb(before)} -> ${mb(after)} (saved ${mb(before - after)})`)
  );
  if (corrupt.length) {
    console.warn(`[images] ${corrupt.length} unreadable file(s), left untouched:`);
    for (const c of corrupt) console.warn(`  ${c}`);
  }
}

main().catch((error) => {
  // An optimisation failure must not block a deploy.
  console.error("[images] optimisation failed, continuing build:", error.message);
});
