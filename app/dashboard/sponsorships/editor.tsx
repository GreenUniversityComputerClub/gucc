"use client";

/**
 * The sponsorship page editor: every section of the public page as plain fields (no JSON needed),
 * a checklist of what a sponsor would miss, and a preview that follows the edits live in another
 * tab. The content goes to the server as JSON in a hidden "content" input, so the server checks it
 * as before; keys the editor doesn't know are kept. The JSON tab stays for anything else.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, Award, CheckCircle2, Code2, ExternalLink, Eye, FileJson, Handshake, Lightbulb, ListChecks, Medal, Package, Phone, Sparkles, Star, Trophy, XCircle,
} from "lucide-react";
import { ActionForm, Field, FormSection, Hidden, type Result } from "@/components/admin/ui";
import { Rows } from "@/components/admin/structured-editors";
import { Button } from "@/components/ui/button";
import { uploadImage } from "@/lib/media/client";
import { cn } from "@/lib/utils";
import {
  contentIssues, SPONSOR_ICONS, SPONSOR_TIERS,
  type SponsorAchievement, type SponsorComparison, type SponsorContact, type SponsorOpportunity, type SponsorPackage, type SponsorPartner, type SponsorProgram, type SponsorReason, type SponsorshipContent,
} from "@/lib/sponsorship/content";
import { draftKey } from "./draft";

const input = "h-10 w-full rounded-md border border-input bg-background px-3 text-base md:h-9 md:text-sm";
const area = "w-full rounded-md border border-input bg-background px-3 py-2 text-base md:text-sm";
const label = "grid gap-1 text-xs font-medium";

const lines = (v: string) => v.split("\n").map((x) => x.trim()).filter(Boolean);
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** A list of short texts, one per line (benefits, parts, phrases). */
function LinesField({ value, onChange, rows = 4, hint, ...rest }: { value: string[] | undefined; onChange: (v: string[]) => void; rows?: number; hint?: string; label: string; placeholder?: string }) {
  // Kept as typed (blank lines and all) until the field loses focus, so typing never jumps.
  const [text, setText] = useState((value ?? []).join("\n"));
  const outside = (value ?? []).join("\n");
  const [last, setLast] = useState(outside);
  if (outside !== last && lines(text).join("\n") !== outside) {
    setLast(outside);
    setText(outside);
  }
  return (
    <label className={label}>
      <span>{rest.label} <span className="font-normal text-muted-foreground">· one per line</span></span>
      <textarea className={area} rows={rows} value={text} placeholder={rest.placeholder}
        onChange={(e) => { setText(e.target.value); const next = lines(e.target.value); setLast(next.join("\n")); onChange(next); }} />
      {hint && <span className="font-normal text-muted-foreground">{hint}</span>}
    </label>
  );
}

function Text({ label: l, value, onChange, hint, placeholder, type = "text", max, className }: { label: string; value: string | number | undefined; onChange: (v: string) => void; hint?: string; placeholder?: string; type?: string; max?: number; className?: string }) {
  const v = value ?? "";
  return (
    <label className={cn(label, className)}>
      <span className="flex justify-between gap-2">{l}{max && String(v).length > max * 0.8 && <span className={cn("font-normal", String(v).length > max ? "text-destructive" : "text-muted-foreground")}>{String(v).length}/{max}</span>}</span>
      <input className={input} type={type} value={v} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      {hint && <span className="font-normal text-muted-foreground">{hint}</span>}
    </label>
  );
}

function IconSelect({ value, onChange }: { value: string | undefined; onChange: (v: string) => void }) {
  return (
    <label className={label}>Icon
      <select className={input} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">Automatic</option>
        {SPONSOR_ICONS.map((i) => <option key={i} value={i}>{i}</option>)}
      </select>
    </label>
  );
}

/** A partner's logo: upload one (kept in the media library) or type an address. */
function LogoField({ value, name, onChange }: { value: string; name: string; onChange: (url: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="grid gap-2 sm:col-span-2 sm:grid-cols-[6rem_1fr] sm:items-center">
      <div className="flex h-14 w-24 items-center justify-center overflow-hidden rounded-md border bg-white p-1.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {value ? <img src={value} alt={name ? `${name} logo` : "Logo"} className="max-h-full max-w-full object-contain" /> : <span className="text-[10px] text-muted-foreground">No logo</span>}
      </div>
      <div className="grid gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex min-h-10 cursor-pointer items-center rounded-md border px-3 text-sm hover:bg-muted md:min-h-9">
            {busy ? "Uploading…" : value ? "Replace logo" : "Upload logo"}
            <input type="file" accept="image/*" className="sr-only" disabled={busy} onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              setBusy(true);
              setError(null);
              const r = await uploadImage(f, { alt: name ? `${name} logo` : "Partner logo" });
              setBusy(false);
              if (!r.ok || !r.url) return setError(r.ok ? "Upload finished without an address." : r.error);
              onChange(r.url);
            }} />
          </label>
          <input className={cn(input, "min-w-0 flex-1 font-mono text-xs md:text-xs")} value={value} placeholder="/sponsors/logo.png" aria-label={`${name || "Partner"} logo address`} onChange={(e) => onChange(e.target.value)} />
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}

const TABS = [
  { key: "hero", label: "Hero", icon: Sparkles },
  { key: "program", label: "Program", icon: Code2 },
  { key: "packages", label: "Packages", icon: Package },
  { key: "why", label: "Why sponsor", icon: Lightbulb },
  { key: "record", label: "Track record", icon: Trophy },
  { key: "more", label: "More ways", icon: Handshake },
  { key: "contacts", label: "Contacts", icon: Phone },
  { key: "json", label: "JSON", icon: FileJson },
] as const;
type Tab = (typeof TABS)[number]["key"];

const TIER_ICON: Record<string, typeof Trophy> = { "Gold Sponsor": Trophy, "Silver Sponsor": Medal, "Bronze Sponsor": Award };

export interface EditorPage {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  status: "ACTIVE" | "INACTIVE";
  isDefault: boolean;
  updatedAt: string;
  content: SponsorshipContent;
}

export function SponsorshipEditor({ page, action, siteHost }: { page: EditorPage; action: (fd: FormData) => Promise<Result>; siteHost: string }) {
  const [content, setContent] = useState<SponsorshipContent>(page.content);
  const [tab, setTab] = useState<Tab>("hero");
  const [slug, setSlug] = useState(page.slug);
  const [summary, setSummary] = useState(page.summary ?? "");
  const hiddenRef = useRef<HTMLInputElement>(null);
  const first = useRef(true);

  const set = <K extends keyof SponsorshipContent>(key: K, value: SponsorshipContent[K]) => setContent((c) => ({ ...c, [key]: value }));
  const event = content.event ?? {};
  const programs = arr<SponsorProgram>(content.programs);
  const programIndex = Math.max(0, programs.findIndex((p) => p.featured));
  const program: SponsorProgram = programs[programIndex] ?? {};
  const setProgram = (patch: Partial<SponsorProgram>) => {
    const next = [...programs];
    next[programIndex] = { featured: true, ...program, ...patch };
    set("programs", next);
  };
  const packages = arr<SponsorPackage>(content.packages);
  const issues = useMemo(() => contentIssues(content), [content]);
  const json = useMemo(() => JSON.stringify(content), [content]);

  // Edits made with buttons (add, remove, move) count as unsaved changes too, and the preview
  // tab (if open) follows every edit.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    hiddenRef.current?.dispatchEvent(new Event("input", { bubbles: true }));
    const t = setTimeout(() => {
      try {
        localStorage.setItem(draftKey(page.id), JSON.stringify({ content, at: Date.now(), saved: false }));
      } catch { /* private mode: the preview shows the saved page */ }
    }, 300);
    return () => clearTimeout(t);
  }, [content, page.id]);

  const counts: Partial<Record<Tab, number>> = {
    packages: packages.length,
    why: arr(content.whySponsorReasons).length,
    record: arr(content.achievements).length + arr(content.previousPartners).length,
    more: arr(content.otherOpportunities).length,
    contacts: arr(content.contacts).length,
  };
  const errors = issues.filter((i) => i.level === "error");

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <ActionForm action={action} submitLabel="Save page" sticky className="min-w-0 space-y-4" onSuccess={() => {
        try {
          localStorage.setItem(draftKey(page.id), JSON.stringify({ content, at: Date.now(), saved: true }));
        } catch { /* ignore */ }
      }}>
        <Hidden name="expectedUpdatedAt" value={page.updatedAt} />
        <input ref={hiddenRef} type="hidden" name="content" value={json} />

        <FormSection title="Page" description="Its address, how it's listed and who can see it.">
          <div className="grid gap-3 md:grid-cols-2">
            <Field name="title" label="Title" defaultValue={page.title} required hint="On /become-a-sponsor and in the browser tab." />
            <div className="grid gap-1.5">
              <label htmlFor="spn-slug" className="text-sm font-medium leading-none">Address <span className="text-destructive">*</span></label>
              <div className="flex items-center overflow-hidden rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
                <span className="hidden shrink-0 border-r bg-muted px-2.5 py-2 text-xs text-muted-foreground sm:inline">{siteHost}/sponsors/</span>
                <input id="spn-slug" name="slug" required value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-"))}
                  className="h-10 min-w-0 flex-1 bg-transparent px-3 text-base outline-none md:h-9 md:text-sm" aria-describedby="spn-slug-help" />
              </div>
              <p id="spn-slug-help" className={cn("text-xs", slug !== page.slug && page.status === "ACTIVE" ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>
                {slug !== page.slug && page.status === "ACTIVE" ? `Links to /sponsors/${page.slug} stop working after you save.` : "Lowercase letters, digits and hyphens."}
              </p>
            </div>
          </div>
          <label className="grid gap-1.5 text-sm font-medium">
            <span className="flex justify-between">Summary<span className={cn("text-xs font-normal", summary.length > 300 ? "text-destructive" : "text-muted-foreground")}>{summary.length}/300</span></span>
            <textarea name="summary" rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} className={area}
              placeholder="One or two sentences a company reads first: what they support and what they get." />
            <span className="text-xs font-normal text-muted-foreground">On /become-a-sponsor, in search results and in link previews.</span>
          </label>
          <Field name="status" label="Visibility" type="select" defaultValue={page.status}
            options={[{ value: "ACTIVE", label: "Public: on the site and /become-a-sponsor" }, { value: "INACTIVE", label: "Hidden: only in the dashboard and preview" }]}
            hint={page.isDefault ? "The default stays public (make another page the default to hide this one)." : undefined} />
        </FormSection>

        <section aria-label="Content" className="rounded-xl border bg-card">
          <div role="tablist" aria-label="Sections of the page" className="flex gap-1 overflow-x-auto border-b p-1.5 [scrollbar-width:thin]">
            {TABS.map((t) => {
              const Icon = t.icon;
              const n = counts[t.key];
              return (
                <button key={t.key} type="button" role="tab" id={`spn-tab-${t.key}`} aria-selected={tab === t.key} aria-controls={`spn-panel-${t.key}`}
                  onClick={() => setTab(t.key)}
                  className={cn("inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors",
                    tab === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                  <Icon className="h-4 w-4" aria-hidden />{t.label}
                  {n !== undefined && <span className={cn("rounded-full px-1.5 text-[11px] tabular-nums", tab === t.key ? "bg-primary-foreground/20" : "bg-muted")}>{n}</span>}
                </button>
              );
            })}
          </div>

          <div role="tabpanel" id={`spn-panel-${tab}`} aria-labelledby={`spn-tab-${tab}`} className="space-y-4 p-4 sm:p-5">
            {tab === "hero" && (
              <>
                <p className="text-sm text-muted-foreground">The first screen: the badge, the big line and the typed phrases.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Text label="Full name" value={event.fullName} onChange={(v) => set("event", { ...event, fullName: v })} placeholder="CSE Carnival 2026" hint="Used across the page." />
                  <Text label="Short name (badge)" value={event.name} onChange={(v) => set("event", { ...event, name: v })} placeholder="CSE CARNIVAL 2026" hint="The small badge in the hero." />
                  <Text label="Organizer" value={event.organizer} onChange={(v) => set("event", { ...event, organizer: v })} placeholder="Green University Computer Club (GUCC)" className="sm:col-span-2" />
                </div>
                <label className={label}>Hero line
                  <textarea className={area} rows={3} value={content.heroSubtitle ?? ""} onChange={(e) => set("heroSubtitle", e.target.value || undefined)}
                    placeholder={`Partner with Green University Computer Club to sponsor ${program.name ?? event.fullName ?? "…"}. (Made from the program when empty.)`} />
                </label>
                <LinesField label="Typed phrases" value={content.typingPhrases} onChange={(v) => set("typingPhrases", v.length ? v : undefined)} rows={4}
                  placeholder={"Programming Contests\nHackathons"} hint="Typed one after another next to the badge. Empty: made from the program's parts." />
              </>
            )}

            {tab === "program" && (
              <>
                <p className="text-sm text-muted-foreground">What a sponsor supports: the program card with its parts and what the sponsor gets.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Text label="Program name" value={program.name} onChange={(v) => setProgram({ name: v })} placeholder="Year-round Club Partnership" />
                  <Text label="Label" value={program.category} onChange={(v) => setProgram({ category: v })} placeholder="Flagship" hint={'"Flagship" shows "Flagship Program".'} />
                </div>
                <label className={label}>Description
                  <textarea className={area} rows={3} value={program.description ?? ""} onChange={(e) => setProgram({ description: e.target.value })} />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <LinesField label="Parts" value={program.components} onChange={(v) => setProgram({ components: v })} rows={6}
                    placeholder={"IUPC (Inter University Programming Contest)\nWorkshops"} hint={'Each gets a card. "Short (Full name)" shows both.'} />
                  <LinesField label="Sponsor value" value={program.sponsorValue} onChange={(v) => setProgram({ sponsorValue: v })} rows={6} placeholder="Brand presence across every event" />
                </div>
                <fieldset className="grid gap-2">
                  <legend className="mb-1 text-xs font-medium">Highlights <span className="font-normal text-muted-foreground">· four figures under the description (empty: 500+ Participants, Multi-day Event, …)</span></legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {[0, 1, 2, 3].map((i) => {
                      const f = program.facts?.[i] ?? { value: "", label: "" };
                      const put = (patch: Partial<{ value: string; label: string }>) => {
                        const facts = [0, 1, 2, 3].map((k) => (k === i ? { ...f, ...patch } : program.facts?.[k] ?? { value: "", label: "" }));
                        setProgram({ facts: facts.some((x) => x.value.trim() || x.label.trim()) ? facts : undefined });
                      };
                      return (
                        <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border p-2">
                          <input className={input} value={f.value} placeholder="7,000+" aria-label={`Highlight ${i + 1} figure`} onChange={(e) => put({ value: e.target.value })} />
                          <input className={input} value={f.label} placeholder="Students reached" aria-label={`Highlight ${i + 1} label`} onChange={(e) => put({ label: e.target.value })} />
                        </div>
                      );
                    })}
                  </div>
                </fieldset>
                {programs.length > 1 && <p className="text-xs text-muted-foreground">This page has {programs.length} programs; the one marked featured is shown and edited here. Edit the others in JSON.</p>}
              </>
            )}

            {tab === "packages" && (
              <>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <p className="max-w-xl text-sm text-muted-foreground">Gold, Silver and Bronze get their own colours. A price of 0 shows <strong>On request</strong> (to agree with each company).</p>
                  {packages.length > 0 && (
                    <label className={cn(label, "min-w-48")}>Recommended (raised, glowing)
                      <select className={input} value={Math.max(0, packages.findIndex((p) => p.highlight))}
                        onChange={(e) => set("packages", packages.map((p, i) => ({ ...p, highlight: i === Number(e.target.value) })))}>
                        {packages.map((p, i) => <option key={i} value={i}>{p.tier || `Package ${i + 1}`}</option>)}
                      </select>
                    </label>
                  )}
                </div>
                <datalist id="spn-tiers">{SPONSOR_TIERS.map((t) => <option key={t} value={t} />)}</datalist>
                <datalist id="spn-periods">{["per event", "per semester", "per academic year", "per year"].map((t) => <option key={t} value={t} />)}</datalist>
                <Rows<SponsorPackage> rows={packages} setRows={(r) => set("packages", r)} max={6} addLabel="Add a package" empty="No packages: the section is hidden."
                  blank={{ tier: SPONSOR_TIERS.find((t) => !packages.some((p) => p.tier === t)) ?? "", slots: 1, price: 0, currency: "BDT", highlight: packages.length === 0, benefits: [] }}
                  render={(p, update) => {
                    const Icon = TIER_ICON[p.tier] ?? Award;
                    const onRequest = !(Number(p.price) > 0);
                    return (
                      <div className="grid gap-3">
                        <p className="flex items-center gap-2 text-sm font-semibold"><Icon className="h-4 w-4 text-primary" aria-hidden />{p.tier || "New package"}{p.highlight && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] text-primary">Recommended</span>}</p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <label className={label}>Tier<input className={input} list="spn-tiers" value={p.tier} onChange={(e) => update({ tier: e.target.value })} /></label>
                          <label className={label}>Slots<input className={input} type="number" min={1} max={99} value={p.slots} onChange={(e) => update({ slots: Math.max(1, Math.round(Number(e.target.value) || 1)) })} /></label>
                          <div className="grid gap-1 text-xs font-medium sm:col-span-2">
                            <span>Price</span>
                            <div className="flex flex-wrap items-center gap-2">
                              <input className={cn(input, "w-auto min-w-0 flex-1 basis-32")} type="number" min={0} step={1000} value={onRequest ? "" : p.price} disabled={onRequest} placeholder="On request" aria-label={`${p.tier || "Package"} price`}
                                onChange={(e) => update({ price: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
                              <select className={cn(input, "w-24 shrink-0")} value={p.currency || "BDT"} aria-label="Currency" onChange={(e) => update({ currency: e.target.value })}>
                                {["BDT", "USD", "EUR"].map((c) => <option key={c}>{c}</option>)}
                              </select>
                              <label className="flex min-h-10 shrink-0 items-center gap-2"><input type="checkbox" className="h-4 w-4" checked={onRequest} onChange={(e) => update({ price: e.target.checked ? 0 : 10000 })} />On request</label>
                            </div>
                          </div>
                        </div>
                        <Text label="Period (optional)" value={p.period} onChange={(v) => update({ period: v || undefined })} placeholder="per academic year" />
                        <LinesField label="Benefits" value={p.benefits} onChange={(v) => update({ benefits: v })} rows={5} />
                      </div>
                    );
                  }} />
                <details className="rounded-lg border p-3" open={arr(content.comparisonFeatures).length > 0}>
                  <summary className="cursor-pointer text-sm font-semibold">Comparison table <span className="font-normal text-muted-foreground">({arr(content.comparisonFeatures).length} rows; Gold, Silver, Bronze)</span></summary>
                  <div className="mt-3">
                    <Rows<SponsorComparison> rows={arr(content.comparisonFeatures)} setRows={(r) => set("comparisonFeatures", r)} max={30} addLabel="Add a row" empty="No comparison table."
                      blank={{ feature: "", gold: true, silver: false, bronze: false }}
                      render={(r, update) => (
                        <div className="grid items-center gap-2 sm:grid-cols-[1fr_auto]">
                          <input className={input} value={r.feature} placeholder="Logo on every event" aria-label="Feature" onChange={(e) => update({ feature: e.target.value })} />
                          <div className="flex gap-3">
                            {(["gold", "silver", "bronze"] as const).map((k) => (
                              <label key={k} className="flex min-h-10 items-center gap-1.5 text-xs font-medium capitalize"><input type="checkbox" className="h-4 w-4" checked={r[k]} onChange={(e) => update({ [k]: e.target.checked })} />{k}</label>
                            ))}
                          </div>
                        </div>
                      )} />
                  </div>
                </details>
              </>
            )}

            {tab === "why" && (
              <>
                <p className="text-sm text-muted-foreground">Why a company should sponsor: one card each.</p>
                <Rows<SponsorReason> rows={arr(content.whySponsorReasons)} setRows={(r) => set("whySponsorReasons", r)} max={12} addLabel="Add a reason" empty="No reasons: the section is hidden."
                  blank={{ title: "", description: "", icon: "Lightbulb" }}
                  render={(r, update) => (
                    <div className="grid gap-2 sm:grid-cols-[1fr_10rem]">
                      <Text label="Title" value={r.title} onChange={(v) => update({ title: v })} />
                      <IconSelect value={r.icon} onChange={(v) => update({ icon: v || undefined })} />
                      <label className={cn(label, "sm:col-span-2")}>Description<textarea className={area} rows={2} value={r.description} onChange={(e) => update({ description: e.target.value })} /></label>
                    </div>
                  )} />
              </>
            )}

            {tab === "record" && (
              <>
                <h3 className="text-sm font-semibold">Achievements</h3>
                <Rows<SponsorAchievement> rows={arr(content.achievements)} setRows={(r) => set("achievements", r)} max={12} addLabel="Add an achievement" empty="No achievements: the section is hidden."
                  blank={{ title: "", description: "" }}
                  render={(a, update) => (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Text label="Title" value={a.title} onChange={(v) => update({ title: v })} placeholder="HackTheAI 2025" />
                      <Text label="Event address (optional)" value={a.eventSlug} onChange={(v) => update({ eventSlug: v.trim() || undefined })} placeholder="hacktheai-2025" hint="Links the card to /events/<address>." />
                      <label className={cn(label, "sm:col-span-2")}>Description<textarea className={area} rows={2} value={a.description} onChange={(e) => update({ description: e.target.value })} /></label>
                    </div>
                  )} />
                <h3 className="pt-2 text-sm font-semibold">Previous partners <span className="font-normal text-muted-foreground">(the logo strip)</span></h3>
                <Rows<SponsorPartner> rows={arr(content.previousPartners)} setRows={(r) => set("previousPartners", r)} max={60} addLabel="Add a partner" empty="No partners: the logo strip is hidden."
                  blank={{ name: "", logo: "" }}
                  render={(p, update) => (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Text label="Name" value={p.name} onChange={(v) => update({ name: v })} placeholder="GitHub" className="sm:col-span-2" />
                      <LogoField value={p.logo} name={p.name} onChange={(logo) => update({ logo })} />
                    </div>
                  )} />
              </>
            )}

            {tab === "more" && (
              <>
                <p className="text-sm text-muted-foreground">Smaller ways to support (t-shirts, food, prizes, cloud credits): one card each.</p>
                <Rows<SponsorOpportunity> rows={arr(content.otherOpportunities)} setRows={(r) => set("otherOpportunities", r)} max={12} addLabel="Add a way to support" empty="None: the section is hidden."
                  blank={{ title: "", detail: "", description: "", icon: "Gift" }}
                  render={(o, update) => (
                    <div className="grid gap-2 sm:grid-cols-3">
                      <Text label="Title" value={o.title} onChange={(v) => update({ title: v })} placeholder="T-Shirt Partner" />
                      <Text label="Detail" value={o.detail} onChange={(v) => update({ detail: v })} placeholder="200 pieces" />
                      <IconSelect value={o.icon} onChange={(v) => update({ icon: v || undefined })} />
                      <label className={cn(label, "sm:col-span-3")}>Description<textarea className={area} rows={2} value={o.description} onChange={(e) => update({ description: e.target.value })} /></label>
                    </div>
                  )} />
              </>
            )}

            {tab === "contacts" && (
              <>
                <p className="text-sm text-muted-foreground">Who a company talks to. Without contacts, &ldquo;Contact us&rdquo; opens the site&apos;s contact form.</p>
                <Rows<SponsorContact> rows={arr(content.contacts)} setRows={(r) => set("contacts", r)} max={8} addLabel="Add a contact" empty="No contacts."
                  blank={{ name: "", role: "", organization: "Green University Computer Club (GUCC)", phone: "", email: "", website: "gucc.green.edu.bd" }}
                  render={(c, update) => (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Text label="Name" value={c.name} onChange={(v) => update({ name: v })} />
                      <Text label="Role" value={c.role} onChange={(v) => update({ role: v })} placeholder="President" />
                      <Text label="Phone" type="tel" value={c.phone} onChange={(v) => update({ phone: v })} placeholder="01XXXXXXXXX" />
                      <Text label="Email" type="email" value={c.email} onChange={(v) => update({ email: v })} />
                      <Text label="Organization" value={c.organization} onChange={(v) => update({ organization: v })} />
                      <Text label="Website" value={c.website} onChange={(v) => update({ website: v })} />
                    </div>
                  )} />
              </>
            )}

            {tab === "json" && <JsonTab content={content} onApply={setContent} />}
          </div>
        </section>
      </ActionForm>

      <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
        <div className="rounded-xl border bg-card p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><Eye className="h-4 w-4" aria-hidden />See it</h2>
          <p className="mt-1 text-xs text-muted-foreground">The preview opens in a new tab and follows your edits as you type, before you save.</p>
          <div className="mt-3 grid gap-2">
            <Button asChild className="min-h-10 gap-1.5"><Link href={`/sponsors/preview/${page.id}`} target="_blank" prefetch={false}><Eye className="h-4 w-4" aria-hidden />Live preview</Link></Button>
            {page.status === "ACTIVE" && <Button asChild variant="outline" className="min-h-10 gap-1.5"><Link href={`/sponsors/${page.slug}`} target="_blank" prefetch={false}>Public page<ExternalLink className="h-4 w-4" aria-hidden /></Link></Button>}
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4" aria-live="polite">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><ListChecks className="h-4 w-4" aria-hidden />Checklist</h2>
          {issues.length === 0 ? (
            <p className="mt-2 flex items-start gap-2 text-sm text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />Ready: every section a sponsor looks for is filled in.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {issues.map((i) => (
                <li key={i.text} className={cn("flex items-start gap-2 text-sm", i.level === "error" ? "text-destructive" : "text-muted-foreground")}>
                  {i.level === "error" ? <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />}{i.text}
                </li>
              ))}
            </ul>
          )}
          {errors.length > 0 && <p className="mt-3 text-xs text-muted-foreground">Fix the red ones before you make the page public.</p>}
        </div>
        <div className="rounded-xl border bg-card p-4 text-xs text-muted-foreground">
          <p className="flex items-center gap-1.5 font-semibold text-foreground"><Star className="h-3.5 w-3.5" aria-hidden />Tips</p>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            <li>A page about the whole club (no event) gets the most use: send it to any company.</li>
            <li>Price 0 shows &ldquo;On request&rdquo;: agree the amount with each company.</li>
            <li>To start a new event from this page, use Duplicate in the list.</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}

/** Everything as JSON, for the parts the fields above don't cover. Applied only when it's valid. */
function JsonTab({ content, onApply }: { content: SponsorshipContent; onApply: (c: SponsorshipContent) => void }) {
  const pretty = useMemo(() => JSON.stringify(content, null, 2), [content]);
  const [text, setText] = useState(pretty);
  const [error, setError] = useState<string | null>(null);
  const changed = text !== pretty;
  const apply = () => {
    try {
      const v = JSON.parse(text) as unknown;
      if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("It must be an object ({ … }).");
      setError(null);
      onApply(v as SponsorshipContent);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">The whole page as JSON. Apply it to update the fields; Save saves it.</p>
      <textarea className={cn(area, "font-mono text-xs md:text-xs")} rows={24} spellCheck={false} value={text} aria-label="Content as JSON" aria-invalid={Boolean(error)}
        onChange={(e) => { setText(e.target.value); setError(null); }} />
      {error && <p role="alert" className="text-sm text-destructive">Not applied: {error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" className="min-h-10" disabled={!changed} onClick={apply}>Apply JSON</Button>
        <Button type="button" size="sm" variant="outline" className="min-h-10" disabled={!changed} onClick={() => { setText(pretty); setError(null); }}>Undo JSON edits</Button>
        <Button type="button" size="sm" variant="ghost" className="min-h-10" onClick={() => void navigator.clipboard?.writeText(pretty)}>Copy</Button>
      </div>
    </div>
  );
}
