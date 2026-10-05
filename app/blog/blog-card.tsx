import Link from "next/link";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/initials";
import type { listBlogPosts } from "./data";

export interface BlogCard {
  id: string;
  slug: string;
  title: string;
  summary: string;
  category: string | null;
  tags: string[];
  publishedAt: string | null;
  readTime: number;
  cover: string | null;
  author: { name: string; avatarUrl: string | null };
}

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "long", year: "numeric" }) : "");

function Author({ a, small }: { a: BlogCard["author"]; small?: boolean }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      {a.avatarUrl
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={a.avatarUrl} alt="" width={28} height={28} loading="lazy" className={cn("shrink-0 rounded-full object-cover", small ? "h-6 w-6" : "h-7 w-7")} />
        : <span className={cn("flex shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 text-[10px] font-semibold text-white", small ? "h-6 w-6" : "h-7 w-7")} aria-hidden>{initials(a.name)}</span>}
      <span className="truncate">{a.name}</span>
    </span>
  );
}

/** A post in a list: cover (or its title on the club's green), category, title, summary, author, date and reading time. */
export function BlogPostCard({ p, featured, eager, headingLevel = 2 }: { p: BlogCard; featured?: boolean; eager?: boolean; headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <article className={cn("group relative flex h-full overflow-hidden rounded-2xl border bg-card shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-emerald-300/70 hover:shadow-lg focus-within:ring-2 focus-within:ring-ring",
      featured ? "flex-col md:flex-row" : "flex-col")}>
      {p.cover ? (
        <div className={cn("relative overflow-hidden bg-muted", featured ? "aspect-video md:aspect-auto md:w-3/5" : "aspect-video")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.cover} alt="" loading={eager ? "eager" : "lazy"} fetchPriority={eager ? "high" : "auto"} decoding="async"
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
        </div>
      ) : (
        // No cover: a quiet placeholder with the club's mark (never the title a second time).
        <div className={cn("flex items-center justify-center border-b bg-muted/60", featured ? "aspect-video md:aspect-auto md:w-3/5" : "aspect-video")} aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/android-chrome-192x192.png" alt="" width={64} height={64} className="h-16 w-16 opacity-40 grayscale" />
        </div>
      )}
      <div className={cn("flex flex-1 flex-col gap-3 p-5", featured && "md:p-8")}>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {featured && <span className="rounded-full bg-emerald-700 px-2.5 py-0.5 font-semibold text-white">Latest</span>}
          {p.category && <span className="font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">{p.category}</span>}
        </div>
        <Heading className={cn("font-bold leading-snug tracking-tight", featured ? "text-2xl md:text-3xl" : "text-lg")}>
          <Link href={`/blog/${p.slug}`} className="after:absolute after:inset-0 group-hover:text-emerald-700 focus-visible:outline-none dark:group-hover:text-emerald-400">{p.title}</Link>
        </Heading>
        {p.summary && <p className={cn("text-muted-foreground", featured ? "line-clamp-4" : "line-clamp-3 text-sm")}>{p.summary}</p>}
        <div className="mt-auto flex items-center justify-between gap-3 pt-2 text-xs text-muted-foreground">
          <Author a={p.author} small={!featured} />
          <span className="flex shrink-0 items-center gap-2">
            {p.publishedAt && <time dateTime={p.publishedAt}>{date(p.publishedAt)}</time>}
            <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden />{p.readTime} min</span>
          </span>
        </div>
      </div>
    </article>
  );
}

/** What a card needs from a post (no article body: smaller pages). */
export function toBlogCard(p: Awaited<ReturnType<typeof listBlogPosts>>[number]): BlogCard {
  return {
    id: p.id, slug: p.slug, title: p.title, summary: p.subtitle || p.brief || "", category: p.category ?? null, tags: p.tags ?? [],
    publishedAt: p.publishedAt ?? null, readTime: p.readTimeInMinutes, cover: p.coverImage?.url ?? null, author: { name: p.author.name, avatarUrl: p.author.avatarUrl ?? null },
  };
}
