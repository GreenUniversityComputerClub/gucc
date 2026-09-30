import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireSignedIn } from "@/lib/api/session";
import { AdminNav, AdminNavMobile } from "./nav";
import { SeenOnOpen } from "@/components/dashboard/seen-on-open";
import { LiveToaster } from "@/components/dashboard/live-toaster";
import { FlashMessage } from "@/components/admin/flash";
import { API_VERSION } from "@/lib/version";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dashboard", robots: { index: false, follow: false, nocache: true } };

/**
 * Dashboard shell for every signed-in person. Everyone gets the "Me" group; club
 * management groups appear only for what the account may use. Every page and action is
 * still authorized by the API, so hiding a link is a convenience, never the control.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSignedIn("/dashboard");
  const c = (p: string) => Boolean(session.caps[p]);
  const writes = (area: string) => c(`${area}.read`) || c(`${area}.create`);
  const active = session.user.status === "ACTIVE";
  // Tolerate an API older than this website (it may not send these yet).
  const security = session.security ?? null;
  const sees = (what: "system") => what === "system" && (c("audit.read") || c("system.health"));
  const groups: Array<{ label: string; items: Array<{ href: string; label: string; show: boolean; badge?: number }> }> = [
    { label: "Overview", items: [
      { href: "/dashboard", label: "Dashboard", show: true },
      // Authors follow (and can withdraw) their own requests here too.
      { href: "/dashboard/approvals", label: "Approvals", show: c("approvals.read") || c("posts.create") || c("events.create") },
      { href: "/dashboard/notifications", label: "Notifications", show: true, badge: session.unread || undefined },
      { href: "/dashboard/chat", label: "Messages", show: true, badge: session.unreadMessages || undefined },
      { href: "/dashboard/profile", label: "My profile", show: true },
      { href: "/dashboard/security", label: "Security", show: true },
    ] },
    { label: "People", items: [
      { href: "/dashboard/members", label: "Members", show: c("members.read") },
      { href: "/dashboard/committees", label: "Executives & committees", show: c("committees.read") },
      { href: "/dashboard/people", label: "Profiles", show: c("executives.assign") || c("members.manage") },
    ] },
    { label: "Content", items: [
      { href: "/dashboard/posts?type=BLOG", label: "Blog", show: writes("posts") },
      // Members write blog posts only; news and announcements are the committee's.
      { href: "/dashboard/posts?type=NEWS", label: "News", show: c("posts.read") && session.adminAccess },
      { href: "/dashboard/posts?type=ANNOUNCEMENT", label: "Announcements", show: c("posts.read") && session.adminAccess },
      { href: "/dashboard/media", label: "Media", show: c("media.read") },
    ] },
    { label: "Events", items: [
      { href: "/dashboard/events", label: "Events", show: writes("events") },
      // The all-events list is for club-wide managers; others manage registrations on their event's page.
      { href: "/dashboard/registrations", label: "Registrations", show: Boolean(session.wideCaps?.["events.manage_registration"]) },
    ] },
    { label: "Operations", items: [
      { href: "/dashboard/tasks", label: "Tasks", show: active, badge: session.openTasks || undefined },
      { href: "/dashboard/meetings", label: "Meetings", show: active },
      { href: "/dashboard/recruitment", label: "Recruitment", show: c("recruitment.manage") },
      { href: "/dashboard/messages", label: "Contact inbox", show: c("messages.read") },
      { href: "/dashboard/contests", label: "Contests", show: c("contests.manage") },
      { href: "/dashboard/forms", label: "Forms", show: c("forms.manage") },
      { href: "/dashboard/lost-found", label: "Lost & found", show: c("lostfound.moderate") },
      { href: "/dashboard/reports", label: "Reports", show: c("chat.moderate") || c("lostfound.moderate") },
    ] },
    { label: "Governance", items: [
      { href: "/dashboard/positions", label: "Positions", show: c("positions.read") },
      { href: "/dashboard/access", label: "Who can do what", show: c("roles.read") },
      { href: "/dashboard/access/simulator", label: "Access simulator", show: c("rules.read") && c("users.read") },
      { href: "/dashboard/rules", label: "Rules", show: c("rules.read") },
      { href: "/dashboard/roles", label: "Roles (advanced)", show: c("roles.read") },
    ] },
    { label: "System", items: [
      { href: "/dashboard/activity", label: "Activity log", show: c("audit.read") },
      { href: "/dashboard/health", label: "System health", show: sees("system") },
      { href: "/dashboard/settings", label: "Settings", show: c("settings.manage") },
    ] },
  ];
  const visible = groups.map((g) => ({ label: g.label, items: g.items.filter((i) => i.show).map(({ href, label, badge }) => ({ href, label, badge })) })).filter((g) => g.items.length > 0);
  const who = session.profile?.name ?? session.user.email;
  // The President and the General Secretary have Moderator authority; their title is their position.
  const leader = session.positions.some((p) => p.key === "president" || p.key === "general-secretary");
  const titles = [...(session.isModerator && !leader ? ["Moderator"] : []), ...session.positions.map((p) => p.name)];
  // The badges start from this render and stay live while the page is open.
  const counts = { unread: session.unread ?? 0, unreadMessages: session.unreadMessages ?? 0, openTasks: session.openTasks ?? 0 };

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 pb-4 lg:flex-row lg:gap-6 lg:py-6">
        {/* Phones and tablets: sticky bar with a menu. It sits directly in this full-height column
            so it stays under the site header while the page scrolls. */}
        <Suspense fallback={<div className="h-14 lg:hidden" />}>
          <AdminNavMobile groups={visible} counts={counts} who={titles.length > 0 ? `${who} · ${titles.slice(0, 2).join(", ")}` : who} />
        </Suspense>
        <aside className="hidden lg:sticky lg:top-20 lg:block lg:h-[calc(100dvh-6rem)] lg:w-60 lg:shrink-0 lg:overflow-y-auto">
          <div className="mb-3">
            <Link prefetch={false} href="/dashboard" className="text-lg font-bold">GUCC Dashboard</Link>
            <p className="mt-1 truncate text-xs text-muted-foreground" title={who}>
              {who}{titles.length > 0 && <> · {titles.slice(0, 2).join(", ")}</>}
            </p>
          </div>
          <Suspense fallback={null}>
            <AdminNav groups={visible} counts={counts} />
          </Suspense>
          <div className="mt-4 text-xs text-muted-foreground">
            <Link prefetch={false} href="/" className="hover:underline">View site</Link>
          </div>
        </aside>
        <main id="admin-main" className="min-w-0 flex-1">
          {sees("system") && session.apiVersion !== API_VERSION && (
            <p role="status" className="mb-4 rounded-xl border border-sky-400/60 bg-sky-500/5 p-3 text-sm">
              The API is {session.apiVersion ? "a different version from" : "older than"} this website; some dashboard pages work after the next API release.
            </p>
          )}
          {security?.mfaRequired && !security.mfaEnabled && (
            <p role="status" className={security.mfaBlocked ? "mb-4 rounded-xl border border-destructive/50 bg-destructive/5 p-3 text-sm" : "mb-4 rounded-xl border border-amber-400/60 bg-amber-500/5 p-3 text-sm"}>
              {security.mfaBlocked
                ? "Your leadership permissions are paused until you turn on two-factor sign-in. "
                : `Your permissions need two-factor sign-in${security.mfaDeadline ? ` by ${new Date(security.mfaDeadline).toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "long" })}` : ""}. `}
              <Link prefetch={false} href="/dashboard/security#two-factor" className="font-medium underline">Set it up now</Link>
            </p>
          )}
          {children}
        </main>
        <FlashMessage />
        <Suspense fallback={null}>
          <SeenOnOpen seed={counts} />
          <LiveToaster meId={session.user.id} />
        </Suspense>
      </div>
    </div>
  );
}
