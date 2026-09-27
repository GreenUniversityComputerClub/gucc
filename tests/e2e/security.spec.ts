import { expect, test } from "@playwright/test";
import { d1, login, MODERATOR } from "./helpers";

const API = process.env.E2E_API_URL ?? "http://localhost:8788";

test("the API refuses anything but the frontend", async ({ request }) => {
  expect((await request.get(`${API}/health`)).status()).toBe(200);
  expect((await request.get(`${API}/v1/public/committees`)).status()).toBe(401);
  expect((await request.post(`${API}/v1/rpc/members.list`, { data: { input: {} } })).status()).toBe(401);
  expect((await request.post(`${API}/v1/upload`, { headers: { Origin: "https://evil.example" } })).status()).toBe(403);
  expect((await request.get(`${API}/media/..%2f..%2fwrangler.jsonc`)).status()).toBe(404);
});

test("the site's own endpoints reject cross-site and anonymous abuse", async ({ request }) => {
  expect((await request.post("/api/lost-found", { headers: { Origin: "https://evil.example" }, data: { title: "x" } })).status()).toBe(403);
  // Anonymous export: refused (unknown ids are indistinguishable from forbidden ones).
  expect([401, 403, 404]).toContain((await request.get("/api/admin/events/x/registrations")).status());
  expect((await request.post("/api/revalidate", { data: { tags: ["events"] } })).status()).toBe(401);
  const session = await (await request.get("/api/session")).json();
  expect(session).toEqual({ signedIn: false });
});

test("search inputs are not injectable and pages set safe headers", async ({ page }) => {
  const res = await page.goto("/events?q=%27%20OR%201%3D1%20--");
  expect(res?.status()).toBe(200);
  expect(res?.headers()["x-content-type-options"]).toBe("nosniff");
  const admin = await page.request.get("/auth/login");
  expect(admin.headers()["x-frame-options"]).toBe("DENY");
});

test("SEO: titles, canonicals, structured data, OG cards and sitemap", async ({ page, request }) => {
  const seen = new Set<string>();
  for (const path of ["/", "/executives/2026", "/events", "/blog", "/contests"]) {
    await page.goto(path);
    const title = await page.title();
    expect(title.length).toBeGreaterThan(10);
    expect(seen.has(title)).toBe(false);
    seen.add(title);
    const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
    expect(canonical).toMatch(/^https?:\/\//);
    for (const s of await page.locator('script[type="application/ld+json"]').allTextContents()) expect(() => JSON.parse(s)).not.toThrow();
    const og = await page.locator('meta[property="og:image"]').first().getAttribute("content");
    expect(og).toBeTruthy();
  }
  // Cards the site links to are rendered; made-up ones get the static card (no CPU spent).
  await page.goto("/");
  const signed = new URL((await page.locator('meta[property="og:image"]').first().getAttribute("content"))!);
  const card = await request.get(`${signed.pathname}${signed.search}`);
  expect(card.status()).toBe(200);
  expect(card.headers()["content-type"]).toBe("image/png");
  if (signed.searchParams.get("s")) {
    const forged = await request.get("/api/og?title=Anything%20I%20like", { maxRedirects: 0 });
    expect(forged.status()).toBe(302);
    expect(forged.headers()["location"]).toMatch(/\/og-default\.png$/);
  }
  const sitemap = await (await request.get("/sitemap.xml")).text();
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  expect(urls.length).toBeGreaterThan(100);
  expect(new Set(urls).size).toBe(urls.length);
});

test("anonymous visitors never ask who is signed in (no function call per page view)", async ({ page }) => {
  await page.context().clearCookies();
  const calls: string[] = [];
  page.on("request", (r) => r.url().includes("/api/session") && calls.push(r.url()));
  for (const path of ["/", "/events", "/executives", "/lost-found"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle").catch(() => {});
  }
  expect(calls).toEqual([]);
});

test("a server action replayed from another site is refused and changes nothing", async ({ page }) => {
  await login(page, MODERATOR.email, MODERATOR.password, "/dashboard/health");
  const before = d1<{ value_json: string }>("SELECT value_json FROM system_settings WHERE key = 'media.uploads_enabled'")[0]!.value_json;
  test.skip(before !== "true", "Uploads are already off in this database.");
  // Capture the real request the "Switch uploads off" button sends, without letting it through.
  let captured: { url: string; headers: Record<string, string>; body: Buffer | null } | null = null;
  await page.route("**/dashboard/health**", async (route) => {
    const req = route.request();
    if (req.method() === "POST" && req.headers()["next-action"]) {
      captured = { url: req.url(), headers: req.headers(), body: req.postDataBuffer() };
      return route.abort();
    }
    return route.continue();
  });
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Switch uploads off" }).click();
  await expect.poll(() => captured !== null).toBe(true);
  await page.unroute("**/dashboard/health**");
  const c = captured as unknown as { url: string; headers: Record<string, string>; body: Buffer | null };
  // Same cookies and action, but claiming to come from another site.
  const res = await page.request.fetch(c.url, { method: "POST", headers: { ...c.headers, origin: "https://evil.example", "sec-fetch-site": "cross-site" }, data: c.body ?? undefined });
  expect(res.status()).toBeGreaterThanOrEqual(400);
  expect(d1<{ value_json: string }>("SELECT value_json FROM system_settings WHERE key = 'media.uploads_enabled'")[0]!.value_json).toBe("true");
  // The site's API routes refuse the same forgery.
  expect((await page.request.post("/api/chat", { headers: { Origin: "https://evil.example" }, data: { message: "hi" } })).status()).toBe(403);
  expect((await page.request.post("/api/lost-found", { headers: { Origin: "https://evil.example" }, data: { title: "x" } })).status()).toBe(403);
});
