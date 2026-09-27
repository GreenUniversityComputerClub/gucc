/**
 * A fair order for the footer's contributors: commits and lines of code both count, with
 * diminishing returns so neither one huge commit nor many tiny ones dominates.
 *
 *   lines  = additions + ½ × deletions         (from authored files only; see EXCLUDED)
 *   score  = 40 × √(commits / most commits) + 60 × √(lines / most lines)     (0–100)
 *
 * Generated and bulk files (lockfiles, data dumps, images, seeds, reports) are excluded, and a
 * single commit counts at most 2,000 lines.
 */
export interface ContributionTotals {
  login: string;
  commits: number;
  additions: number;
  deletions: number;
}

export const COMMIT_WEIGHT = 40;
export const LINES_WEIGHT = 60;
export const MAX_LINES_PER_COMMIT = 2000;

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

export function scoreContributors<T extends ContributionTotals>(rows: T[]): Array<T & { score: number }> {
  const maxCommits = Math.max(1, ...rows.map((r) => r.commits));
  const maxLines = Math.max(1, ...rows.map(weightedLines));
  return rows
    .map((r) => ({
      ...r,
      score: Math.round((COMMIT_WEIGHT * Math.sqrt(r.commits / maxCommits) + LINES_WEIGHT * Math.sqrt(weightedLines(r) / maxLines)) * 10) / 10,
    }))
    .sort((a, b) => b.score - a.score || b.commits - a.commits || a.login.localeCompare(b.login));
}

/** Bots and automation accounts never appear. */
export const isBot = (login: string) => /\[bot\]$|bot$|^dependabot|copilot|github-actions|^actions-user$/i.test(login);

/** Secondary accounts counted under the person's main account. */
export const LOGIN_ALIASES: Record<string, string> = { "mahmudaakternadia-cmd": "mahmudaakternadia" };
