import { gqlClient } from "@/lib/blog";
import { queries } from "@/lib/blog";
import { fetchSubstackArticle, mdxToHtml } from "./util";
import PostContent from "../component";
import { Post, PostResponse } from "../types";
import { Metadata } from "next";

export const dynamic = "force-dynamic";

const customBlogPosts: Post[] = [
  {
    id: "neurogebra",
    slug: "neurogebra",
    title: "Neurogebra",
    subtitle:
      "A reflective exploration of intelligence, learning, and the elegance of mathematical thought.",
    category: "Research & Open Source",
    tags: ["Machine Learning", "SymPy", "PyTorch", "Python", "Deep Learning"],
    brief:
      "A featured article from Md. Fahim Sarker Mridul’s Substack, exploring the ideas behind Neurogebra through a blend of reasoning, creativity, and learning.",
    publishedAt: "2026-08-03T00:00:00.000Z",
    readTimeInMinutes: 6,
    views: 0,
    url: "https://fahimerican.substack.com/p/neurogebra?r=35a5fa&triedRedirect=true",
    coverImage: {
      url: "/blog/neurogebra-cover.jpg",
    },
    author: {
      name: "Md. Fahim Sarker Mridul",
      github: "https://github.com/fahiiim",
    },
  },
];

function getCustomBlogPost(slug: string) {
  return customBlogPosts.find((post) => post.slug === slug) ?? null;
}

export async function generateStaticParams() {
  const localParams = customBlogPosts.map((post) => ({
    slug: post.slug,
  }));

  const host = process.env.HASHNODE_HOST;
  if (!host) {
    return localParams;
  }

  try {
    const response = await gqlClient(queries.getPosts(host))();
    const posts = response as {
      data?: { publication?: { posts?: { edges?: { node: { slug: string } }[] } } };
    };
    const edges = posts?.data?.publication?.posts?.edges ?? [];
    const remoteParams = edges.map((post) => ({
      slug: post.node.slug,
    }));
    return [...localParams, ...remoteParams];
  } catch (error) {
    console.warn("Failed to fetch blog posts from Hashnode API:", error);
    return localParams;
  }
}

const siteBaseUrl = (
  process.env.NEXT_PUBLIC_BASE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.SITE_URL ||
  "https://gucc.green.edu.bd"
).replace(/\/+$/, "");

function buildPostMetadata(post: Post): Metadata {
  const description =
    post.brief?.trim() ||
    post.subtitle?.trim() ||
    "Official article from Green University Computer Club (GUCC)";

  const rawImageUrl = post.coverImage?.url || "/blog/neurogebra-cover.jpg";
  const imageUrl =
    rawImageUrl.startsWith("http://") || rawImageUrl.startsWith("https://")
      ? rawImageUrl
      : `${siteBaseUrl}${rawImageUrl.startsWith("/") ? "" : "/"}${rawImageUrl}`;

  const postUrl = `${siteBaseUrl}/blog/${post.slug}`;
  const authorName = post.author?.name || "Green University Computer Club";

  return {
    title: `${post.title} | Green University Computer Club`,
    description,
    metadataBase: new URL(siteBaseUrl),
    alternates: {
      canonical: postUrl,
    },
    openGraph: {
      title: post.title,
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
      title: post.title,
      description,
      images: [imageUrl],
    },
  };
}

function buildPostMetadata(post: Post): Metadata {
  const description =
    post.brief?.trim() ||
    post.subtitle?.trim() ||
    "Official article from Green University Computer Club (GUCC)";

  const rawImageUrl = post.coverImage?.url || "/blog/neurogebra-cover.jpg";
  const imageUrl =
    rawImageUrl.startsWith("http://") || rawImageUrl.startsWith("https://")
      ? rawImageUrl
      : `${siteBaseUrl}${rawImageUrl.startsWith("/") ? "" : "/"}${rawImageUrl}`;

  const postUrl = `${siteBaseUrl}/blog/${post.slug}`;
  const authorName = post.author?.name || "Green University Computer Club";

  return {
    title: `${post.title} | Green University Computer Club`,
    description,
    metadataBase: new URL(siteBaseUrl),
    alternates: {
      canonical: postUrl,
    },
    openGraph: {
      title: post.title,
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
      title: post.title,
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
        title: "Blog Post | Green University Computer Club",
        description: "Explore articles and tutorials from Green University Computer Club.",
        metadataBase: new URL(siteBaseUrl),
      };
    }

    const customPost = getCustomBlogPost(slug);
    if (customPost) {
      return buildPostMetadata(customPost);
    }

    const host = process.env.HASHNODE_HOST;
    if (host) {
      const response = await gqlClient<PostResponse>(queries.getPostBySlug(host))({
        slug,
      });
      const post = response?.data?.publication?.post;

      if (post) {
        return buildPostMetadata(post);
      }
    }

    return {
      title: "Post Not Found | Green University Computer Club",
      description: "The post you are looking for does not exist.",
      metadataBase: new URL(siteBaseUrl),
    };
  } catch (error) {
    console.warn("Failed to fetch blog post metadata from Hashnode API:", error);
    return {
      title: "Blog Post | Green University Computer Club",
      description: "Explore articles and tutorials from Green University Computer Club.",
      metadataBase: new URL(siteBaseUrl),
    };
  }
}

export default async function BlogPost({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const slug = (await params).slug;
  const customPost = getCustomBlogPost(slug);

  if (customPost) {
    let articleHtml: string | null = null;

    try {
      articleHtml = await fetchSubstackArticle(customPost.url);
    } catch (error) {
      console.warn("Failed to fetch custom Substack article:", error);
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
          className="inline-flex items-center rounded-full bg-emerald-600 px-5 py-3 font-semibold text-white transition hover:bg-emerald-500"
        >
          Read Full Article
        </a>
      </div>
    );

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <div className="container mx-auto px-4 py-12 max-w-4xl">
          <PostContent post={customPost} mdx={mdx} />
        </div>
      </div>
    );
  }

  const host = process.env.HASHNODE_HOST;
  if (host) {
    try {
      const response = await gqlClient<PostResponse>(queries.getPostBySlug(host))({
        slug,
      });
      const post = response?.data?.publication?.post;

      if (post && post.content) {
        const mdx = await mdxToHtml(post.content.markdown);

        return (
          <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
            <div className="container mx-auto px-4 py-12 max-w-4xl">
              <PostContent post={post} mdx={mdx} />
            </div>
          </div>
        );
      }
    } catch (error) {
      console.warn("Failed to fetch blog post from Hashnode API:", error);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="w-full max-w-2xl mx-auto space-y-8">
          <h1 className="text-4xl font-bold mb-4 text-black dark:text-white">
            Post Not Found
          </h1>
          <p className="text-lg text-neutral-600 dark:text-neutral-400">
            The post you're looking for doesn't exist.
          </p>
        </div>
      </div>
    </div>
  );
}
