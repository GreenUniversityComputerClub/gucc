import { listBlogPosts } from "../data";
import { fetchSubstackArticle, markdownToReact } from "./util";
import PostContent from "../component";
import { Post } from "../types";
import { Metadata } from "next";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/seo/json-ld";
import { brandTitle, ogImageUrl, truncate } from "@/lib/seo/metadata";
import { articleSchema, breadcrumbSchema, graph } from "@/lib/seo/schema";
import { findBlogPost } from "../data";

// Posts come from D1 (published only); the query is cached and invalidated on publish.
export const revalidate = 3600;
export const dynamicParams = true;

export async function generateStaticParams() {
  return (await listBlogPosts()).map((p) => ({ slug: p.slug }));
}

const siteBaseUrl = (
  process.env.NEXT_PUBLIC_BASE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.SITE_URL ||
  "https://gucc.green.edu.bd"
).replace(/\/+$/, "");

function buildPostMetadata(post: Post & { seoTitle?: string | null; seoDescription?: string | null }): Metadata {
  // The author's SEO title and description win; then the excerpt, then the subtitle.
  const description =
    post.seoDescription?.trim() ||
    post.brief?.trim() ||
    post.subtitle?.trim() ||
    "Official article from Green University Computer Club (GUCC)";
  const title = post.seoTitle?.trim() || post.title;

  // Without a cover, the site's own generated card (never another article's picture).
  const rawImageUrl = post.coverImage?.url || ogImageUrl({ eyebrow: "GUCC Blog", title: post.title, subtitle: truncate(description, 120) });
  const imageUrl =
    rawImageUrl.startsWith("http://") || rawImageUrl.startsWith("https://")
      ? rawImageUrl
      : `${siteBaseUrl}${rawImageUrl.startsWith("/") ? "" : "/"}${rawImageUrl}`;

  const postUrl = `${siteBaseUrl}/blog/${post.slug}`;
  const authorName = post.author?.name || "Green University Computer Club";

  return {
    title: { absolute: brandTitle(title) },
    description,
    metadataBase: new URL(siteBaseUrl),
    alternates: {
      canonical: postUrl,
    },
    openGraph: {
      title,
      description,
      url: postUrl,
      siteName: "Green University Computer Club",
      type: "article",
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt || post.publishedAt,
      authors: [authorName],
      tags: post.tags,
      images: [
        {
          url: imageUrl,
          width: 1600,
          height: 900,
          alt: post.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  try {
    const slug = (await params)?.slug;
    if (!slug) {
      return {
        title: { absolute: brandTitle("Blog Post") },
        description: "Explore articles and tutorials from Green University Computer Club.",
        metadataBase: new URL(siteBaseUrl),
      };
    }

    const post = await findBlogPost(slug);
    if (post) {
      return buildPostMetadata(post);
    }

    return {
      title: { absolute: brandTitle("Post Not Found") },
      robots: { index: false, follow: true },
      description: "The post you are looking for does not exist.",
      metadataBase: new URL(siteBaseUrl),
    };
  } catch (error) {
    console.warn("Failed to load blog post metadata:", error);
    return {
      title: { absolute: brandTitle("Blog Post") },
      description: "Explore articles and tutorials from Green University Computer Club.",
      metadataBase: new URL(siteBaseUrl),
    };
  }
}

/** BlogPosting + breadcrumb graph for a post, whatever source it came from. */
function postSchema(post: Post) {
  const path = `/blog/${post.slug}`;
  return graph(
    breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Blog", path: "/blog" },
      { name: post.title, path },
    ]),
    articleSchema({
      title: post.title,
      path,
      description: post.brief || post.subtitle || undefined,
      image: post.coverImage?.url || undefined,
      authorName: post.author?.name,
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt || post.publishedAt,
      tags: post.tags,
      canonicalElsewhere: post.url,
    })
  );
}

export default async function BlogPost({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const slug = (await params).slug;
  const customPost = await findBlogPost(slug);

  // An unknown address is a real 404 (search engines drop it; the site's not-found page shows).
  if (!customPost) notFound();

  // Reactions, related posts and previous/next, for articles written here and imported ones alike.
  const all = await listBlogPosts();
  const i = all.findIndex((p) => p.slug === customPost.slug);
  const card = (p: (typeof all)[number] | undefined) => (p ? { slug: p.slug, title: p.title, cover: p.coverImage?.url ?? null, publishedAt: p.publishedAt ?? null } : null);
  const shared = (p: (typeof all)[number]) => (p.tags ?? []).filter((t) => (customPost.tags ?? []).includes(t)).length + (p.category && p.category === customPost.category ? 1 : 0);
  const related = all.filter((p) => p.slug !== customPost.slug).map((p) => ({ p, score: shared(p) })).filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score).slice(0, 3).map((x) => card(x.p)!);
  const extras = { url: `${siteBaseUrl}/blog/${customPost.slug}`, reactions: customPost.reactions, related, prev: i > 0 ? card(all[i - 1]) : null, next: i >= 0 ? card(all[i + 1]) : null };

  if (customPost.body) {
    const mdx = await markdownToReact(customPost.body);
    // The client gets the rendered article only, not the markdown a second time.
    const { body: _body, ...post } = customPost;
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <div className="container mx-auto px-4 py-12 max-w-4xl">
          <JsonLd id={`post-${customPost.slug}-schema`} data={postSchema(customPost)} />
          <PostContent post={post} mdx={mdx} extras={extras} />
        </div>
      </div>
    );
  }

  // Articles whose home is elsewhere (e.g. Substack) are fetched from their canonical URL, as before.
  {
    let articleHtml: string | null = null;

    try {
      articleHtml = customPost.url ? await fetchSubstackArticle(customPost.url) : null;
    } catch (error) {
      console.warn("Failed to fetch external article:", error);
    }

    const mdx = articleHtml ? (
      <div
        className="substack-article"
        dangerouslySetInnerHTML={{ __html: articleHtml }}
      />
    ) : (
      <div className="space-y-6 text-slate-700 dark:text-slate-200">
        <p>
          This article is temporarily unavailable on the GUCC website. You
          can still read the full article on Substack.
        </p>
        <a
          href={customPost.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center rounded-full bg-emerald-700 px-5 py-3 font-semibold text-white transition hover:bg-emerald-600"
        >
          Read Full Article
        </a>
      </div>
    );

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <div className="container mx-auto px-4 py-12 max-w-4xl">
          <JsonLd id={`post-${customPost.slug}-schema`} data={postSchema(customPost)} />
          <PostContent post={{ ...customPost, body: null } as Post} mdx={mdx} extras={extras} />
        </div>
      </div>
    );
  }

}
