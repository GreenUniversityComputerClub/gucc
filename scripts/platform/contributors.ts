/**
 * Compute the footer's contributor ranking from the full git history (commits and lines of
 * authored code; see lib/contributors/score.ts) and, with --apply, store it in D1 as the public
 * setting "site.contributors", which /api/contributors serves.
 *
 *   bun scripts/platform/contributors.ts                       print the ranking
 *   bun scripts/platform/contributors.ts --by-email            offline: totals per author email
 *   bun scripts/platform/contributors.ts --out ranking.json    also write it to a file
 *   bun scripts/platform/contributors.ts --write-static        refresh data/contributors.ts (the site's fallback list)
 *   bun scripts/platform/contributors.ts --apply --target production --confirm-production
 *
 * GitHub logins and avatars come from noreply addresses or the GitHub API (GITHUB_TOKEN, or
 * unauthenticated with a low rate limit). Needs the full history (fetch-depth: 0 in CI).
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { STATIC_CONTRIBUTORS } from "../../data/contributors";
import { FORMULA, isAuthoredPath, isBot, isRealCommit, LOGIN_ALIASES, MAX_LINES_PER_COMMIT, scoreContributors } from "../../lib/contributors/score";
import { assertProductionConfirmed, d1ExecuteFile, parseTarget } from "./lib/wrangler";

const argv = process.argv.slice(2);
const REPO = process.env.GITHUB_REPOSITORY || "GreenUniversityComputerClub/gucc";
const token = process.env.GITHUB_TOKEN;

type Commit = { sha: string; email: string; name: string; additions: number; deletions: number };

function readHistory(): Commit[] {
  const out = execFileSync("git", ["log", "--no-merges", "--numstat", "--format=@@%H%x09%aE%x09%aN"], { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 });
  const commits: Commit[] = [];
  let current: Commit | null = null;
  for (const line of out.split("\n")) {
    if (line.startsWith("@@")) {
      const [sha, email, name] = line.slice(2).split("\t");
      current = { sha: sha!, email: (email ?? "").toLowerCase(), name: name ?? "", additions: 0, deletions: 0 };
      commits.push(current);
    } else if (current && line.trim()) {
      const [a, d, file] = line.split("\t");
      // Binary files show "-"; renames show "old => new" (the new path decides).
      if (a === "-" || !file) continue;
      const target = file.includes("=>") ? file.replace(/\{[^}]*=> ([^}]*)\}/, "$1").replace(/^.* => /, "") : file;
      if (!isAuthoredPath(target)) continue;
      current.additions += Number(a) || 0;
      current.deletions += Number(d) || 0;
    }
  }
  // One dump can't dominate: a commit counts at most MAX_LINES_PER_COMMIT lines.
  for (const c of commits) {
    const total = c.additions + c.deletions;
    if (total > MAX_LINES_PER_COMMIT) {
      c.additions = Math.round((c.additions / total) * MAX_LINES_PER_COMMIT);
      c.deletions = MAX_LINES_PER_COMMIT - c.additions;
    }
  }
  return commits;
}

type Account = { login: string; id: number | null; avatar: string };
const accounts = new Map<string, Account | null>();

/** Up to this many commits per email are tried on GitHub before the email is given up on. */
const TRIES_PER_EMAIL = 6;

async function lookup(sha: string): Promise<Account | null> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/commits/${sha}`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "gucc-contributors", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (res.ok) {
    const body = (await res.json()) as { author?: { login: string; id: number; avatar_url: string } | null };
    return body.author ? { login: body.author.login, id: body.author.id, avatar: `https://avatars.githubusercontent.com/u/${body.author.id}?v=4` } : null;
  }
  if (res.status === 403 || res.status === 429) throw new Error("GitHub API rate limit reached. Set GITHUB_TOKEN and run again.");
  // 404/422: this commit isn't on GitHub (yet): a release runs before the branch is pushed.
  return null;
}

/**
 * The GitHub account behind an author email: from a noreply address, else from GitHub for one of
 * that email's commits. The oldest commits are tried first (the newest may not be pushed yet:
 * looking up only the newest once dropped every commit of an author whose latest work was local),
 * then, failing GitHub, the author's name matched against the club's known contributors.
 */
async function accountFor(c: Commit, shasForEmail: string[]): Promise<Account | null> {
  if (accounts.has(c.email)) return accounts.get(c.email)!;
  let found: Account | null = null;
  const noreply = c.email.match(/^(?:(\d+)\+)?([^@]+)@users\.noreply\.github\.com$/);
  if (noreply) found = { login: noreply[2]!, id: noreply[1] ? Number(noreply[1]) : null, avatar: noreply[1] ? `https://avatars.githubusercontent.com/u/${noreply[1]}?v=4` : `https://github.com/${noreply[2]}.png` };
  for (const sha of found ? [] : shasForEmail.slice(0, TRIES_PER_EMAIL)) {
    found = await lookup(sha);
    if (found) break;
  }
  if (!found) {
    const known = STATIC_CONTRIBUTORS.find((k) => k.name.toLowerCase() === c.name.toLowerCase() || k.login.toLowerCase() === c.name.toLowerCase());
    if (known) found = { login: known.login, id: null, avatar: known.avatar_url };
  }
  accounts.set(c.email, found);
  return found;
}

const commits = readHistory();
if (argv.includes("--by-email")) {
  // Offline check of the history parsing (no GitHub API): totals per author email.
  const byEmail = new Map<string, { email: string; commits: number; additions: number; deletions: number }>();
  for (const c of commits) {
    const t = byEmail.get(c.email) ?? { email: c.email.replace(/^(.{3}).*(@.*)$/, "$1…$2"), commits: 0, additions: 0, deletions: 0 };
    t.commits++;
    t.additions += c.additions;
    t.deletions += c.deletions;
    byEmail.set(c.email, t);
  }
  console.table([...byEmail.values()].sort((a, b) => b.commits - a.commits));
  process.exit(0);
}
const totals = new Map<string, { login: string; avatar: string; commits: number; realCommits: number; additions: number; deletions: number }>();
let unmatched = 0;
// Each email's commits, oldest first (git log lists the newest first).
const shasByEmail = new Map<string, string[]>();
for (const c of [...commits].reverse()) shasByEmail.set(c.email, [...(shasByEmail.get(c.email) ?? []), c.sha]);
for (const c of commits) {
  const acct = await accountFor(c, shasByEmail.get(c.email) ?? [c.sha]);
  if (!acct) {
    unmatched++;
    continue;
  }
  const login = LOGIN_ALIASES[acct.login.toLowerCase()] ?? acct.login;
  if (isBot(login)) continue;
  const key = login.toLowerCase();
  const t = totals.get(key) ?? { login, avatar: acct.avatar, commits: 0, realCommits: 0, additions: 0, deletions: 0 };
  t.commits += 1;
  if (isRealCommit(c)) t.realCommits += 1;
  t.additions += c.additions;
  t.deletions += c.deletions;
  totals.set(key, t);
}

const names = new Map(STATIC_CONTRIBUTORS.map((s) => [s.login.toLowerCase(), s]));
const ranked = scoreContributors([...totals.values()]).map((t) => {
  const known = names.get(t.login.toLowerCase());
  return {
    login: known?.login ?? t.login,
    name: known?.name ?? t.login,
    avatar_url: known?.avatar_url ?? t.avatar,
    html_url: `https://github.com/${known?.login ?? t.login}`,
    contributions: t.commits,
    realCommits: t.realCommits,
    additions: t.additions,
    deletions: t.deletions,
    score: t.score,
  };
});

console.table(ranked.map((r) => ({ login: r.login, commits: r.contributions, real: r.realCommits, added: r.additions, deleted: r.deletions, score: r.score })));
if (unmatched) console.log(`${unmatched} commits have no GitHub account linked and are not counted.`);

// The list shipped with the site (used when the database has no ranking yet), in the same fair order.
if (argv.includes("--write-static")) {
  const file = path.join(process.cwd(), "data", "contributors.ts");
  const source = readFileSync(file, "utf8");
  const start = source.indexOf("export const STATIC_CONTRIBUTORS");
  if (start < 0) throw new Error("data/contributors.ts has no STATIC_CONTRIBUTORS.");
  // Everything before the list, minus the list's own doc comment (rewritten below).
  const before = source.slice(0, start);
  const doc0 = before.lastIndexOf("/**");
  const header = doc0 >= 0 && /^\/\*\*[^]*\*\/\s*$/.test(before.slice(doc0)) ? before.slice(0, doc0) : before;
  const doc = `/**\n * GUCC contributors in the site's fair order (${FORMULA}).\n * Generated by scripts/platform/contributors.ts --write-static from the full git history; bots excluded.\n */\n`;
  writeFileSync(file, `${header}${doc}export const STATIC_CONTRIBUTORS: Contributor[] = ${JSON.stringify(ranked, null, 2)};\n`);
  console.log(`Wrote ${ranked.length} contributors to data/contributors.ts.`);
}

const outIdx = argv.indexOf("--out");
if (outIdx >= 0 && argv[outIdx + 1]) writeFileSync(argv[outIdx + 1]!, `${JSON.stringify(ranked, null, 2)}\n`);

if (argv.includes("--apply")) {
  const target = parseTarget(argv);
  assertProductionConfirmed(target, argv, "update the contributor ranking");
  if (ranked.length === 0) throw new Error("No contributors found; refusing to store an empty ranking.");
  const value = JSON.stringify({ updatedAt: new Date().toISOString(), formula: FORMULA, contributors: ranked });
  const sql = `INSERT INTO organization_settings (key, value_json, is_public, description, updated_at) VALUES ('site.contributors', '${value.replace(/'/g, "''")}', 1, 'Footer contributors, ranked by commits and lines of code (written by scripts/platform/contributors.ts).', strftime('%Y-%m-%dT%H:%M:%fZ','now'))
ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at;\n`;
  const file = path.join(mkdtempSync(path.join(tmpdir(), "gucc-contributors-")), "contributors.sql");
  writeFileSync(file, sql);
  if (!d1ExecuteFile(target, file)) throw new Error("Writing the ranking to D1 failed.");
  console.log(`Stored ${ranked.length} contributors in ${target} (site.contributors).`);
}
