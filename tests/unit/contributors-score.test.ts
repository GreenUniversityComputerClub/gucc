import { describe, expect, it } from "vitest";
import { isAuthoredPath, isBot, scoreContributors } from "@/lib/contributors/score";

describe("fair contributor score", () => {
  it("counts both commits and lines, with diminishing returns", () => {
    const ranked = scoreContributors([
      { login: "many-small", commits: 80, additions: 800, deletions: 200 },
      { login: "few-large", commits: 20, additions: 30000, deletions: 5000 },
      { login: "balanced", commits: 50, additions: 15000, deletions: 3000 },
      { login: "newcomer", commits: 1, additions: 10, deletions: 0 },
    ]);
    // 40 × √(20/80) + 60 × √(32500/32500) = 80; 40 × √(50/80) + 60 × √(16500/32500) ≈ 74.4; 40 + 60 × √(900/32500) ≈ 50.
    expect(ranked.map((r) => [r.login, r.score])).toEqual([["few-large", 80], ["balanced", 74.4], ["many-small", 50], ["newcomer", 5.5]]);
    expect(ranked[0].score).toBeLessThanOrEqual(100);
    expect(ranked.at(-1)!.score).toBeGreaterThan(0);
  });

  it("ignores lockfiles, data dumps, images and seeds, and drops bots", () => {
    for (const p of ["bun.lock", "package-lock.json", "data/executives.json", "public/executives/a.png", "migrations/0002_governance_seed.sql", "lib/seo/logo-data.ts", "x/app.min.js"]) expect(isAuthoredPath(p)).toBe(false);
    for (const p of ["app/page.tsx", "lib/server/authz.ts", "migrations/0007_platform_v4.sql", "components/navbar.tsx"]) expect(isAuthoredPath(p)).toBe(true);
    for (const l of ["dependabot[bot]", "Copilot", "github-actions[bot]", "renovate-bot"]) expect(isBot(l)).toBe(true);
    expect(isBot("BakulBd")).toBe(false);
  });
});
