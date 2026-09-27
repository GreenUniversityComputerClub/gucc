import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Issue, TransformResult } from "../../../lib/migration/transform";

interface ReportContext {
  runId: string;
  started: string;
  target: string;
  mode: string;
  backupDir: string;
  sources: {
    executives: unknown[];
    events: unknown[];
    contests: { contests: unknown[] };
    forms: unknown[];
    hacktheai: unknown[];
    blogPosts: unknown[];
    mediaFiles: Array<{ path: string; size: number }>;
  };
}

const MAPPING: Array<[string, string]> = [
  ["data/executives.json (committee years)", "committees (layout_json keeps campus/wing structure)"],
  ["data/executives.json (people)", "profiles (one per person: student ID, else faculty/name identity)"],
  ["data/executives.json (listings)", "committee_members → positions (legacy title kept in position_title)"],
  ["data/executives.json (avatarUrl, avatarPosition, avatarScale)", "media + per-term crop on committee_members"],
  ["data/events.json", "events, categories(kind=EVENT), event_people (guests, judges), event_media (banner)"],
  ["data/contests.json", "contests, contest_teams, contest_media"],
  ["app/blog custom posts", "posts, categories(kind=POST), tags, post_tags, post_revisions"],
  ["data/forms.json", "external_forms"],
  ["data/hacktheaiteam.json", "certificate_programs, certificate_recipients (private)"],
  ["data/sponsors.json", "organization_settings[page.sponsorship]"],
  ["data/predefined.json", "organization_settings[chatbot.knowledge]"],
  ["data/collaborations.ts", "organization_settings[legacy.featured_collaborations]"],
  ["partner clubs (collaboration-scroll.tsx, collaborations/page.tsx)", "organization_settings[page.collaborations]"],
  ["lib/lost-found/config.ts", "organization_settings[lostfound.config]; adminEmails → lostfound.moderate permission"],
  ["public/{events,executives,contests,blog,collaborators,sponsors,certificates}", "media (storage=STATIC until scripts/platform/media.ts moves them to R2)"],
];

const NOT_MIGRATED: Array<[string, string, string]> = [
  ["Supabase (accounts, lost & found posts, storage)", "Out of scope by decision: only data kept in this repository is migrated.",
    "Accounts are created fresh by registering on the new site; the lost & found board starts empty."],
  ["Hashnode blog posts", "Out of scope by decision (external; the old site did not show them because HASHNODE_HOST was unset).", "None."],
  ["data/contributors.ts", "Application configuration (a fallback for the GitHub contributors API), not club data.", "Kept in code."],
  ["app/scheduler/data/courses.ts", "Dataset for the course-routine planner tool, not club records.", "Kept in code."],
  ["Social links, site name, address (lib/seo/site.ts)", "Site configuration used for SEO metadata.", "Kept in code."],
];

function table(rows: string[][]): string {
  const [head, ...body] = rows;
  return [`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...body.map((r) => `| ${r.join(" | ")} |`)].join("\n");
}

const esc = (s: unknown) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");

function issueLine(i: Issue): string {
  const detail = Object.entries(i.detail)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : v}`)
    .join("; ");
  return `- **${esc(i.entity)} · ${esc(i.key)}** — ${esc(detail)}. _${esc(i.resolution)}_`;
}

export function writeReports(result: TransformResult, ctx: ReportContext): string[] {
  const dir = path.join(process.cwd(), "migration", "reports");
  mkdirSync(dir, { recursive: true });

  const json = {
    runId: ctx.runId,
    started: ctx.started,
    target: ctx.target,
    mode: ctx.mode,
    counts: result.counts,
    expectedRows: result.expectedRows,
    positionMappings: result.positionMappings,
    issues: result.issues,
    sourceMapEntries: result.sourceMap.length,
  };
  const jsonFile = path.join(dir, "migration-report.json");
  writeFileSync(jsonFile, `${JSON.stringify(json, null, 2)}\n`);

  const by = (kind: Issue["kind"]) => result.issues.filter((i) => i.kind === kind);
  const mediaBytes = ctx.sources.mediaFiles.reduce((n, f) => n + f.size, 0);
  const md: string[] = [
    "# Legacy data migration report",
    "",
    `Run \`${ctx.runId}\` · ${ctx.started} · target **${ctx.target}** · mode ${ctx.mode}`,
    "",
    "Private values (phone numbers, participant emails) are masked in this report. The generated SQL and the source backup",
    `(\`${ctx.backupDir}\`) contain them and are git-ignored.`,
    "",
    "## Summary",
    "",
    table([
      ["Entity", "Source", "Migrated", "Merged", "Skipped", "Failed", "Duplicates", "Conflicts"],
      ...Object.entries(result.counts).map(([k, c]) => [k, c.source, c.migrated, c.merged, c.skipped, c.failed, c.duplicates, c.conflicts].map(String)),
    ]),
    "",
    "Merged means the record was folded into another one (reason listed under duplicates). Every source record is accounted for:",
    "source = migrated + merged + skipped + failed.",
    "",
    "## Source inventory",
    "",
    table([
      ["Source", "Records"],
      ["data/executives.json", `${ctx.sources.executives.length} committee years`],
      ["data/events.json", `${ctx.sources.events.length} events`],
      ["data/contests.json", `${ctx.sources.contests.contests.length} contests`],
      ["data/forms.json", `${ctx.sources.forms.length} forms`],
      ["data/hacktheaiteam.json", `${ctx.sources.hacktheai.length} teams`],
      ["app/blog custom posts", `${ctx.sources.blogPosts.length} post`],
      ["data/sponsors.json, data/predefined.json, data/collaborations.ts, lib/lost-found/config.ts, partner clubs", "5 settings documents"],
      ["public/ media", `${ctx.sources.mediaFiles.length} files, ${(mediaBytes / 1024 / 1024).toFixed(1)} MB`],
    ]),
    "",
    "### Sources not migrated automatically",
    "",
    table([["Source", "Why", "What to do"], ...NOT_MIGRATED.map((r) => r.map(esc))]),
    "",
    "## Source → target mapping",
    "",
    table([["Source", "Target"], ...MAPPING.map((r) => r.map(esc))]),
    "",
    "## Position title mapping",
    "",
    "Legacy titles are kept verbatim for display; the mapping only decides which configurable position (and so which default permissions) an assignment carries.",
    "",
    table([["Legacy title", "Position", "Matched by", "Listings"], ...result.positionMappings.map((m) => [esc(m.title), m.positionKey, m.via, String(m.occurrences)])]),
    "",
    `## Conflicts (${by("CONFLICT").length})`,
    "",
    ...(by("CONFLICT").length ? by("CONFLICT").map(issueLine) : ["None."]),
    "",
    `## Duplicates (${by("DUPLICATE").length})`,
    "",
    ...(by("DUPLICATE").length ? by("DUPLICATE").map(issueLine) : ["None."]),
    "",
    `## Skipped (${by("SKIPPED").length}) and failed (${by("FAILED").length})`,
    "",
    ...([...by("SKIPPED"), ...by("FAILED")].length ? [...by("SKIPPED"), ...by("FAILED")].map(issueLine) : ["None."]),
    "",
    `## Notes for review (${by("NOTE").length})`,
    "",
    ...by("NOTE").map(issueLine),
    "",
  ];
  const mdFile = path.join(dir, "MIGRATION_REPORT.md");
  writeFileSync(mdFile, md.join("\n"));
  return [mdFile, jsonFile];
}
