import { NextResponse } from "next/server";
import { STATIC_CONTRIBUTORS, Contributor } from "@/data/contributors";

export const revalidate = 3600; // Cache for 1 hour

export async function GET() {
  try {
    // Attempt to fetch from GitHub's contributors graph data endpoint (no strict unauth rate-limit)
    const response = await fetch(
      "https://github.com/GreenUniversityComputerClub/gucc/graphs/contributors-data",
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "GUCC-Web-App",
        },
        next: { revalidate: 3600 },
      }
    );

    if (!response.ok) {
      return NextResponse.json(STATIC_CONTRIBUTORS);
    }

    const rawData = await response.json();

    if (!Array.isArray(rawData)) {
      return NextResponse.json(STATIC_CONTRIBUTORS);
    }

    const nameMap = new Map<string, string>(
      STATIC_CONTRIBUTORS.map((c) => [c.login.toLowerCase(), c.name])
    );

    const contributorsMap = new Map<string, Contributor>();

    for (const item of rawData) {
      const login = item?.author?.login;
      if (!login) continue;

      const lowerLogin = login.toLowerCase();

      // Skip automated bot accounts
      if (
        lowerLogin.includes("bot") ||
        lowerLogin.includes("copilot") ||
        lowerLogin.includes("action")
      ) {
        continue;
      }

      // Map any secondary/cmd accounts to main account if applicable
      const targetLogin =
        lowerLogin === "mahmudaakternadia-cmd" ? "mahmudaakternadia" : login;
      const key = targetLogin.toLowerCase();

      const existing = contributorsMap.get(key);
      const contributions = (item.total || 0) + (existing?.contributions || 0);

      contributorsMap.set(key, {
        login: targetLogin,
        name: nameMap.get(key) || targetLogin,
        avatar_url: `https://avatars.githubusercontent.com/u/${item.author.id}?v=4`,
        html_url: `https://github.com/${targetLogin}`,
        contributions,
      });
    }

    // Ensure all known GUCC contributors are included even if not in the current window
    for (const staticC of STATIC_CONTRIBUTORS) {
      const key = staticC.login.toLowerCase();
      if (!contributorsMap.has(key)) {
        contributorsMap.set(key, staticC);
      }
    }

    const contributors = Array.from(contributorsMap.values()).sort(
      (a, b) => b.contributions - a.contributions
    );

    return NextResponse.json(contributors);
  } catch {
    return NextResponse.json(STATIC_CONTRIBUTORS);
  }
}
