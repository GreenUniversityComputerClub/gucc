"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { BlogPostCard as Card, type BlogCard } from "./blog-card";

export type { BlogCard };

const PAGE = 12;

/**
 * The blog index: the newest post up front, then the rest. Search and the category and tag
 * chips filter at once in the browser (every post is in the page for search engines);
 * "Show more" reveals the next posts.
 */
export function BlogBrowser({ posts, initialTag }: { posts: BlogCard[]; initialTag?: string }) {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(initialTag ?? null);
  const [shown, setShown] = useState(PAGE);
  useEffect(() => setShown(PAGE), [q, category, tag]);
  const categories = useMemo(() => [...new Set(posts.map((p) => p.category).filter((c): c is string => Boolean(c)))], [posts]);
  const tags = useMemo(() => {
    const n = new Map<string, number>();
    posts.forEach((p) => p.tags.forEach((t) => n.set(t, (n.get(t) ?? 0) + 1)));
    return [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([t]) => t);
  }, [posts]);
  const list = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return posts.filter((p) => (!category || p.category === category) && (!tag || p.tags.includes(tag))
      && (!words.length || words.every((w) => `${p.title} ${p.summary} ${p.author.name} ${p.tags.join(" ")} ${p.category ?? ""}`.toLowerCase().includes(w))));
  }, [posts, q, category, tag]);
  const filtering = Boolean(q || category || tag);
  const [first, ...rest] = list;

  if (posts.length === 0) {
    return <p className="rounded-2xl border border-dashed p-12 text-center text-muted-foreground">No articles yet. Members&apos; first posts will appear here soon.</p>;
  }
  return (
    <div className="space-y-8">
      {(posts.length > 3 || categories.length > 1 || tags.length > 0) && (
        <div className="space-y-3">
          <label className="relative mx-auto block max-w-xl">
            <span className="sr-only">Search articles</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search articles, topics or authors"
              className="h-12 w-full rounded-full border bg-background pl-10 pr-4 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm" />
          </label>
          {(categories.length > 1 || tags.length > 0) && (
            <div className="flex flex-wrap justify-center gap-1.5" role="group" aria-label="Topics">
              {categories.length > 1 && categories.map((c) => (
                <button key={c} type="button" aria-pressed={category === c} onClick={() => setCategory(category === c ? null : c)}
                  className={cn("min-h-9 rounded-full border px-3 text-sm transition-colors", category === c ? "border-emerald-600 bg-emerald-600 text-white" : "bg-card hover:bg-muted")}>{c}</button>
              ))}
              {tags.map((t) => (
                <button key={t} type="button" aria-pressed={tag === t} onClick={() => setTag(tag === t ? null : t)}
                  className={cn("min-h-9 rounded-full border px-3 text-sm transition-colors", tag === t ? "border-emerald-600 bg-emerald-600 text-white" : "bg-card text-muted-foreground hover:bg-muted")}>#{t}</button>
              ))}
            </div>
          )}
        </div>
      )}
      {filtering && (
        <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground" aria-live="polite">
          {list.length} article{list.length === 1 ? "" : "s"}
          <button type="button" onClick={() => { setQ(""); setCategory(null); setTag(null); }} className="inline-flex min-h-8 items-center gap-1 rounded-full px-2 hover:underline"><X className="h-3.5 w-3.5" aria-hidden />Clear</button>
        </p>
      )}
      {list.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-12 text-center text-muted-foreground">No article matches. Try another word or topic.</p>
      ) : (
        <>
          {first && !filtering && <Card p={first} featured eager />}
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {(filtering ? list : rest).slice(0, shown).map((p, i) => <Card key={p.id} p={p} eager={filtering && i < 3} />)}
          </div>
          {(filtering ? list : rest).length > shown && (
            <div className="flex justify-center">
              <button type="button" onClick={() => setShown((n) => n + PAGE)} className="min-h-11 rounded-full border bg-card px-6 text-sm font-medium shadow-sm hover:bg-muted">Show more articles</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
