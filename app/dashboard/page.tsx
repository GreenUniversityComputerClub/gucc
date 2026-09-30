import Link from "next/link";
import { ArrowRight, Bell, CalendarDays, CheckCircle2, ClipboardList, FileText, ListTodo, Megaphone, UserCheck, Video } from "lucide-react";
import { requireSignedIn, view } from "@/lib/api/session";
import type { homeView } from "@/lib/server/views/home";
import { ActionForm, Section, StatusBadge } from "@/components/admin/ui";
import { ActivityList } from "@/components/admin/activity-list";
import { normalizeHome } from "@/lib/api/contracts";
import { cancelRegistrationAction } from "./actions";
import { CheckInQr } from "@/components/dashboard/check-in-qr";

type Home = Awaited<ReturnType<typeof homeView>>;
const when = (iso: unknown) => (iso ? new Date(String(iso)).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "Date to be announced");
const day = (iso: unknown) => (iso ? new Date(String(iso)).toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short" }) : "");
const fmtBytes = (n: number) => (n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n > 1e6 ? `${(n / 1e6).toFixed(0)} MB` : `${Math.round(n / 1e3)} KB`);

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", hour: "numeric", hour12: false }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function DashboardHome() {
  const session = await requireSignedIn("/dashboard");
  const h = normalizeHome(await view<Home>("views.home", {}, "/dashboard"));
  const can = (p: string) => Boolean(session.caps[p]);
  const first = session.profile?.name?.split(" ")[0];
  const status = h.account?.status ?? session.user.status;
  const quick = [
    // Members propose and write for review; the committee creates directly.
    can("events.create") && { href: "/dashboard/events/new", label: session.adminAccess ? "Create an event" : "Propose an event", icon: CalendarDays },
    can("posts.create") && { href: "/dashboard/posts/new?type=BLOG", label: "Write a blog post", icon: FileText },
    !session.adminAccess && (can("posts.create") || can("events.create")) && { href: "/dashboard/approvals?mine=1&status=ALL", label: "My submissions", icon: ClipboardList },
    can("members.approve") && { href: "/dashboard/members?status=PENDING_APPROVAL", label: "Review members", icon: UserCheck },
    can("notifications.send") && { href: "/dashboard/notifications", label: "Send an announcement", icon: Megaphone },
    can("tasks.assign") && { href: "/dashboard/tasks#give", label: "Give a task", icon: ListTodo },
    can("meetings.schedule") && { href: "/dashboard/meetings#schedule", label: "Schedule a meeting", icon: Video },
  ].filter(Boolean) as Array<{ href: string; label: string; icon: typeof FileText }>;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{greeting()}{first ? `, ${first}` : ""}.</h1>
        <p className="text-sm text-muted-foreground">
          {session.positions.length > 0 ? session.positions.map((p) => p.name).join(", ") : session.isModerator ? "Moderator" : status === "ACTIVE" ? "GUCC member" : "Your account is awaiting approval"}
        </p>
      </header>

      {status !== "ACTIVE" && (
        <p className="rounded-xl border border-amber-400/60 bg-amber-500/5 p-4 text-sm">
          {status === "PENDING_APPROVAL" ? "Your membership is awaiting approval by the club's leaders. Meanwhile you can complete your profile." : "Your account needs attention."}{" "}
          <Link href="/dashboard/profile" className="underline">Open your profile</Link>
          {h.account?.correction_note && <span className="mt-2 block"><strong>Requested correction:</strong> {h.account.correction_note}</span>}
        </p>
      )}

      {h.campaign && (
        <Link href="/recruitment" className="flex items-center justify-between gap-3 rounded-xl border border-primary/40 bg-primary/5 p-4 text-sm hover:bg-primary/10">
          <span><strong>{String(h.campaign.title)}</strong> is open{h.campaign.closes_at ? ` until ${day(h.campaign.closes_at)}` : ""}.</span>
          <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
        </Link>
      )}

      {h.attention.length > 0 ? (
        <Section title="Needs your attention">
          <ul className="grid gap-2 sm:grid-cols-2">
            {h.attention.map((a) => (
              <li key={a.key}>
                <Link prefetch={false} href={a.href} className="flex items-center justify-between gap-3 rounded-lg border border-amber-400/50 bg-amber-500/5 px-3 py-2.5 text-sm hover:bg-amber-500/10">
                  {a.label}<ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
          {h.approvals.length > 0 && (
            <ul className="mt-3 divide-y text-sm">
              {h.approvals.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                  <Link prefetch={false} href={`/dashboard/approvals/${r.id}`} className="min-w-0 truncate hover:underline">{r.title}</Link>
                  <span className="shrink-0 text-xs text-muted-foreground">{r.requester}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      ) : can("approvals.read") ? (
        <p className="flex items-center gap-2 rounded-xl border bg-card p-4 text-sm"><CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />Nothing needs your decision. Everything is up to date.</p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Coming up" description={h.upcoming.length ? undefined : "No upcoming events yet."}>
          <ul className="divide-y text-sm">
            {h.upcoming.map((e) => (
              <li key={String(e.id)} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <Link href={`/events/${String(e.slug)}`} className="font-medium hover:underline">{String(e.title)}</Link>
                  <span className="block text-xs text-muted-foreground">{when(e.start_at)}{e.venue ? ` · ${String(e.venue)}` : ""}</span>
                </span>
                {e.my_status ? <StatusBadge status={String(e.my_status)} /> : e.registration_enabled ? <Link href={`/events/${String(e.slug)}#register`} className="shrink-0 rounded-md border px-2.5 py-1 text-xs hover:bg-muted">Register</Link> : null}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="My events" description={h.myRegistrations.length ? undefined : "You haven't registered for anything upcoming."}>
          <ul className="divide-y text-sm">
            {h.myRegistrations.map((r) => (
              <li key={String(r.id)} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span className="min-w-0">
                  <Link href={`/events/${String(r.slug)}`} className="font-medium hover:underline">{String(r.title)}</Link>
                  <span className="block text-xs text-muted-foreground">{when(r.start_at)} · {String(r.status).toLowerCase()}</span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  {r.code ? <CheckInQr code={String(r.code)} title={String(r.title)} /> : null}
                  {r.status !== "ATTENDED" && <ActionForm action={cancelRegistrationAction.bind(null, String(r.id))} submitLabel="Cancel" variant="outline" inline confirm={`Cancel your registration for ${String(r.title)}?`} />}
                </span>
              </li>
            ))}
          </ul>
          {!h.myRegistrations.length && <Link href="/events" className="text-sm underline">Browse events</Link>}
        </Section>
      </div>

      {(h.tasks.length > 0 || h.meetings.length > 0) && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="My tasks" description={h.tasks.length ? undefined : "No open tasks."}>
            <ul className="divide-y text-sm">
              {h.tasks.map((t) => {
                const late = t.due_at && String(t.due_at) < new Date().toISOString();
                return (
                  <li key={String(t.id)} className="flex items-center justify-between gap-3 py-2">
                    <Link prefetch={false} href={`/dashboard/tasks/${String(t.id)}`} className="min-w-0 truncate hover:underline">{String(t.title)}</Link>
                    <span className={late ? "shrink-0 text-xs font-medium text-destructive" : "shrink-0 text-xs text-muted-foreground"}>{t.due_at ? `${late ? "Overdue · " : "Due "}${day(t.due_at)}` : <StatusBadge status={String(t.status)} />}</span>
                  </li>
                );
              })}
            </ul>
            <Link prefetch={false} href="/dashboard/tasks" className="mt-2 inline-block text-sm underline">All tasks</Link>
          </Section>
          <Section title="Meetings" description={h.meetings.length ? undefined : "No meetings in the next two weeks."}>
            <ul className="divide-y text-sm">
              {h.meetings.map((m) => (
                <li key={String(m.id)} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <Link prefetch={false} href={`/dashboard/meetings/${String(m.id)}`} className="font-medium hover:underline">{String(m.title)}</Link>
                    <span className="block text-xs text-muted-foreground">{when(m.starts_at)}{m.location ? ` · ${String(m.location)}` : ""}</span>
                  </span>
                  {m.meet_url ? <a href={String(m.meet_url)} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-md border px-2.5 py-1 text-xs hover:bg-muted">Join Meet</a> : null}
                </li>
              ))}
            </ul>
            <Link prefetch={false} href="/dashboard/meetings" className="mt-2 inline-block text-sm underline">All meetings</Link>
          </Section>
        </div>
      )}

      {(h.myWork.length > 0 || h.myRequests.length > 0 || h.expiring.length > 0) && (
        <Section title="My work">
          <ul className="divide-y text-sm">
            {h.myWork.map((w) => (
              <li key={String(w.id)} className="flex items-center justify-between gap-3 py-2">
                <Link prefetch={false} href={`/dashboard/${w.kind === "post" ? "posts" : "events"}/${String(w.id)}`} className="min-w-0 truncate hover:underline">
                  <ClipboardList className="mr-1.5 inline h-3.5 w-3.5 text-muted-foreground" aria-hidden />{String(w.title)}
                </Link>
                <StatusBadge status={String(w.status) === "REJECTED" ? "CHANGES REQUESTED" : String(w.status)} />
              </li>
            ))}
            {h.myRequests.map((r) => (
              <li key={String(r.id)} className="flex items-center justify-between gap-3 py-2">
                <Link prefetch={false} href={`/dashboard/approvals/${String(r.id)}`} className="min-w-0 truncate hover:underline">{String(r.title)}</Link>
                <span className="shrink-0 text-xs text-muted-foreground">waiting since {day(r.created_at)}</span>
              </li>
            ))}
            {h.expiring.map((x, i) => (
              <li key={`x${i}`} className="py-2 text-amber-700 dark:text-amber-400">Your {String(x.kind)} “{String(x.label)}” ends on {day(x.expires_at)}.</li>
            ))}
          </ul>
        </Section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {quick.length > 0 && (
          <Section title="Quick actions">
            <div className="grid gap-2 sm:grid-cols-2">
              {quick.map((q) => (
                <Link key={q.href} prefetch={false} href={q.href} className="flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm hover:bg-muted">
                  <q.icon className="h-4 w-4 text-primary" aria-hidden />{q.label}
                </Link>
              ))}
            </div>
          </Section>
        )}
        <Section title="Latest notifications" description={h.notifications.length ? undefined : "Nothing yet."}>
          <ul className="divide-y text-sm">
            {h.notifications.map((n) => (
              <li key={String(n.id)} className="py-2">
                <span className={n.read_at ? "" : "font-semibold"}>{n.link ? <Link prefetch={false} href={`/dashboard/notifications/open/${String(n.id)}?to=${encodeURIComponent(String(n.link))}`} className="hover:underline">{String(n.title)}</Link> : String(n.title)}</span>
                <span className="block text-xs text-muted-foreground">{day(n.created_at)}</span>
              </li>
            ))}
          </ul>
          <Link prefetch={false} href="/dashboard/notifications" className="mt-2 inline-flex items-center gap-1 text-sm underline"><Bell className="h-3.5 w-3.5" aria-hidden />All notifications{h.unread ? ` (${h.unread} new)` : ""}</Link>
        </Section>
      </div>

      {h.recentActivity.length > 0 && (
        <Section title="Recent activity">
          <ActivityList entries={h.recentActivity} />
          <Link prefetch={false} href="/dashboard/activity" className="mt-3 inline-block text-sm underline">Full activity log</Link>
        </Section>
      )}

      {h.health && (
        <Section title="Club at a glance" description="The last 30 days.">
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
            {[["Active members", h.health.activeMembers], ["New accounts", h.health.newAccounts], ["Events", h.health.events30d], ["Posts published", h.health.posts30d], ["Media stored", fmtBytes(h.health.storageBytes)]].map(([k, v]) => (
              <div key={String(k)} className="rounded-lg border p-3"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{v}</dd></div>
            ))}
          </dl>
          {!h.emailEnabled && (can("members.approve") || can("users.reset_password")) && (
            <p className="mt-3 text-xs text-muted-foreground">Email isn&apos;t set up: approve members in the dashboard, and give password-reset and invitation links privately.</p>
          )}
        </Section>
      )}
    </div>
  );
}
