/**
 * Every link a notification (or email copy) can carry points at a page that exists, so opening
 * a notice never lands on a 404.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { safeNotificationLink } from "@/lib/server/services/community";

const ROOT = process.cwd();

function files(dir: string, test: (f: string) => boolean): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? files(p, test) : test(p) ? [p] : [];
  });
}

/** App Router pages and route handlers as matchers ("[id]" matches one segment, "[...x]" the rest). */
function routes(): RegExp[] {
  const app = path.join(ROOT, "app");
  return files(app, (f) => /\/(page\.tsx|route\.ts)$/.test(f)).map((f) => {
    const segs = path.relative(app, path.dirname(f)).split(path.sep).filter((s) => s && !/^\(.*\)$/.test(s));
    const re = segs.map((s) => (s.startsWith("[...") ? ".+" : s.startsWith("[") ? "[^/]+" : s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).join("/");
    return new RegExp(`^/${re}$`);
  });
}

/** Links written in notification inputs across the services. */
function notificationLinks(): Array<{ file: string; link: string }> {
  const out: Array<{ file: string; link: string }> = [];
  for (const f of files(path.join(ROOT, "lib/server"), (x) => x.endsWith(".ts"))) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/\blink:\s*(?:"([^"]+)"|`([^`]+)`)/g)) {
      const raw = (m[1] ?? m[2])!;
      if (!raw.startsWith("/")) continue;
      out.push({ file: path.relative(ROOT, f), link: raw });
    }
  }
  return out;
}

describe("notification links", () => {
  it("all point at pages that exist", () => {
    const table = routes();
    const links = notificationLinks();
    expect(links.length).toBeGreaterThan(30);
    const broken = links.filter(({ link }) => {
      // Template parts stand for one path segment; queries and fragments don't change the page.
      const p = link.replace(/\$\{[^}]+\}/g, "x").split(/[?#]/)[0]!.replace(/\/+$/, "") || "/";
      return !table.some((re) => re.test(p));
    });
    expect(broken).toEqual([]);
  });

  it("never leave the site", () => {
    expect(safeNotificationLink("/dashboard/tasks/1")).toBe("/dashboard/tasks/1");
    expect(safeNotificationLink("https://evil.example/x")).toBe("/dashboard/notifications");
    expect(safeNotificationLink("//evil.example/x")).toBe("/dashboard/notifications");
    expect(safeNotificationLink("/\\evil.example")).toBe("/dashboard/notifications");
    expect(safeNotificationLink(null)).toBe("/dashboard/notifications");
  });
});
