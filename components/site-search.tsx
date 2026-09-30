"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, CornerDownLeft, FileText, Loader2, Newspaper, Search, UserRound } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { SearchItem } from "@/app/search-index.json/route";

const KIND: Record<SearchItem["kind"], { label: string; icon: typeof Search }> = {
  page: { label: "Pages", icon: FileText },
  event: { label: "Events", icon: CalendarDays },
  post: { label: "Blog", icon: Newspaper },
  person: { label: "Executives", icon: UserRound },
};
const ORDER: SearchItem["kind"][] = ["page", "event", "post", "person"];
const SUGGESTED = ["/events", "/join", "/executives", "/blog", "/contact"];

/** Loaded once per visit, on first open. */
let index: Promise<SearchItem[]> | null = null;
const loadIndex = () =>
  (index ??= fetch("/search-index.json").then((r) => (r.ok ? r.json() : { items: [] })).then((d: { items?: SearchItem[] }) => d.items ?? [], () => {
    index = null;
    return [];
  }));

const fold = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");

/** Every word must match; a title that starts with the query ranks first, then title matches. */
function rank(items: SearchItem[], q: string): SearchItem[] {
  const words = fold(q).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const scored: Array<{ it: SearchItem; s: number }> = [];
  for (const it of items) {
    const title = fold(it.title);
    const hay = `${title} ${fold(it.meta ?? "")} ${fold(it.keywords ?? "")}`;
    if (!words.every((w) => hay.includes(w))) continue;
    const s = (title.startsWith(words[0]!) ? 4 : 0) + words.filter((w) => title.includes(w)).length * 2 + (it.kind === "page" ? 1 : 0);
    scored.push({ it, s });
  }
  // Equally good matches: the newest first.
  return scored.sort((a, b) => b.s - a.s || (b.it.at ?? "").localeCompare(a.it.at ?? "")).slice(0, 40).map((x) => x.it);
}

function Highlight({ text, q }: { text: string; q: string }) {
  const w = q.trim().split(/\s+/)[0];
  if (!w) return <>{text}</>;
  const i = fold(text).indexOf(fold(w));
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<mark className="rounded-sm bg-primary/20 text-inherit">{text.slice(i, i + w.length)}</mark>{text.slice(i + w.length)}</>;
}

/**
 * Search the whole site from the navbar: pages, events, blog posts and the current committee.
 * Opens with the button, Ctrl/⌘ K or "/"; arrows move, Enter opens, Escape closes.
 */
export function SiteSearch({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<SearchItem[] | null>(null);
  const [active, setActive] = useState(0);
  const [mac, setMac] = useState(false);
  const router = useRouter();
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void loadIndex().then((all) => alive && setItems(all));
    return () => {
      alive = false;
    };
  }, [open]);

  const results = useMemo(() => {
    if (!items) return [];
    if (!q.trim()) return SUGGESTED.map((h) => items.find((i) => i.href === h)).filter((x): x is SearchItem => Boolean(x));
    return rank(items, q);
  }, [items, q]);

  // Grouped by kind for display; `flat` keeps the keyboard order the same as what's shown.
  const groups = useMemo(() => (q.trim() ? ORDER.map((k) => ({ k, rows: results.filter((r) => r.kind === k) })).filter((g) => g.rows.length) : [{ k: "page" as const, rows: results }]), [results, q]);
  const flat = useMemo(() => groups.flatMap((g) => g.rows), [groups]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const go = useCallback((it: SearchItem | undefined) => {
    if (!it) return;
    setOpen(false);
    setQ("");
    router.push(it.href);
  }, [router]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(flat.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(flat[active]);
    }
  }

  let n = -1;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Search the site" aria-keyshortcuts="Control+K Meta+K /"
        className={cn(
          "inline-flex h-10 w-10 items-center justify-center gap-2 rounded-full text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          // From 1536 px: a labelled field with its shortcut.
          "2xl:w-auto 2xl:justify-start 2xl:border 2xl:bg-muted/40 2xl:pl-3 2xl:pr-2",
          className,
        )}>
        <Search className="h-[18px] w-[18px] shrink-0 2xl:h-4 2xl:w-4" aria-hidden />
        <span className="hidden pr-4 2xl:inline">Search</span>
        <kbd className="hidden rounded border bg-background px-1.5 py-0.5 font-sans text-[10px] font-medium 2xl:inline" aria-hidden>{mac ? "⌘" : "Ctrl"} K</kbd>
      </button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(""); }}>
        <DialogContent className="top-[10dvh] flex max-h-[80dvh] translate-y-0 flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:p-0 data-[state=open]:slide-in-from-top-4 sm:top-[12dvh] sm:max-w-xl [&>button:last-child]:hidden">
          <DialogTitle className="sr-only">Search the site</DialogTitle>
          <DialogDescription className="sr-only">Find pages, events, blog posts and executives. Use the arrow keys to move and Enter to open.</DialogDescription>
          <div className="flex items-center gap-3 border-b px-4">
            <Search className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKeyDown} placeholder="Search events, articles, people, pages…"
              role="combobox" aria-expanded="true" aria-controls="site-search-results" aria-activedescendant={flat[active] ? `site-search-${active}` : undefined} aria-label="Search"
              className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground" enterKeyHint="go" autoComplete="off" spellCheck={false} />
            <button type="button" onClick={() => setOpen(false)} className="rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-muted">Esc</button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
            {!items ? (
              <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Loading…</p>
            ) : flat.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground" role="status">No results for “{q.trim()}”. Try another word, or browse the <Link href="/events" className="underline" onClick={() => setOpen(false)}>events</Link>.</p>
            ) : (
              <ul id="site-search-results" ref={list} role="listbox" aria-label="Results">
                {groups.map((g) => (
                  <li key={g.k} role="presentation">
                    <p className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{q.trim() ? KIND[g.k].label : "Suggested"}</p>
                    <ul role="presentation">
                      {g.rows.map((it) => {
                        n++;
                        const i = n;
                        const Icon = KIND[it.kind].icon;
                        return (
                          <li key={`${it.kind}:${it.href}:${it.title}`} id={`site-search-${i}`} data-i={i} role="option" aria-selected={i === active}
                            onMouseMove={() => setActive(i)} onClick={() => go(it)}
                            className={cn("flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5", i === active ? "bg-primary/10" : "")}>
                            <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border", i === active ? "border-primary/40 text-primary" : "text-muted-foreground")}><Icon className="h-4 w-4" aria-hidden /></span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium"><Highlight text={it.title} q={q} /></span>
                              {it.meta && <span className="block truncate text-xs text-muted-foreground">{it.meta}</span>}
                            </span>
                            {i === active && <CornerDownLeft className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" aria-hidden />}
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="hidden items-center gap-4 border-t px-4 py-2 text-xs text-muted-foreground sm:flex">
            <span><kbd className="font-sans">↑</kbd> <kbd className="font-sans">↓</kbd> to move</span><span><kbd className="font-sans">Enter</kbd> to open</span><span><kbd className="font-sans">Esc</kbd> to close</span>
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
