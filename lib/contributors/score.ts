/**
 * A fair order for the footer's contributors: the code people wrote counts most, and the number
 * of real commits counts too, with diminishing returns so neither one huge commit nor many tiny
 * ones dominates.
 *
 *   lines        = additions + ½ × deletions   (authored files only; see EXCLUDED)
 *   real commits = commits that change at least 10 such lines (typo fixes and one-liners don't
 *                  add up to a high rank)
 *   score        = 25 × √(real commits / most) + 75 × √(lines / most)      (0–100)
 *
 * Generated and bulk files (lockfiles, data dumps, images, seeds, reports) are excluded, and a
 * single commit counts at most 2,000 lines.
 */
export interface ContributionTotals {
  login: string;
  /** Every commit (shown for reference). */
  commits: number;
  /** Commits with at least MIN_LINES_PER_COMMIT authored lines; ranks by these when given. */
  realCommits?: number;
  additions: number;
  deletions: number;
}

export const COMMIT_WEIGHT = 25;
export const LINES_WEIGHT = 75;
export const MIN_LINES_PER_COMMIT = 10;
export const MAX_LINES_PER_COMMIT = 2000;
export const FORMULA = "75% lines of code (additions + half of deletions) and 25% real commits (10+ lines each), square-root scaled; generated files excluded";

/** Paths that aren't hand-written code or content. */
export const EXCLUDED = [
  /(^|\/)(bun\.lockb?|package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/,
  /^data\//, /^public\//, /^migration\//, /^\.e2e\//, /^docs\/.*report/i,
  /^migrations\/.*seed.*\.sql$/,
  /\.(png|jpe?g|gif|webp|avif|ico|svg|pdf|ttf|otf|woff2?|mp4|zip)$/i,
  /\.min\.(js|css)$/, /(^|\/)(dist|build|\.next)\//,
  /^lib\/seo\/logo-data\.ts$/,
];

export const isAuthoredPath = (path: string) => !EXCLUDED.some((re) => re.test(path));

export const weightedLines = (t: Pick<ContributionTotals, "additions" | "deletions">) => t.additions + 0.5 * t.deletions;

/** Whether one commit is a real one (enough authored lines to count). */
export const isRealCommit = (c: Pick<ContributionTotals, "additions" | "deletions">) => weightedLines(c) >= MIN_LINES_PER_COMMIT;

export function scoreContributors<T extends ContributionTotals>(rows: T[]): Array<T & { score: number }> {
  const counted = (r: T) => r.realCommits ?? r.commits;
  const maxCommits = Math.max(1, ...rows.map(counted));
  const maxLines = Math.max(1, ...rows.map(weightedLines));
  return rows
    .map((r) => ({
      ...r,
      score: Math.round((COMMIT_WEIGHT * Math.sqrt(counted(r) / maxCommits) + LINES_WEIGHT * Math.sqrt(weightedLines(r) / maxLines)) * 10) / 10,
    }))
    .sort((a, b) => b.score - a.score || weightedLines(b) - weightedLines(a) || a.login.localeCompare(b.login));
}

/** Bots and automation accounts never appear. */
export const isBot = (login: string) => /\[bot\]$|bot$|^dependabot|copilot|github-actions|^actions-user$/i.test(login);

/** Secondary accounts counted under the person's main account. */
export const LOGIN_ALIASES: Record<string, string> = { "mahmudaakternadia-cmd": "mahmudaakternadia" };
