import "server-only";
import { getPublishedPost, getPublishedPosts, type PublicPost } from "@/lib/public/data";
import type { Post } from "./types";

/** Map a D1 post onto the shape the blog components were written for. */
export function toLegacyPost(p: PublicPost): Post & { body: string | null; seoTitle: string | null; seoDescription: string | null; reactions: Record<string, number> } {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    subtitle: p.subtitle,
    category: p.category ?? undefined,
    tags: p.tags,
    brief: p.brief ?? "",
    publishedAt: p.publishedAt ?? undefined,
    updatedAt: p.updatedAt ?? undefined,
    readTimeInMinutes: p.readTimeInMinutes ?? 1,
    views: p.views,
    url: p.url ?? "",
    coverImage: p.coverImage ? { url: p.coverImage } : null,
    author: { name: p.author.name, github: p.author.url ?? undefined, avatarUrl: p.author.avatarUrl ?? undefined },
    body: p.body,
    seoTitle: p.seoTitle ?? null,
    seoDescription: p.seoDescription ?? null,
    reactions: p.reactions ?? {},
  };
}

export async function listBlogPosts(type = "BLOG") {
  return (await getPublishedPosts(type, 200)).map(toLegacyPost);
}

export async function findBlogPost(slug: string, type = "BLOG") {
  const p = await getPublishedPost(type, slug);
  return p ? toLegacyPost(p) : null;
}
