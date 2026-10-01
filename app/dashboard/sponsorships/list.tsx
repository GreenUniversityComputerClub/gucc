"use client";

/**
 * The dashboard's list of sponsorship pages: find one (search, public or hidden), see what each
 * holds, and act on it (edit, preview, copy its link, make it the default, show or hide, move,
 * duplicate, delete). The default stays first and public; changing it never touches the others.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, Copy, ExternalLink, Eye, Handshake, Package, Pencil, Phone, Search, Star, Users } from "lucide-react";
import { ActionForm, type Result } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SponsorshipListRow } from "@/lib/server/services/sponsorships";

export interface ListActions {
  setDefault: (id: string, fd: FormData) => Promise<Result>;
  setStatus: (id: string, status: "ACTIVE" | "INACTIVE", fd: FormData) => Promise<Result>;
  duplicate: (id: string, fd: FormData) => Promise<Result>;
  remove: (id: string, fd: FormData) => Promise<Result>;
  move: (id: string, direction: "up" | "down", fd: FormData) => Promise<Result>;
}

const money = (n: number) => `৳${n.toLocaleString("en-US")}`;

function CopyLink({ href, label }: { href: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" aria-label={`Copy the link to ${label}`} title="Copy link"
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(new URL(href, window.location.origin).toString());
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        } catch { /* clipboard blocked: the link is shown next to it */ }
      }}>
      {done ? <Check className="h-4 w-4 text-emerald-600" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
      <span className="sr-only" aria-live="polite">{done ? "Copied" : ""}</span>
    </button>
  );
}

export function SponsorshipList({ rows, actions }: { rows: SponsorshipListRow[]; actions: ListActions }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "ACTIVE" | "INACTIVE">("all");
  const counts = { all: rows.length, ACTIVE: rows.filter((r) => r.status === "ACTIVE").length, INACTIVE: rows.filter((r) => r.status === "INACTIVE").length };
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => (filter === "all" || r.status === filter)
      && (!needle || [r.title, r.slug, r.summary, r.event_name].some((x) => x?.toLowerCase().includes(needle))));
  }, [rows, q, filter]);
  // Moving is among the pages after the default, in list order.
  const movable = rows.filter((r) => !r.is_default).map((r) => r.id);

  return (
    <div className="space-y-3">
      {rows.length > 3 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative flex-1">
            <span className="sr-only">Search sponsorship pages</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by title, address or event"
              className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-base md:text-sm" />
          </label>
          <div role="group" aria-label="Show" className="flex gap-1 rounded-lg border bg-muted/40 p-1">
            {([["all", "All"], ["ACTIVE", "Public"], ["INACTIVE", "Hidden"]] as const).map(([k, l]) => (
              <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}
                className={cn("min-h-8 rounded-md px-3 text-sm font-medium", filter === k ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                {l} <span className="tabular-nums text-muted-foreground">{counts[k]}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {shown.length === 0 && rows.length > 0 && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No page matches. <button type="button" className="underline" onClick={() => { setQ(""); setFilter("all"); }}>Show all</button></p>}

      <ul className="space-y-3">
        {shown.map((p) => {
          const pos = movable.indexOf(p.id);
          const href = `/sponsors/${p.slug}`;
          const clubWide = /partner/i.test(`${p.event_name ?? ""} ${p.title}`) && !/\b20\d\d\b/.test(p.event_name ?? "");
          return (
            <li key={p.id} className={cn("rounded-xl border bg-card p-4 transition-shadow hover:shadow-sm", p.is_default ? "border-primary/50 ring-1 ring-primary/20" : "")}>
              <div className="flex gap-3">
                {!p.is_default && movable.length > 1 && (
                  <div className="flex shrink-0 flex-col gap-1">
                    {pos > 0 ? <ActionForm action={(fd: FormData) => actions.move(p.id, "up", fd)} submitLabel="↑" variant="ghost" inline submitAriaLabel={`Move ${p.title} up`} /> : <span className="h-9 w-9" aria-hidden />}
                    {pos < movable.length - 1 ? <ActionForm action={(fd: FormData) => actions.move(p.id, "down", fd)} submitLabel="↓" variant="ghost" inline submitAriaLabel={`Move ${p.title} down`} /> : null}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-semibold">
                        <Link href={`/dashboard/sponsorships/${p.id}`} prefetch={false} className="hover:underline">{p.title}</Link>
                        {p.is_default ? <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary-foreground"><Star className="h-3 w-3" aria-hidden />Default</span> : null}
                        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide", p.status === "ACTIVE" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground")}>{p.status === "ACTIVE" ? "Public" : "Hidden"}</span>
                        {clubWide && <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-400"><Handshake className="h-3 w-3" aria-hidden />Whole club</span>}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
                        {p.status === "ACTIVE" ? <Link href={href} target="_blank" prefetch={false} className="truncate underline-offset-2 hover:underline">{href}</Link> : <span className="truncate">{href}</span>}
                        {p.status === "ACTIVE" && <CopyLink href={href} label={p.title} />}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button asChild size="sm" className="min-h-9 gap-1.5"><Link href={`/dashboard/sponsorships/${p.id}`} prefetch={false}><Pencil className="h-4 w-4" aria-hidden />Edit</Link></Button>
                      <Button asChild size="sm" variant="outline" className="min-h-9 gap-1.5"><Link href={`/sponsors/preview/${p.id}`} target="_blank" prefetch={false} aria-label={`Preview ${p.title}`}><Eye className="h-4 w-4" aria-hidden />Preview</Link></Button>
                      {p.status === "ACTIVE" && <Button asChild size="sm" variant="ghost" className="min-h-9 px-2"><Link href={href} target="_blank" prefetch={false} aria-label={`Open ${p.title} on the site`}><ExternalLink className="h-4 w-4" aria-hidden /></Link></Button>}
                    </div>
                  </div>
                  {p.summary && <p className="mt-1.5 line-clamp-2 text-sm">{p.summary}</p>}
                  <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Package className="h-3.5 w-3.5" aria-hidden />{p.packages} package{p.packages === 1 ? "" : "s"}{p.packages > 0 && <> · {p.price_from ? `from ${money(p.price_from)}` : "on request"}</>}</span>
                    <span className={cn("inline-flex items-center gap-1", p.contacts === 0 && "text-amber-700 dark:text-amber-400")}><Phone className="h-3.5 w-3.5" aria-hidden />{p.contacts} contact{p.contacts === 1 ? "" : "s"}</span>
                    <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" aria-hidden />{p.partners} partner logo{p.partners === 1 ? "" : "s"}</span>
                    <span>Updated {new Date(p.updated_at).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}{p.updated_by_name ? ` by ${p.updated_by_name}` : ""}</span>
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
                    {!p.is_default && (
                      <ActionForm action={(fd: FormData) => actions.setDefault(p.id, fd)} submitLabel="Make default" variant="outline" inline
                        submitAriaLabel={`Make ${p.title} the default`}
                        confirm={`Make "${p.title}" the default? The navbar's Sponsors link will open it${p.status === "ACTIVE" ? "" : " (it becomes public)"}. Every other page stays as it is.`} />
                    )}
                    {p.status === "ACTIVE"
                      ? !p.is_default && <ActionForm action={(fd: FormData) => actions.setStatus(p.id, "INACTIVE", fd)} submitLabel="Hide" variant="outline" inline submitAriaLabel={`Hide ${p.title}`} confirm={`Hide "${p.title}" from the site? Its link stops working until you make it public again.`} />
                      : <ActionForm action={(fd: FormData) => actions.setStatus(p.id, "ACTIVE", fd)} submitLabel="Make public" variant="outline" inline submitAriaLabel={`Make ${p.title} public`} />}
                    <ActionForm action={(fd: FormData) => actions.duplicate(p.id, fd)} submitLabel="Duplicate" variant="ghost" inline submitAriaLabel={`Duplicate ${p.title}`} redirectTo="/dashboard/sponsorships/{id}" />
                    {!p.is_default && <ActionForm action={(fd: FormData) => actions.remove(p.id, fd)} submitLabel="Delete" variant="ghost" inline submitAriaLabel={`Delete ${p.title}`} confirm={`Delete "${p.title}" for good? Its page stops working.`} />}
                    {p.is_default ? <p className="text-xs text-muted-foreground">The navbar&apos;s Sponsors link opens this page. To hide or delete it, make another page the default first.</p> : null}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
