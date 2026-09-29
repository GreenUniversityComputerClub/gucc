import Link from "next/link";
import { requireSignedIn, view } from "@/lib/api/session";
import type { activityFeed } from "@/lib/server/services/activity";
import { ACTIVITY_AREAS } from "@/lib/governance/activity-areas";
import type { listAuthEvents } from "@/lib/server/services/community";
import { EmptyState, PageHeader, Pager } from "@/components/admin/ui";
import { ActivityList } from "@/components/admin/activity-list";
import { PersonPicker } from "@/components/admin/person-picker";
import { cn } from "@/lib/utils";

type Feed = Awaited<ReturnType<typeof activityFeed>>;
const input = "h-9 w-full rounded-md border bg-background px-3 text-sm";
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Dhaka" });
const SIGNIN_LABEL: Record<string, string> = {
  LOGIN_SUCCESS: "Signed in", LOGIN_FAILED: "Wrong password", LOCKED: "Locked after failed attempts", LOGIN_BLOCKED: "Sign-in refused", LOGOUT: "Signed out",
  REGISTER: "Signed up", REGISTER_DUPLICATE: "Tried to sign up again", EMAIL_VERIFIED: "Verified email", PASSWORD_RESET_REQUESTED: "Asked for a reset",
  PASSWORD_RESET: "Reset password", INVITE_ACCEPTED: "Accepted invitation", PASSWORD_CHANGED: "Changed password",
};

export default async function ActivityPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  // Anyone holding audit.read (leaders, developers); the API refuses everyone else.
  const session = await requireSignedIn("/dashboard/activity");
  const sp = await searchParams;
  const tab = sp.tab === "signins" ? "signins" : "activity";
  const qs = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ area: sp.area, actor: sp.actor, q: sp.q, from: sp.from, to: sp.to, ...extra })) if (v) p.set(k, v);
    return `/dashboard/activity${p.size ? `?${p}` : ""}`;
  };
  const tabs = (
    <nav aria-label="Log" className="mb-4 flex gap-1 border-b">
      {[["activity", "Activity", "/dashboard/activity"], ["signins", "Sign-ins", "/dashboard/activity?tab=signins"]].map(([k, label, href]) => (
        <Link key={k} prefetch={false} href={href} aria-current={tab === k ? "page" : undefined}
          className={cn("-mb-px border-b-2 px-3 py-2 text-sm", tab === k ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}>{label}</Link>
      ))}
    </nav>
  );

  if (tab === "signins") {
    const page = Number(sp.page ?? 1);
    const rows = await view<Awaited<ReturnType<typeof listAuthEvents>>>("audit.authEvents", { q: sp.q, event: sp.event, page }, "/dashboard/activity");
    return (
      <>
        <PageHeader title="Activity log" description="Sign-ins, failed attempts, lockouts, sign-ups and password resets. Addresses are stored only as salted hashes." />
        {tabs}
        <form className="mb-4 grid gap-2 sm:grid-cols-4" role="search">
          <input type="hidden" name="tab" value="signins" />
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Email" aria-label="Email" className={cn(input, "sm:col-span-2")} />
          <select name="event" defaultValue={sp.event ?? ""} aria-label="What happened" className={input}>
            <option value="">Anything</option>
            {Object.entries(SIGNIN_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
          <button className="h-9 rounded-md border px-4 text-sm hover:bg-muted">Filter</button>
        </form>
        {rows.length === 0 ? <EmptyState>Nothing matches.</EmptyState> : (
          <ul className="divide-y rounded-xl border bg-card text-sm">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-3">
                <span className={/FAILED|LOCKED|BLOCKED/.test(r.event) ? "font-medium text-rose-600 dark:text-rose-400" : "font-medium"}>{SIGNIN_LABEL[r.event] ?? r.event}</span>
                <span className="min-w-0 flex-1 truncate">{r.email ?? "—"}{r.detail ? ` · ${r.detail}` : ""}</span>
                <span className="text-xs text-muted-foreground"><span className="font-mono">{r.event}</span> · {when(r.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
        <Pager page={page} hasMore={rows.length === 50} base="/dashboard/activity" params={{ tab: "signins", q: sp.q, event: sp.event }} />
      </>
    );
  }

  const feed = await view<Feed>("activity.feed", { area: sp.area, actor: sp.actor, q: sp.q, from: sp.from, to: sp.to, before: sp.before, request: sp.request }, "/dashboard/activity");
  return (
    <>
      <PageHeader title="Activity log" description="Everything that changed, by whom and when. The log can't be edited or deleted; open an entry for the details." />
      {tabs}
      <nav aria-label="Areas" className="mb-3 flex flex-wrap gap-1.5 text-sm">
        <Link prefetch={false} href={qs({ area: undefined, before: undefined })} className={cn("rounded-full border px-3 py-1", !sp.area && "bg-primary text-primary-foreground")}>Everything</Link>
        {ACTIVITY_AREAS.map((a) => (
          <Link key={a} prefetch={false} href={qs({ area: a, before: undefined })} className={cn("rounded-full border px-3 py-1", sp.area === a && "bg-primary text-primary-foreground")}>{a}</Link>
        ))}
      </nav>
      <form className="mb-5 grid gap-3 rounded-xl border bg-card p-3 sm:grid-cols-2 lg:grid-cols-5" role="search">
        {sp.area && <input type="hidden" name="area" value={sp.area} />}
        <div className="lg:col-span-2"><PersonPicker name="actor" label="Person" valueKind="user" placeholder="Anyone"
          initial={sp.actor ? { id: sp.actor, user_id: sp.actor, full_name: feed.entries.find((e) => e.actor.id === sp.actor)?.actor.name ?? (sp.actor === session.user.id ? "Me" : "Selected person"), student_id: null, email: null, person_type: null, roles_held: null } as never : null} /></div>
        <label className="grid gap-1.5 text-sm font-medium">Search<input name="q" defaultValue={sp.q ?? ""} placeholder="Words in the entry" className={input} /></label>
        <label className="grid gap-1.5 text-sm font-medium">From<input type="date" name="from" defaultValue={sp.from ?? ""} className={input} /></label>
        <label className="grid gap-1.5 text-sm font-medium">To<input type="date" name="to" defaultValue={sp.to ?? ""} className={input} /></label>
        <div className="flex items-end gap-2 lg:col-span-5">
          <button className="h-9 rounded-md bg-primary px-4 text-sm text-primary-foreground">Show</button>
          {(sp.actor || sp.q || sp.from || sp.to || sp.request) && <Link prefetch={false} href={qs({ actor: undefined, q: undefined, from: undefined, to: undefined, before: undefined, request: undefined })} className="h-9 rounded-md border px-4 py-2 text-sm">Clear</Link>}
          <Link prefetch={false} href={qs({ actor: session.user.id, before: undefined })} className="ml-auto h-9 rounded-md border px-3 py-2 text-sm hover:bg-muted">Only mine</Link>
        </div>
      </form>
      {sp.request && <p className="mb-3 text-sm text-muted-foreground">Showing everything done in one step.</p>}
      {feed.entries.length === 0 ? <EmptyState>Nothing matches these filters.</EmptyState> : <ActivityList entries={feed.entries} />}
      {feed.next && (
        <div className="mt-4 flex justify-center">
          <Link prefetch={false} href={qs({ before: feed.next, request: sp.request })} className="rounded-md border px-4 py-2 text-sm hover:bg-muted">Older</Link>
        </div>
      )}
    </>
  );
}
