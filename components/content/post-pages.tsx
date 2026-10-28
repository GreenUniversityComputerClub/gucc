// Article typography (headings, lists, quotes, code) shared with the blog.
import "@/app/blog/[slug]/blog.css";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublishedPost, getPublishedPosts } from "@/lib/public/data";
import { markdownToReact } from "@/app/blog/[slug]/util";
import { buildMetadata } from "@/lib/seo/metadata";
import { JsonLd } from "@/components/seo/json-ld";
import { articleSchema, breadcrumbSchema, graph } from "@/lib/seo/schema";
import { FramedImage } from "@/components/framed-image";
import { PageBand, PageHero } from "@/components/page-hero";
import { ArrowLeft, ArrowRight, Megaphone, Newspaper } from "lucide-react";

type Kind = { type: "NEWS" | "ANNOUNCEMENT"; basePath: string; label: string; description: string };

export const NEWS: Kind = { type: "NEWS", basePath: "/news", label: "News", description: "News from the Green University Computer Club: results, achievements and club updates." };
export const ANNOUNCEMENTS: Kind = { type: "ANNOUNCEMENT", basePath: "/announcements", label: "Announcements", description: "Official announcements from the Green University Computer Club (GUCC): recruitment, events, deadlines, results and notices for members and students." };

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Dhaka" }) : "");

export function indexMetadata(kind: Kind): Metadata {
  return buildMetadata({ title: `${kind.label} — GUCC`, description: kind.description, path: kind.basePath });
}

export async function PostIndex({ kind }: { kind: Kind }) {
  const posts = await getPublishedPosts(kind.type);
  return (
    <>
      <JsonLd id={`${kind.type.toLowerCase()}-schema`} data={graph(breadcrumbSchema([{ name: "Home", path: "/" }, { name: kind.label, path: kind.basePath }]))} />
      <PageHero
        icon={kind.type === "NEWS" ? <Newspaper /> : <Megaphone />}
        eyebrow={`${posts.length} published`}
        title={<span className="text-gradient">{kind.label}</span>}
        description={kind.description}
      />
      <div className="container mx-auto max-w-4xl px-4 py-12">
        {posts.length === 0 ? (
          <p className="rounded-3xl border border-dashed p-10 text-center text-muted-foreground">Nothing published yet. Check back soon.</p>
        ) : (
          // A timeline: a glowing rail, a dot per post.
          <ol className="relative space-y-6 border-l border-border/70 pl-8">
            {posts.map((p) => (
              <li key={p.id} className="relative">
                <span aria-hidden className="absolute -left-[39px] top-7 h-3.5 w-3.5 rounded-full border-2 border-background bg-gradient-to-br from-primary to-secondary shadow-[0_0_12px_2px] shadow-primary/40" />
                <Link href={`${kind.basePath}/${p.slug}`} className="lift group block rounded-3xl border bg-card p-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <time className="font-mono text-xs uppercase tracking-[0.15em] text-secondary" dateTime={p.publishedAt ?? undefined}>{fmt(p.publishedAt)}</time>
                  <h2 className="mt-2 font-display text-2xl font-semibold transition-colors group-hover:text-primary">{p.title}</h2>
                  {(p.subtitle || p.brief) && <p className="mt-2 line-clamp-3 text-muted-foreground">{p.subtitle || p.brief}</p>}
                  <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                    Read more <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  );
}

export async function detailMetadata(kind: Kind, slug: string): Promise<Metadata> {
  const p = await getPublishedPost(kind.type, slug);
  if (!p) return buildMetadata({ title: "Not found", description: "This page could not be found.", path: `${kind.basePath}/${slug}`, noIndex: true });
  return buildMetadata({
    title: p.seoTitle ?? p.title,
    description: p.seoDescription ?? p.brief ?? p.subtitle ?? kind.description,
    path: `${kind.basePath}/${slug}`,
    type: "article",
    publishedTime: p.publishedAt ?? undefined,
    image: p.coverImage ?? undefined,
  });
}

export async function PostDetail({ kind, slug }: { kind: Kind; slug: string }) {
  const p = await getPublishedPost(kind.type, slug);
  if (!p) notFound();
  const body = p.body ? await markdownToReact(p.body) : null;
  const path = `${kind.basePath}/${p.slug}`;
  return (
    <>
    <PageBand>
      <Link href={kind.basePath} className="glass inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-medium text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ArrowLeft className="h-4 w-4" aria-hidden />All {kind.label.toLowerCase()}
      </Link>
    </PageBand>
    <article className="container mx-auto max-w-3xl px-4 pb-16 pt-4">
      <JsonLd
        id={`post-${p.slug}-schema`}
        data={graph(
          breadcrumbSchema([{ name: "Home", path: "/" }, { name: kind.label, path: kind.basePath }, { name: p.title, path }]),
          articleSchema({ title: p.title, path, description: p.brief ?? undefined, image: p.coverImage ?? undefined, authorName: p.author.name, publishedTime: p.publishedAt ?? undefined, modifiedTime: p.updatedAt ?? undefined, tags: p.tags }),
        )}
      />
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-secondary">{kind.label}</p>
      <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-balance sm:text-5xl">{p.title}</h1>
      {p.subtitle && <p className="mt-4 text-xl leading-relaxed text-muted-foreground">{p.subtitle}</p>}
      <p className="mt-6 flex flex-wrap items-center gap-2 border-y border-border/60 py-4 text-sm text-muted-foreground">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-secondary text-xs font-semibold text-primary-foreground" aria-hidden>{p.author.name.slice(0, 1)}</span>
        <span className="font-medium text-foreground">{p.author.name}</span>
        <span aria-hidden>·</span>
        <time dateTime={p.publishedAt ?? undefined}>{fmt(p.publishedAt)}</time>
      </p>
      {p.coverImage && (
        <FramedImage src={p.coverImage} alt="" eager className="mt-8 rounded-2xl border" />
      )}
      <div className="prose prose-slate dark:prose-invert mt-8 max-w-none">{body}</div>
      {!body && p.url && (
        <a href={p.url} target="_blank" rel="noreferrer" className="mt-8 inline-block rounded-full bg-primary px-5 py-3 font-semibold text-primary-foreground">Read the full article</a>
      )}
    </article>
    </>
  );
}
