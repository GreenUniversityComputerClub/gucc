/**
 * Authorization architecture guard: decisions come from the chain
 *   User → Role / Position / Direct grant → Permission → Scope → Rules → Approval → decision
 * (lib/governance/engine.ts), never from comparing role or position names in a service. Renaming
 * a position or moving a permission in the dashboard must change who can do what, with no code
 * change. This test fails when a service, view or API route checks a name directly.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
/** Where names may be compared: the engine (with its approval matching), the invariants, and where the subject is built. */
const ALLOWED = new Set(["lib/governance/engine.ts", "lib/governance/approval.ts", "lib/governance/invariants.ts", "lib/server/authz.ts"]);
const NAMES = "moderator|president|general-secretary|vice-president[a-z-]*|developer|executive|unit-executive|member|administrator|treasurer|[a-z]+-secretary";

const PATTERNS: Array<[RegExp, string]> = [
  [/\.roles\.(includes|some|find|indexOf|filter)\(/, "reads the role list directly"],
  [new RegExp(`\\.positions\\.(includes|some|find|filter)\\([^)]*["'\`](${NAMES})["'\`]`), "looks for a named position"],
  [new RegExp(`(key|role|position|roleKey|positionKey)\\s*===?\\s*["'\`](${NAMES})["'\`]`), "compares a role or position name"],
  [new RegExp(`["'\`](${NAMES})["'\`]\\s*===?\\s*[a-zA-Z_.]*(key|role|position)\\b`), "compares a role or position name"],
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(p) ? [p] : [];
  });
}

describe("authorization architecture", () => {
  it("no service, view or API route decides by role or position name", () => {
    // Pages may describe the built-in roles in words ("Moderators hold every permission"); what a
    // page shows or allows comes from the capabilities the API computed.
    const scanned = [...files(path.join(ROOT, "lib/server")), ...files(path.join(ROOT, "lib/governance")), ...files(path.join(ROOT, "workers/api/src")), ...files(path.join(ROOT, "app/api"))];
    const offences: string[] = [];
    for (const f of scanned) {
      const rel = path.relative(ROOT, f);
      if (ALLOWED.has(rel)) continue;
      readFileSync(f, "utf8").split("\n").forEach((line, i) => {
        if (/^\s*(\/\/|\*)/.test(line)) return;
        for (const [re, why] of PATTERNS) if (re.test(line)) offences.push(`${rel}:${i + 1} ${why}: ${line.trim().slice(0, 120)}`);
      });
    }
    expect(offences).toEqual([]);
  });
});
