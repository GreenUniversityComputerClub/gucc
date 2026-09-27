import { NextResponse } from "next/server";
import { STATIC_CONTRIBUTORS, Contributor } from "@/data/contributors";
import { getPublicSetting } from "@/lib/public/data";
import { isBot, LOGIN_ALIASES, MAX_LINES_PER_COMMIT, scoreContributors } from "@/lib/contributors/score";

export const revalidate = 3600; // Cache for 1 hour

/**
 * Footer contributors, in a fair order (commits and lines of code; lib/contributors/score.ts).
 *   1. The ranking computed from the full git history, generated files excluded
 *      (scripts/platform/contributors.ts, stored in D1 as "site.contributors").
 *   2. Otherwise GitHub's contributor graph with the same formula (it can't exclude
 *      generated files, so each week counts at most a few commits' worth of lines).
 *   3. Otherwise the list shipped with the site.
 */
export async function GET() {
  try {
    const stored = await getPublicSetting<{ contributors?: Contributor[] }>("site.contributors").catch(() => null);
    if (stored?.contributors?.length) return NextResponse.json(stored.contributors);
    return NextResponse.json((await fromGitHubGraph()) ?? STATIC_CONTRIBUTORS);
  } catch {
    return NextResponse.json(STATIC_CONTRIBUTORS);
  }
}

type GraphItem = { author?: { id: number; login: string } | null; total?: number; weeks?: Array<{ a: number; d: number; c: number }> };

async function fromGitHubGraph(): Promise<Contributor[] | null> {
  const response = await fetch("https://github.com/GreenUniversityComputerClub/gucc/graphs/contributors-data", {
    headers: { Accept: "application/json", "User-Agent": "GUCC-Web-App" },
    next: { revalidate: 3600 },
  });
  if (!response.ok) return null;
  const raw = (await response.json()) as unknown;
  if (!Array.isArray(raw)) return null;

  const known = new Map(STATIC_CONTRIBUTORS.map((c) => [c.login.toLowerCase(), c]));
  const totals = new Map<string, { login: string; id: number; commits: number; additions: number; deletions: number }>();
  for (const item of raw as GraphItem[]) {
    const login = item?.author?.login;
    if (!login || isBot(login)) continue;
    const main = LOGIN_ALIASES[login.toLowerCase()] ?? login;
    const key = main.toLowerCase();
    const t = totals.get(key) ?? { login: main, id: item.author!.id, commits: 0, additions: 0, deletions: 0 };
    t.commits += item.total ?? 0;
    for (const w of item.weeks ?? []) {
      // Cap each week at MAX_LINES_PER_COMMIT per commit made that week.
      const cap = Math.max(1, w.c) * MAX_LINES_PER_COMMIT;
      const lines = w.a + w.d;
      const f = lines > cap ? cap / lines : 1;
      t.additions += Math.round(w.a * f);
      t.deletions += Math.round(w.d * f);
    }
    totals.set(key, t);
  }
  const ranked = scoreContributors([...totals.values()]).map((t): Contributor => {
    const k = known.get(t.login.toLowerCase());
    return {
      login: k?.login ?? t.login,
      name: k?.name ?? t.login,
      avatar_url: `https://avatars.githubusercontent.com/u/${t.id}?v=4`,
      html_url: `https://github.com/${k?.login ?? t.login}`,
      contributions: t.commits,
      additions: t.additions,
      deletions: t.deletions,
      score: t.score,
    };
  });
  // Known club contributors outside the graph's window still appear, after the ranked ones.
  for (const s of STATIC_CONTRIBUTORS) if (!totals.has(s.login.toLowerCase())) ranked.push(s);
  return ranked.length ? ranked : null;
}
