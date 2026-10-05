import Link from "next/link";
import { CalendarClock, Eye, EyeOff, Lock, Plus, SearchCheck } from "lucide-react";
import { requireAdmin, view } from "@/lib/api/session";
import type { FormAdminRow } from "@/lib/server/services/forms";
import { PROVIDER_LABEL } from "@/lib/forms/providers";
import { EmptyState, PageHeader } from "@/components/admin/ui";
import { cn } from "@/lib/utils";
import { CheckAllForms, CopyLink, FormRowMenu } from "./form-row-menu";

type Tab = "all" | "open" | "scheduled" | "closed" | "archived" | "check";
const TABS: Array<[Tab, string]> = [["all", "All"], ["open", "Open"], ["scheduled", "Scheduled"], ["closed", "Closed"], ["check", "Needs a check"], ["archived", "Archived"]];
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short", year: "numeric" });

const STATE_CHIP: Record<FormAdminRow["state"], [string, string]> = {
  open: ["Open", "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"],
  scheduled: ["Scheduled", "bg-sky-500/15 text-sky-700 dark:text-sky-300"],
  closed: ["Closed", "bg-slate-500/15 text-slate-700 dark:text-slate-300"],
  archived: ["Archived", "bg-slate-500/15 text-slate-600 dark:text-slate-400"],
};

const inTab = (f: FormAdminRow, tab: Tab) =>
  tab === "all" ? f.state !== "archived" : tab === "check" ? f.state !== "archived" && !f.inspectedAt : f.state === tab;

function schedule(f: FormAdminRow): string | null {
  if (f.state === "scheduled" && f.opensAt) return `Opens ${when(f.opensAt)}`;
  if (f.state === "open" && f.closesAt) return `Until ${when(f.closesAt)}`;
  if (f.state === "closed") return !f.accepting ? "Not taking answers" : f.closesAt ? `Closed ${when(f.closesAt)}` : null;
  return null;
}

function Badges({ f }: { f: FormAdminRow }) {
  const [label, cls] = STATE_CHIP[f.state];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", cls)}>{label}</span>
      {f.state !== "archived" && (f.listed
        ? <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary" title="Shown at /forms and in search engines while open"><Eye className="h-3 w-3" aria-hidden />Listed</span>
        : <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground" title="Only people with the link find it"><EyeOff className="h-3 w-3" aria-hidden />Link only</span>)}
      {f.requiresSignIn && <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-800 dark:text-amber-300" title="Needs a Google account: phones open it at Google"><Lock className="h-3 w-3" aria-hidden />Sign-in</span>}
      {!f.inspectedAt && f.state !== "archived" && <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-xs text-rose-700 dark:text-rose-300" title="Open it in the editor and press Check"><SearchCheck className="h-3 w-3" aria-hidden />Needs a check</span>}
    </div>
  );
}

/**
 * The club's forms: what's open, scheduled or closed, with their addresses, and one menu per
 * form (edit, open, copy, QR, check, duplicate, archive). The forms themselves live at Google
 * (or Microsoft, Tally, Airtable); this is the page around them.
 */
export default async function FormsAdmin({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin("/dashboard/forms");
  const sp = await searchParams;
  const tab: Tab = TABS.some(([k]) => k === sp.tab) ? (sp.tab as Tab) : "all";
  const q = (sp.q ?? "").trim().toLowerCase();
  const all = await view<FormAdminRow[]>("forms.list", {}, "/dashboard/forms");
  const counts = Object.fromEntries(TABS.map(([k]) => [k, all.filter((f) => inTab(f, k)).length])) as Record<Tab, number>;
  const forms = all.filter((f) => inTab(f, tab) && (!q || `${f.title} ${f.slug} ${f.category ?? ""} ${f.event?.title ?? ""}`.toLowerCase().includes(q)));
  const href = (t: Tab) => `/dashboard/forms?${new URLSearchParams(Object.fromEntries(Object.entries({ tab: t === "all" ? "" : t, q: sp.q ?? "" }).filter(([, v]) => v))).toString()}`;

  return (
    <>
      <PageHeader title="Forms" description="Google Forms (and Microsoft, Tally or Airtable forms) shown on the website at /forms/<address>, with a schedule, a QR code and a listing. Answers stay in the form's own sheet."
        actions={(
          <>
            <CheckAllForms forms={all.filter((f) => f.state !== "archived" && !f.inspectedAt).map((f) => ({ id: f.id, url: f.url, title: f.title }))} />
            <a href="/forms" target="_blank" rel="noopener" className="inline-flex min-h-10 items-center rounded-md border px-3 text-sm hover:bg-muted">Public list</a>
            <Link prefetch={false} href="/dashboard/forms/new" className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"><Plus className="h-4 w-4" aria-hidden />New form</Link>
          </>
        )} />
      <nav aria-label="Form status" className="-mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1 text-sm">
        {TABS.filter(([k]) => k === "all" || k === tab || counts[k] > 0).map(([k, label]) => (
          <Link prefetch={false} key={k} href={href(k)} aria-current={tab === k ? "page" : undefined}
            className={cn("inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5", tab === k ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
            {label}<span className={cn("rounded-full px-1.5 text-xs", tab === k ? "bg-primary-foreground/20" : "bg-muted")}>{counts[k]}</span>
          </Link>
        ))}
      </nav>
      <form className="mb-4 flex gap-2" role="search">
        {tab !== "all" && <input type="hidden" name="tab" value={tab} />}
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Title, address, category or event" aria-label="Search forms" className="h-10 w-full min-w-0 rounded-md border bg-background px-3 text-base md:h-9 md:text-sm" />
        <button className="h-10 shrink-0 rounded-md border px-4 text-sm font-medium hover:bg-muted md:h-9">Search</button>
      </form>

      {forms.length === 0 ? (
        <EmptyState>
          {all.length === 0
            ? <>No forms yet. <Link prefetch={false} href="/dashboard/forms/new" className="font-medium text-primary underline-offset-4 hover:underline">Add the first one</Link>: paste a Google Form link and GUCC builds its page.</>
            : q ? "No forms match your search." : "Nothing here."}
        </EmptyState>
      ) : (
        <>
          {/* Computers: a table. */}
          <div className="hidden overflow-hidden rounded-xl border md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Form</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Schedule</th>
                  <th className="px-3 py-2 font-medium">Updated</th>
                  <th className="w-12 px-3 py-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {forms.map((f) => (
                  <tr key={f.id} className="align-top hover:bg-muted/30">
                    <td className="max-w-md px-3 py-3">
                      <Link prefetch={false} href={`/dashboard/forms/${f.id}`} className="font-medium hover:underline">{f.title}</Link>
                      <div className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                        <span className="truncate">/forms/{f.slug}</span>
                        {f.state !== "archived" && <CopyLink slug={f.slug} />}
                      </div>
                      <div className="text-xs text-muted-foreground">{f.provider ? PROVIDER_LABEL[f.provider] : "Form"}{f.questionCount != null ? ` · ${f.questionCount} questions` : ""}{f.event ? ` · ${f.event.title}` : ""}</div>
                    </td>
                    <td className="px-3 py-3"><Badges f={f} /></td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground">{schedule(f) ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground">{day(f.updatedAt)}{f.updatedBy ? <div className="max-w-40 truncate">{f.updatedBy}</div> : null}</td>
                    <td className="px-1 py-1.5 text-right"><FormRowMenu form={f} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Phones: cards. */}
          <ul className="space-y-2 md:hidden">
            {forms.map((f) => (
              <li key={f.id} className="rounded-xl border bg-card p-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <Link prefetch={false} href={`/dashboard/forms/${f.id}`} className="font-medium leading-snug hover:underline">{f.title}</Link>
                    <div className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                      <span className="truncate">/forms/{f.slug}</span>
                      {f.state !== "archived" && <CopyLink slug={f.slug} />}
                    </div>
                  </div>
                  <FormRowMenu form={f} />
                </div>
                <div className="mt-2"><Badges f={f} /></div>
                {schedule(f) && <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarClock className="h-3.5 w-3.5" aria-hidden />{schedule(f)}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
