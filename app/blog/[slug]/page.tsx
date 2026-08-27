import { gqlClient } from "@/lib/blog";
import { queries } from "@/lib/blog";
import { fetchSubstackArticle, mdxToHtml } from "./util";
import PostContent from "../component";
import { Post, PostResponse } from "../types";
import { Metadata } from "next";
import { generateOGImage } from "@/lib/blog/og";

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
  try {
    const host = process.env.HASHNODE_HOST || "gucc.hashnode.dev";
    const response = await gqlClient(queries.getPosts(host))();
    const posts = response as {
      data: { publication: { posts: { edges: { node: { slug: string } }[] } } };
    };
    return posts.data.publication.posts.edges.map((post) => ({
      slug: post.node.slug,
    }));
  } catch (error) {
    console.warn('Failed to fetch blog posts from Hashnode API:', error);
    // Return empty array as fallback when API is not accessible
    return [];
  }
}

const siteBaseUrl =
  process.env.NEXT_PUBLIC_BASE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://gucc.green.edu.bd");
// djshs
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const slug = (await params).slug;
  const customPost = getCustomBlogPost(slug);

  if (customPost) { 
    const coverImageUrl = customPost.coverImage?.url || "/blog/neurogebra-cover.jpg";
    return {
      title: customPost.title,
      description: customPost.brief,
      metadataBase: new URL(siteBaseUrl),
      openGraph: {
        title: customPost.title,
        description: customPost.brief,
        url: `/blog/${customPost.slug}`,
        siteName: "Green University Computer Club",
        type: "article",
        publishedTime: customPost.publishedAt,
        authors: [customPost.author.name],
        images: [
          {
            url: coverImageUrl,
            width: 1200,
            height: 630,
            alt: customPost.title,
          },
        ],
      },
      twitter: {
        card: "summary_large_image",
        title: customPost.title,
        description: customPost.brief,
        images: [coverImageUrl],
      },
    };
  }

  try {
    const host = process.env.HASHNODE_HOST || "gucc.hashnode.dev";
    const response = await gqlClient<PostResponse>(queries.getPostBySlug(host))({
      slug,
    });
    const post = response.data.publication.post;

    if (!post) {
      return {
        title: "Post Not Found",
        description: "The post you are looking for does not exist.",
      };
    }

    // Only generate OG image if we have the post data
    try {
      await generateOGImage({ post, outputPath: `public/og/${post.slug}.png` });
    } catch (ogError) {
      console.warn('Failed to generate OG image:', ogError);
    }

    const ogImage = `/og/${post.slug}.png`;

    return {
      title: post.title,
      description: post.brief,
      metadataBase: new URL(siteBaseUrl),
      openGraph: {
        title: post.title,
        description: post.brief,
        url: `/blog/${post.slug}`,
        siteName: "Green University Computer Club",
        type: "article",
        publishedTime: post.publishedAt,
        authors: [post.author.name],
        images: [
          {
            url: ogImage,
            width: 1200,
            height: 630,
            alt: post.title,
          },
        ],
      },
      twitter: {
        card: "summary_large_image",
        title: post.title,
        description: post.brief,
        images: [ogImage],
      },
    };
  } catch (error) {
    console.warn('Failed to fetch blog post metadata from Hashnode API:', error);
    return {
      title: "Blog Post",
      description: "Green University Computer Club blog post.",
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

  try {
    const host = process.env.HASHNODE_HOST || "gucc.hashnode.dev";
    const response = await gqlClient<PostResponse>(queries.getPostBySlug(host))({
      slug,
    });
    const post = response.data.publication.post;

    if (!post || !post.content) {
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

    const mdx = await mdxToHtml(post.content.markdown);

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <div className="container mx-auto px-4 py-12 max-w-4xl">
          <PostContent post={post} mdx={mdx} />
        </div>
      </div>
    );
  } catch (error) {
    console.warn('Failed to fetch blog post from Hashnode API:', error);
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <div className="container mx-auto px-4 py-12 max-w-4xl">
          <div className="w-full max-w-2xl mx-auto space-y-8">
            <h1 className="text-4xl font-bold mb-4 text-black dark:text-white">
              Service Temporarily Unavailable
            </h1>
            {/* <p className="text-lg text-neutral-600 dark:text-neutral-400">
              We're unable to fetch blog content at the moment. Please try again later.
            </p> */}
          </div>
        </div>
      </div>
    );
  }
}
