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

type Kind = { type: "NEWS" | "ANNOUNCEMENT"; basePath: string; label: string; description: string };

export const NEWS: Kind = { type: "NEWS", basePath: "/news", label: "News", description: "News from the Green University Computer Club: results, achievements and club updates." };
export const ANNOUNCEMENTS: Kind = { type: "ANNOUNCEMENT", basePath: "/announcements", label: "Announcements", description: "Official announcements from the Green University Computer Club." };

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Dhaka" }) : "");

export function indexMetadata(kind: Kind): Metadata {
  return buildMetadata({ title: `${kind.label} — GUCC`, description: kind.description, path: kind.basePath });
}

export async function PostIndex({ kind }: { kind: Kind }) {
  const posts = await getPublishedPosts(kind.type);
  return (
    <div className="container mx-auto max-w-4xl px-4 py-12">
      <JsonLd id={`${kind.type.toLowerCase()}-schema`} data={graph(breadcrumbSchema([{ name: "Home", path: "/" }, { name: kind.label, path: kind.basePath }]))} />
      <h1 className="text-4xl font-bold tracking-tight">{kind.label}</h1>
      <p className="mt-2 text-muted-foreground">{kind.description}</p>
      {posts.length === 0 ? (
        <p className="mt-12 rounded-xl border border-dashed p-10 text-center text-muted-foreground">Nothing published yet. Check back soon.</p>
      ) : (
        <ul className="mt-10 space-y-6">
          {posts.map((p) => (
            <li key={p.id}>
              <Link href={`${kind.basePath}/${p.slug}`} className="block rounded-xl border bg-card p-6 transition hover:border-primary/40 hover:shadow-md">
                <time className="text-sm font-medium uppercase tracking-wide text-primary" dateTime={p.publishedAt ?? undefined}>{fmt(p.publishedAt)}</time>
                <h2 className="mt-2 text-2xl font-semibold">{p.title}</h2>
                {(p.subtitle || p.brief) && <p className="mt-2 line-clamp-3 text-muted-foreground">{p.subtitle || p.brief}</p>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
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
    <article className="container mx-auto max-w-3xl px-4 py-12">
      <JsonLd
        id={`post-${p.slug}-schema`}
        data={graph(
          breadcrumbSchema([{ name: "Home", path: "/" }, { name: kind.label, path: kind.basePath }, { name: p.title, path }]),
          articleSchema({ title: p.title, path, description: p.brief ?? undefined, image: p.coverImage ?? undefined, authorName: p.author.name, publishedTime: p.publishedAt ?? undefined, modifiedTime: p.updatedAt ?? undefined, tags: p.tags }),
        )}
      />
      <Link href={kind.basePath} className="text-sm text-muted-foreground hover:text-primary">← All {kind.label.toLowerCase()}</Link>
      <h1 className="mt-4 text-4xl font-bold tracking-tight">{p.title}</h1>
      {p.subtitle && <p className="mt-3 text-xl text-muted-foreground">{p.subtitle}</p>}
      <p className="mt-4 text-sm text-muted-foreground">
        {fmt(p.publishedAt)} · {p.author.name}
      </p>
      {p.coverImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.coverImage} alt="" className="mt-8 w-full rounded-2xl object-cover" loading="eager" />
      )}
      <div className="prose prose-slate dark:prose-invert mt-8 max-w-none">{body}</div>
      {!body && p.url && (
        <a href={p.url} target="_blank" rel="noreferrer" className="mt-8 inline-block rounded-full bg-primary px-5 py-3 font-semibold text-primary-foreground">Read the full article</a>
      )}
    </article>
  );
}
