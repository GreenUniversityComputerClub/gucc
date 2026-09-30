"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, Link2, List, Share2 } from "lucide-react";
import { REACTIONS, REACTION_KEYS, type ReactionKey } from "@/lib/chat/reactions";
import { cn } from "@/lib/utils";

type Heading = { id: string; text: string; level: 2 | 3 };

/** The article's sections (its h2/h3 headings), with the one you're reading highlighted. */
export function TableOfContents({ container = ".prose" }: { container?: string }) {
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const root = document.querySelector(container);
    if (!root) return;
    const found = [...root.querySelectorAll<HTMLElement>("h2[id], h3[id]")].map((h) => ({ id: h.id, text: h.textContent?.trim() ?? "", level: (h.tagName === "H2" ? 2 : 3) as 2 | 3 })).filter((h) => h.text);
    setHeadings(found);
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (visible) setActive(visible.target.id);
    }, { rootMargin: "-80px 0px -70% 0px" });
    found.forEach((h) => { const el = document.getElementById(h.id); if (el) observer.observe(el); });
    return () => observer.disconnect();
  }, [container]);
  if (headings.length < 3) return null;
  const list = (
    <ol className="space-y-1 text-sm">
      {headings.map((h) => (
        <li key={h.id} className={h.level === 3 ? "pl-4" : ""}>
          <a href={`#${h.id}`} onClick={() => setOpen(false)} aria-current={active === h.id ? "location" : undefined}
            className={cn("block rounded border-l-2 py-1 pl-3 transition-colors hover:text-emerald-600", active === h.id ? "border-emerald-500 font-medium text-emerald-700 dark:text-emerald-400" : "border-transparent text-slate-500 dark:text-slate-400")}>
            {h.text}
          </a>
        </li>
      ))}
    </ol>
  );
  return (
    <>
      {/* Wide screens: beside the article. */}
      <nav aria-label="On this page" className="fixed right-6 top-28 hidden max-h-[70dvh] w-60 overflow-y-auto 2xl:block">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">On this page</p>
        {list}
      </nav>
      {/* Elsewhere: a collapsible list above the article. */}
      <nav aria-label="On this page" className="mb-8 rounded-xl border border-slate-200/80 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/40 2xl:hidden">
        <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex min-h-11 w-full items-center justify-between gap-2 px-4 text-sm font-semibold">
          <span className="inline-flex items-center gap-2"><List className="h-4 w-4" aria-hidden />On this page</span>
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} aria-hidden />
        </button>
        {open && <div className="px-4 pb-4">{list}</div>}
      </nav>
    </>
  );
}

/** Share: the phone's share sheet where there is one, and direct links for the usual places. */
export function ShareMenu({ title, url }: { title: string; url: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  const targets = [
    ["WhatsApp", `https://wa.me/?text=${t}%20${u}`],
    ["Facebook", `https://www.facebook.com/sharer/sharer.php?u=${u}`],
    ["LinkedIn", `https://www.linkedin.com/sharing/share-offsite/?url=${u}`],
    ["X", `https://twitter.com/intent/tweet?text=${t}&url=${u}`],
  ] as const;
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-expanded={open} aria-haspopup="menu"
        onClick={async () => {
          if (navigator.share && window.matchMedia("(hover: none)").matches) {
            try { await navigator.share({ title, url }); return; } catch { /* the menu instead */ }
          }
          setOpen((o) => !o);
        }}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-slate-200/80 bg-slate-100 px-3 text-xs font-medium text-slate-700 hover:bg-slate-200 dark:border-slate-700/80 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
        <Share2 className="h-3.5 w-3.5" aria-hidden />Share
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-2 w-48 overflow-hidden rounded-xl border bg-popover p-1 text-sm shadow-lg">
          <button type="button" role="menuitem" className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 hover:bg-muted"
            onClick={async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => { setCopied(false); setOpen(false); }, 1200); } catch { /* nothing */ } }}>
            <Link2 className="h-4 w-4" aria-hidden />{copied ? "Link copied" : "Copy link"}
          </button>
          {targets.map(([name, href]) => (
            <a key={name} role="menuitem" href={href} target="_blank" rel="noopener noreferrer" className="flex min-h-10 items-center rounded-lg px-3 hover:bg-muted" onClick={() => setOpen(false)}>{name}</a>
          ))}
        </div>
      )}
    </div>
  );
}

const signedInHint = () => typeof document !== "undefined" && document.cookie.split("; ").some((c) => c.startsWith("gucc_signed_in="));

/**
 * Reactions under an article: everyone sees the counts (from the cached page); signed-in members
 * add, change or remove theirs, shown at once. Nothing is fetched until the reader gets here.
 */
export function PostReactions({ postId, initial, next }: { postId: string; initial: Record<string, number>; next: string }) {
  const [counts, setCounts] = useState<Partial<Record<ReactionKey, number>>>(initial as Partial<Record<ReactionKey, number>>);
  const [mine, setMine] = useState<ReactionKey | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!signedInHint()) return setSignedIn(false);
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      fetch(`/api/posts/${postId}/reactions`, { cache: "no-store" }).then((r) => r.json()).then((d: { signedIn?: boolean; counts?: Record<string, number>; mine?: ReactionKey | null }) => {
        setSignedIn(Boolean(d.signedIn));
        if (d.counts) setCounts(d.counts as Partial<Record<ReactionKey, number>>);
        setMine(d.mine ?? null);
      }, () => setSignedIn(false));
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [postId]);

  async function pick(k: ReactionKey) {
    if (!signedIn) return;
    const next = mine === k ? null : k;
    const before = { counts, mine };
    setCounts((c) => ({ ...c, ...(mine ? { [mine]: Math.max(0, (c[mine] ?? 1) - 1) } : {}), ...(next ? { [next]: (c[next] ?? 0) + (mine === next ? 0 : 1) } : {}) }));
    setMine(next);
    setError(null);
    const r = await fetch(`/api/posts/${postId}/reactions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ emoji: next }) }).catch(() => null);
    if (!r?.ok) {
      setCounts(before.counts);
      setMine(before.mine);
      setError(r?.status === 401 ? "Sign in to react." : "Couldn't save your reaction. Try again.");
    }
  }

  const total = Object.values(counts).reduce((a, n) => a + (n ?? 0), 0);
  return (
    <div ref={ref} className="mt-12 rounded-2xl border border-slate-200/80 p-5 text-center dark:border-slate-800">
      <p className="mb-3 text-sm font-semibold">{total ? `${total} reaction${total === 1 ? "" : "s"}` : "What did you think?"}</p>
      <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="React to this article">
        {REACTION_KEYS.map((k) => (
          <button key={k} type="button" disabled={!signedIn} onClick={() => void pick(k)} aria-pressed={mine === k} title={REACTIONS[k].label}
            aria-label={`${REACTIONS[k].label}${counts[k] ? `: ${counts[k]}` : ""}`}
            className={cn("inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-sm transition-transform enabled:hover:scale-110 disabled:cursor-default",
              mine === k ? "border-emerald-500 bg-emerald-500/10" : "border-slate-200 dark:border-slate-700")}>
            <span aria-hidden className="text-lg leading-none">{REACTIONS[k].emoji}</span>
            {counts[k] ? <span className="tabular-nums text-slate-600 dark:text-slate-300">{counts[k]}</span> : null}
          </button>
        ))}
      </div>
      {signedIn === false && <p className="mt-3 text-xs text-slate-500"><Link href={`/auth/login?next=${encodeURIComponent(next)}`} className="underline">Sign in</Link> to react.</p>}
      {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
