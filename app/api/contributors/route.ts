import { NextResponse } from "next/server";
import { STATIC_CONTRIBUTORS, type Contributor } from "@/data/contributors";
import { getPublicSetting } from "@/lib/public/data";

export const revalidate = 3600; // Cache for 1 hour

/**
 * Footer contributors, in a fair order (75% lines of code, 25% real commits;
 * lib/contributors/score.ts):
 *   1. The ranking computed from the full git history at each API release, generated files
 *      excluded (scripts/platform/contributors.ts --apply, stored in D1 as "site.contributors").
 *   2. Otherwise the same ranking shipped with the site (data/contributors.ts, --write-static).
 * GitHub's own contributor graph isn't used: it counts every file, generated ones included.
 */
export async function GET() {
  const stored = await getPublicSetting<{ contributors?: Contributor[] }>("site.contributors").catch(() => null);
  return NextResponse.json(stored?.contributors?.length ? stored.contributors : STATIC_CONTRIBUTORS);
}
