"use client";

/**
 * The page builder: the order of the page's sections (drag them on a computer, or use the arrows),
 * which ones show, their headings, and blocks of your own (text, figures, questions, quotes,
 * dates, a video, a call to action, pictures, a download). Plus the page's look (accent colour,
 * hero) and how it appears in search results and link previews.
 */
import { useState } from "react";
import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, GripVertical, ImagePlus, Plus, Trash2 } from "lucide-react";
import { Rows } from "@/components/admin/structured-editors";
import { Button } from "@/components/ui/button";
import { uploadImage } from "@/lib/media/client";
import { cn } from "@/lib/utils";
import {
  ACCENTS, BLOCK_HINT, BLOCK_TYPES, blankBlock, isBlock, SECTION_LABEL, sectionsOf, videoEmbed,
  type Accent, type BlockData, type BlockType, type SectionEntry, type SectionedContent,
} from "@/lib/sponsorship/sections";

const input = "h-10 w-full rounded-md border border-input bg-background px-3 text-base md:h-9 md:text-sm";
const area = "w-full rounded-md border border-input bg-background px-3 py-2 text-base md:text-sm";
const label = "grid gap-1 text-xs font-medium";

let seq = 0;
const newId = (type: string) => `${type}-${Date.now().toString(36)}${(++seq).toString(36)}`;

/** What a built-in section shows, for the list. */
const BUILTIN_SOURCE: Record<string, string> = {
  recognition: "The Club Excellence Award card", programs: "Program tab", why: "Why sponsor tab", achievements: "Track record tab", partners: "Track record tab (logos)",
  packages: "Packages tab", opportunities: "More ways tab", gallery: "Photos from past events", contact: "Contacts tab",
};

function Counter({ value, max }: { value: string; max: number }) {
  return <span className={cn("font-normal", value.length > max ? "text-destructive" : "text-muted-foreground")}>{value.length}/{max}</span>;
}

/** Upload a picture (kept in the media library) or paste an address. */
function ImageInput({ value, onChange, alt, aria }: { value: string; onChange: (url: string) => void; alt: string; aria: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-sm hover:bg-muted md:min-h-9">
          <ImagePlus className="h-4 w-4" aria-hidden />{busy ? "Uploading…" : value ? "Replace" : "Upload"}
          <input type="file" accept="image/*" className="sr-only" disabled={busy} onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            setBusy(true);
            setError(null);
            const r = await uploadImage(f, { alt });
            setBusy(false);
            if (!r.ok || !r.url) return setError(r.ok ? "Upload finished without an address." : r.error);
            onChange(r.url);
          }} />
        </label>
        <input className={cn(input, "min-w-0 flex-1 font-mono text-xs md:text-xs")} value={value} placeholder="https://…" aria-label={aria} onChange={(e) => onChange(e.target.value)} />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function BlockEditor({ s, set }: { s: SectionEntry; set: (data: unknown) => void }) {
  switch (s.type as BlockType) {
    case "text": {
      const d = (s.data ?? { markdown: "" }) as BlockData["text"];
      return (
        <label className={label}>Text <span className="font-normal text-muted-foreground">· Markdown: **bold**, - lists, [links](https://…), ## headings</span>
          <textarea className={cn(area, "font-mono text-sm")} rows={8} value={d.markdown} onChange={(e) => set({ markdown: e.target.value })} />
        </label>
      );
    }
    case "stats": {
      const d = (s.data ?? { items: [] }) as BlockData["stats"];
      return <Rows rows={d.items} setRows={(items) => set({ items })} max={8} addLabel="Add a figure" empty="No figures." blank={{ value: "", label: "" }}
        render={(x, update) => (
          <div className="grid grid-cols-2 gap-2">
            <input className={input} value={x.value} placeholder="500+" aria-label="Figure" onChange={(e) => update({ value: e.target.value })} />
            <input className={input} value={x.label} placeholder="Participants" aria-label="Label" onChange={(e) => update({ label: e.target.value })} />
          </div>
        )} />;
    }
    case "faq": {
      const d = (s.data ?? { items: [] }) as BlockData["faq"];
      return <Rows rows={d.items} setRows={(items) => set({ items })} max={20} addLabel="Add a question" empty="No questions." blank={{ q: "", a: "" }}
        render={(x, update) => (
          <div className="grid gap-2">
            <input className={input} value={x.q} placeholder="Can we sponsor only one contest?" aria-label="Question" onChange={(e) => update({ q: e.target.value })} />
            <textarea className={area} rows={3} value={x.a} placeholder="The answer" aria-label="Answer" onChange={(e) => update({ a: e.target.value })} />
          </div>
        )} />;
    }
    case "testimonials": {
      const d = (s.data ?? { items: [] }) as BlockData["testimonials"];
      return <Rows rows={d.items} setRows={(items) => set({ items })} max={12} addLabel="Add a quote" empty="No quotes." blank={{ quote: "", name: "", role: "" }}
        render={(x, update) => (
          <div className="grid gap-2 sm:grid-cols-2">
            <textarea className={cn(area, "sm:col-span-2")} rows={3} value={x.quote} placeholder="What they said" aria-label="Quote" onChange={(e) => update({ quote: e.target.value })} />
            <input className={input} value={x.name} placeholder="Name" aria-label="Name" onChange={(e) => update({ name: e.target.value })} />
            <input className={input} value={x.role ?? ""} placeholder="Role, company" aria-label="Role" onChange={(e) => update({ role: e.target.value })} />
          </div>
        )} />;
    }
    case "timeline": {
      const d = (s.data ?? { items: [] }) as BlockData["timeline"];
      return <Rows rows={d.items} setRows={(items) => set({ items })} max={20} addLabel="Add a date" empty="No dates." blank={{ date: "", title: "", detail: "" }}
        render={(x, update) => (
          <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
            <input className={input} value={x.date} placeholder="15 November" aria-label="Date" onChange={(e) => update({ date: e.target.value })} />
            <input className={input} value={x.title} placeholder="Sponsorship deadline" aria-label="What happens" onChange={(e) => update({ title: e.target.value })} />
            <input className={cn(input, "sm:col-span-2")} value={x.detail ?? ""} placeholder="Detail (optional)" aria-label="Detail" onChange={(e) => update({ detail: e.target.value })} />
          </div>
        )} />;
    }
    case "video": {
      const d = (s.data ?? { url: "" }) as BlockData["video"];
      const ok = !d.url || Boolean(videoEmbed(d.url));
      return (
        <div className="grid gap-2">
          <label className={label}>YouTube or Vimeo link
            <input className={input} value={d.url} placeholder="https://www.youtube.com/watch?v=…" aria-invalid={!ok} onChange={(e) => set({ ...d, url: e.target.value })} />
            {!ok && <span className="font-normal text-destructive">Use a YouTube or Vimeo address (https).</span>}
          </label>
          <label className={label}>Caption<input className={input} value={d.caption ?? ""} onChange={(e) => set({ ...d, caption: e.target.value })} /></label>
        </div>
      );
    }
    case "cta": {
      const d = (s.data ?? { label: "", href: "" }) as BlockData["cta"];
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className={cn(label, "sm:col-span-2")}>Line<input className={input} value={d.text ?? ""} onChange={(e) => set({ ...d, text: e.target.value })} /></label>
          <label className={label}>Button<input className={input} value={d.label} onChange={(e) => set({ ...d, label: e.target.value })} /></label>
          <label className={label}>Link<input className={input} value={d.href} placeholder="#contact, /contact or https://…" onChange={(e) => set({ ...d, href: e.target.value })} /></label>
        </div>
      );
    }
    case "images": {
      const d = (s.data ?? { items: [] }) as BlockData["images"];
      return <Rows rows={d.items} setRows={(items) => set({ items })} max={24} addLabel="Add a picture" empty="No pictures." blank={{ src: "", alt: "" }}
        render={(x, update) => (
          <div className="grid gap-2">
            <ImageInput value={x.src} alt={x.alt} aria="Picture address" onChange={(src) => update({ src })} />
            <input className={input} value={x.alt} placeholder="What it shows (for screen readers)" aria-label="Description" onChange={(e) => update({ alt: e.target.value })} />
          </div>
        )} />;
    }
    case "download": {
      const d = (s.data ?? { label: "", href: "" }) as BlockData["download"];
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className={label}>Label<input className={input} value={d.label} onChange={(e) => set({ ...d, label: e.target.value })} /></label>
          <label className={label}>File link<input className={input} value={d.href} placeholder="https://…/proposal.pdf" onChange={(e) => set({ ...d, href: e.target.value })} /></label>
          <label className={cn(label, "sm:col-span-2")}>Note<input className={input} value={d.note ?? ""} placeholder="12 pages · updated October 2026" onChange={(e) => set({ ...d, note: e.target.value })} /></label>
          <p className="text-xs text-muted-foreground sm:col-span-2">Shown as a card, and the hero&apos;s second button becomes this download.</p>
        </div>
      );
    }
    default:
      return null;
  }
}

/** The order and visibility of the sections, and the page's own blocks. */
export function LayoutTab({ content, setContent }: { content: SectionedContent; setContent: (c: SectionedContent) => void }) {
  const sections = sectionsOf(content);
  const [open, setOpen] = useState<string | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const put = (next: SectionEntry[]) => setContent({ ...content, sections: next });
  const update = (i: number, patch: Partial<SectionEntry>) => put(sections.map((s, k) => (k === i ? { ...s, ...patch } as SectionEntry : s)));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= sections.length || from === to) return;
    const next = [...sections];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x!);
    put(next);
  };
  const add = (type: BlockType) => {
    const b = blankBlock(type, newId(type));
    // New blocks go before the contacts (the page's natural end).
    const at = sections.findIndex((s) => s.type === "contact");
    const next = [...sections];
    next.splice(at === -1 ? next.length : at, 0, b);
    put(next);
    setOpen(b.id);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">The hero is always first. Drag the sections (or use the arrows), hide what you don&apos;t need, and add blocks of your own. Empty sections never show.</p>
      <ol className="space-y-2" aria-label="Sections, in order">
        {sections.map((s, i) => {
          const block = isBlock(s.type);
          const hidden = s.visible === false;
          return (
            <li key={s.id} draggable onDragStart={() => setDragging(i)} onDragEnd={() => setDragging(null)}
              onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (dragging !== null) move(dragging, i); setDragging(null); }}
              className={cn("rounded-lg border bg-background", dragging === i && "opacity-50", hidden && "bg-muted/40")}>
              <div className="flex items-center gap-1.5 p-2">
                <GripVertical className="hidden h-4 w-4 shrink-0 cursor-grab text-muted-foreground md:block" aria-hidden />
                <button type="button" className="min-w-0 flex-1 rounded-md px-1 py-1 text-left" onClick={() => setOpen(open === s.id ? null : s.id)} aria-expanded={open === s.id}>
                  <span className={cn("block truncate text-sm font-medium", hidden && "text-muted-foreground line-through")}>{s.heading || SECTION_LABEL[s.type]}</span>
                  <span className="block truncate text-xs text-muted-foreground">{block ? `Block · ${SECTION_LABEL[s.type]}` : BUILTIN_SOURCE[s.type]}</span>
                </button>
                <Button type="button" size="icon" variant="ghost" className="h-10 w-10" onClick={() => update(i, { visible: hidden })} aria-label={hidden ? `Show ${SECTION_LABEL[s.type]}` : `Hide ${SECTION_LABEL[s.type]}`} aria-pressed={!hidden}>
                  {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button type="button" size="icon" variant="ghost" className="h-10 w-10" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label="Move up"><ArrowUp className="h-4 w-4" /></Button>
                <Button type="button" size="icon" variant="ghost" className="h-10 w-10" onClick={() => move(i, i + 1)} disabled={i === sections.length - 1} aria-label="Move down"><ArrowDown className="h-4 w-4" /></Button>
              </div>
              {open === s.id && (
                <div className="space-y-3 border-t p-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className={label}>Heading <span className="font-normal text-muted-foreground">(empty: the usual one)</span>
                      <input className={input} value={s.heading ?? ""} onChange={(e) => update(i, { heading: e.target.value || undefined })} />
                    </label>
                    <label className={label}>Line under it
                      <input className={input} value={s.subheading ?? ""} onChange={(e) => update(i, { subheading: e.target.value || undefined })} />
                    </label>
                  </div>
                  {block && <BlockEditor s={s} set={(data) => update(i, { data } as Partial<SectionEntry>)} />}
                  {block && (
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button type="button" size="sm" variant="outline" className="min-h-10 gap-1.5" onClick={() => { const copy = { ...structuredClone(s), id: newId(s.type) }; const next = [...sections]; next.splice(i + 1, 0, copy); put(next); }}>
                        <Copy className="h-4 w-4" aria-hidden />Duplicate
                      </Button>
                      <Button type="button" size="sm" variant="ghost" className="min-h-10 gap-1.5 text-destructive" onClick={() => put(sections.filter((_, k) => k !== i))}>
                        <Trash2 className="h-4 w-4" aria-hidden />Delete block
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Add a block</legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {BLOCK_TYPES.map((t) => (
            <button key={t} type="button" onClick={() => add(t)} disabled={sections.length >= 30}
              className="flex min-h-14 items-start gap-2 rounded-lg border p-3 text-left text-sm transition-colors hover:border-primary/50 hover:bg-primary/5 disabled:opacity-50">
              <Plus className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              <span><span className="block font-medium">{SECTION_LABEL[t]}</span><span className="block text-xs text-muted-foreground">{BLOCK_HINT[t]}</span></span>
            </button>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

/** Accent colour, hero, and how the page looks in search results and link previews. */
export function LookTab({ content, setContent, title, summary, slug, siteHost }: { content: SectionedContent; setContent: (c: SectionedContent) => void; title: string; summary: string; slug: string; siteHost: string }) {
  const theme = content.theme ?? {};
  const seo = content.seo ?? {};
  const stats = content.heroStats ?? [];
  const setTheme = (patch: Partial<NonNullable<SectionedContent["theme"]>>) => setContent({ ...content, theme: { ...theme, ...patch } });
  const setSeo = (patch: Partial<NonNullable<SectionedContent["seo"]>>) => setContent({ ...content, seo: { ...seo, ...patch } });
  const name = content.event?.fullName ?? title;
  const shownTitle = seo.title || (title === name ? `Sponsor ${name}` : title);
  const shownDescription = seo.description || summary || `Sponsor ${name} with the Green University Computer Club: sponsorship packages, the programs you support and how to get in touch.`;
  return (
    <div className="space-y-6">
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Accent colour</legend>
        <p className="text-xs text-muted-foreground">Highlights, icons and figures. Buttons keep the club&apos;s green.</p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(ACCENTS) as Accent[]).map((a) => (
            <button key={a} type="button" onClick={() => setTheme({ accent: a })} aria-pressed={(theme.accent ?? "green") === a} aria-label={a}
              className={cn("h-10 w-10 rounded-full border-2 transition-transform hover:scale-105", (theme.accent ?? "green") === a ? "border-foreground" : "border-transparent")}
              style={{ background: ACCENTS[a] }} />
          ))}
        </div>
      </fieldset>
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Hero</h3>
        <label className={label}><span className="flex justify-between">Big line <Counter value={content.heroTitle ?? ""} max={80} /></span>
          <input className={input} value={content.heroTitle ?? ""} placeholder="Become Our Partner" onChange={(e) => setContent({ ...content, heroTitle: e.target.value || undefined })} />
        </label>
        <div className={label}>Picture (computers; empty: the code card)
          <ImageInput value={theme.heroImage ?? ""} alt={`${name} hero`} aria="Hero picture address" onChange={(heroImage) => setTheme({ heroImage: heroImage || undefined })} />
        </div>
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-xs font-medium">Figures under the buttons <span className="font-normal text-muted-foreground">(empty: 7,000+ community members, 50+ universities, …)</span></legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => {
              const f = stats[i] ?? { value: "", label: "" };
              const put = (patch: Partial<{ value: string; label: string }>) => {
                const next = [0, 1, 2, 3].map((k) => (k === i ? { ...f, ...patch } : stats[k] ?? { value: "", label: "" }));
                setContent({ ...content, heroStats: next.some((x) => x.value.trim()) ? next : undefined });
              };
              return (
                <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border p-2">
                  <input className={input} value={f.value} placeholder="7,000+" aria-label={`Figure ${i + 1}`} onChange={(e) => put({ value: e.target.value })} />
                  <input className={input} value={f.label} placeholder="Students" aria-label={`Figure ${i + 1} label`} onChange={(e) => put({ label: e.target.value })} />
                </div>
              );
            })}
          </div>
        </fieldset>
      </div>
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Search results and link previews</h3>
        <label className={label}><span className="flex justify-between">Title <Counter value={seo.title ?? ""} max={60} /></span>
          <input className={input} value={seo.title ?? ""} placeholder={shownTitle} onChange={(e) => setSeo({ title: e.target.value || undefined })} />
        </label>
        <label className={label}><span className="flex justify-between">Description <Counter value={seo.description ?? ""} max={160} /></span>
          <textarea className={area} rows={3} value={seo.description ?? ""} placeholder={shownDescription} onChange={(e) => setSeo({ description: e.target.value || undefined })} />
        </label>
        <div className={label}>Preview picture (1200 × 630; empty: a GUCC card with the price)
          <ImageInput value={seo.ogImage ?? ""} alt={`${name} preview`} aria="Preview picture address" onChange={(ogImage) => setSeo({ ogImage: ogImage || undefined })} />
        </div>
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4" checked={seo.noIndex === true} onChange={(e) => setSeo({ noIndex: e.target.checked || undefined })} />
          Keep it out of search engines (shared by link only)
        </label>
        <div className="rounded-lg border bg-background p-3" aria-label="How it looks in search results">
          <p className="truncate text-xs text-muted-foreground">{siteHost}/sponsors/{slug}</p>
          <p className="truncate text-base font-medium text-blue-700 dark:text-blue-400">{shownTitle} | GUCC</p>
          <p className="line-clamp-2 text-sm text-muted-foreground">{shownDescription.slice(0, 160)}</p>
        </div>
      </div>
    </div>
  );
}
