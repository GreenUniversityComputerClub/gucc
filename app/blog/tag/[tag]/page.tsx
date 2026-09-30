import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { buildMetadata } from "@/lib/seo/metadata";
import { listBlogPosts } from "../../data";
import { BlogBrowser, type BlogCard } from "../../blog-browser";
import { toBlogCard } from "../../blog-card";

export const revalidate = 3600;
export const dynamicParams = true;

export async function generateStaticParams() {
  const tags = new Set((await listBlogPosts()).flatMap((p) => p.tags ?? []));
  return [...tags].map((tag) => ({ tag: encodeURIComponent(tag) }));
}

const tagOf = async (params: Promise<{ tag: string }>) => decodeURIComponent((await params).tag);

export async function generateMetadata({ params }: { params: Promise<{ tag: string }> }): Promise<Metadata> {
  const tag = await tagOf(params);
  return buildMetadata({ title: `#${tag} — GUCC Blog`, description: `Articles about ${tag} from the Green University Computer Club blog.`, path: `/blog/tag/${encodeURIComponent(tag)}`,
    image: { eyebrow: "Blog", title: `#${tag}`, subtitle: "Articles from the GUCC blog" } });
}

export default async function TagPage({ params }: { params: Promise<{ tag: string }> }) {
  const tag = await tagOf(params);
  const posts = (await listBlogPosts()).filter((p) => (p.tags ?? []).includes(tag));
  if (!posts.length) notFound();
  const cards: BlogCard[] = posts.map(toBlogCard);
  return (
    <div className="container mx-auto max-w-6xl px-4 py-12">
      <Link href="/blog" className="mb-6 inline-flex min-h-10 items-center gap-2 text-sm text-muted-foreground hover:text-emerald-600"><ArrowLeft className="h-4 w-4" aria-hidden />All articles</Link>
      <h1 className="mb-2 text-4xl font-extrabold tracking-tight">#{tag}</h1>
      <p className="mb-8 text-muted-foreground">{posts.length} article{posts.length === 1 ? "" : "s"}</p>
      <BlogBrowser posts={cards} initialTag={tag} />
    </div>
  );
}
