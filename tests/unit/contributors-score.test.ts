import { describe, expect, it } from "vitest";
import { isAuthoredPath, isBot, isRealCommit, scoreContributors } from "@/lib/contributors/score";

describe("fair contributor score (75% lines, 25% real commits)", () => {
  it("80 tiny commits rank below 10 real commits with more code", () => {
    const ranked = scoreContributors([
      { login: "tiny-commits", commits: 80, realCommits: 5, additions: 300, deletions: 100 },
      { login: "real-work", commits: 10, realCommits: 10, additions: 4000, deletions: 800 },
    ]);
    expect(ranked.map((r) => r.login)).toEqual(["real-work", "tiny-commits"]);
    // 25 × √(10/10) + 75 × √(4400/4400) = 100 for the top contributor.
    expect(ranked[0]!.score).toBe(100);
  });

  it("lines weigh three times as much as commits, with diminishing returns", () => {
    const ranked = scoreContributors([
      { login: "many-small", commits: 80, realCommits: 80, additions: 800, deletions: 200 },
      { login: "few-large", commits: 20, realCommits: 20, additions: 30000, deletions: 5000 },
      { login: "newcomer", commits: 1, realCommits: 1, additions: 10, deletions: 0 },
    ]);
    // few-large: 25 × √(20/80) + 75 = 87.5; many-small: 25 + 75 × √(900/32500) ≈ 37.5.
    expect(ranked.map((r) => [r.login, r.score])).toEqual([["few-large", 87.5], ["many-small", 37.5], ["newcomer", 4.1]]);
  });

  it("a commit is real from 10 authored lines", () => {
    expect(isRealCommit({ additions: 9, deletions: 0 })).toBe(false);
    expect(isRealCommit({ additions: 8, deletions: 4 })).toBe(true);
  });

  it("ignores lockfiles, data dumps, images and seeds, and drops bots", () => {
    for (const p of ["bun.lock", "package-lock.json", "data/executives.json", "public/executives/a.png", "migrations/0002_governance_seed.sql", "lib/seo/logo-data.ts", "x/app.min.js"]) expect(isAuthoredPath(p)).toBe(false);
    for (const p of ["app/page.tsx", "lib/server/authz.ts", "migrations/0007_platform_v4.sql", "components/navbar.tsx"]) expect(isAuthoredPath(p)).toBe(true);
    for (const l of ["dependabot[bot]", "Copilot", "github-actions[bot]", "renovate-bot"]) expect(isBot(l)).toBe(true);
    expect(isBot("BakulBd")).toBe(false);
  });
});
