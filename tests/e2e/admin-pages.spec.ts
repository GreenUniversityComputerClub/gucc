import { expect, test } from "@playwright/test";
import { d1, login, MODERATOR } from "./helpers";

/** Every admin screen renders for a Moderator (who may see all of them) without hitting the error boundary. */
test("all admin pages render", async ({ page }) => {
  test.setTimeout(240_000);
  const committee = d1<{ id: string }>("SELECT id FROM committees WHERE status = 'CURRENT'")[0];
  const event = d1<{ id: string }>("SELECT id FROM events WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 1")[0];
  const post = d1<{ id: string }>("SELECT id FROM posts WHERE deleted_at IS NULL LIMIT 1")[0];
  const rule = d1<{ id: string }>("SELECT id FROM rules WHERE deleted_at IS NULL LIMIT 1")[0];
  const moderator = d1<{ id: string }>(`SELECT id FROM users WHERE email = '${MODERATOR.email}'`)[0];
  const person = d1<{ id: string }>("SELECT pr.id FROM profiles pr JOIN users u ON u.id = pr.user_id WHERE pr.deleted_at IS NULL LIMIT 1")[0];
  const paths = [
    "/dashboard", "/dashboard/approvals", "/dashboard/approvals?status=ALL", "/dashboard/members", "/dashboard/committees", `/dashboard/committees/${committee.id}`,
    "/dashboard/positions", "/dashboard/roles", "/dashboard/rules", `/dashboard/rules/${encodeURIComponent(rule.id)}`, "/dashboard/events", "/dashboard/events/new", `/dashboard/events/${event.id}`,
    "/dashboard/posts?type=BLOG", "/dashboard/posts?type=NEWS", "/dashboard/posts/new?type=ANNOUNCEMENT", `/dashboard/posts/${post.id}`, "/dashboard/media",
    "/dashboard/contests", "/dashboard/forms", "/dashboard/notifications", "/dashboard/audit", "/dashboard/audit?tab=signins", "/dashboard/settings", "/dashboard/people",
    "/dashboard/recruitment", "/dashboard/messages", "/dashboard/profile", "/lost-found",
    "/dashboard/committees/import", "/dashboard/registrations", "/dashboard/media?unused=1", "/dashboard/members?status=&batch=232",
    "/dashboard/security", "/dashboard/access", "/dashboard/positions/new", `/dashboard/positions/${encodeURIComponent("pos:general-secretary")}`,
    `/dashboard/roles/${encodeURIComponent("role:administrator")}`, `/dashboard/access/${encodeURIComponent(moderator.id)}`,
    "/dashboard/tasks", "/dashboard/tasks?view=all&status=all", "/dashboard/meetings", "/dashboard/meetings?when=past", "/dashboard/health", "/dashboard/activity",
    "/dashboard/chat", "/dashboard/reports", "/dashboard/lost-found", "/dashboard/notifications?tab=all", "/dashboard/confirm?next=/dashboard",
    ...(person ? [`/dashboard/people/${person.id}`, `/dashboard/people/${person.id}?tab=organization`, `/dashboard/people/${person.id}?tab=access`] : []),
    // Old addresses keep working.
    "/admin", "/account",
  ];
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`${page.url()}: ${e.message}`));
  // The Content Security Policy must not block anything the dashboard uses.
  page.on("console", (m) => { if (/Content Security Policy|Refused to (load|connect|frame|execute)/i.test(m.text())) errors.push(`${page.url()}: ${m.text()}`); });
  await login(page, MODERATOR.email, MODERATOR.password, "/dashboard");
  for (const p of paths) {
    const res = await page.goto(p);
    expect(res?.status(), p).toBe(200);
    // Let hydration finish; leaving mid-stream can surface spurious errors from the torn-down page.
    await page.waitForTimeout(1200);
    await expect(page.getByText("This page could not load"), p).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});
