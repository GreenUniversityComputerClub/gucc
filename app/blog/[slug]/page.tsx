import { gqlClient } from "@/lib/blog";
import { queries } from "@/lib/blog";
import { mdxToHtml } from "./util";
import PostContent from "../component";
import { PostResponse } from "../types";
import { Metadata } from "next";
import { generateOGImage } from "@/lib/blog/og";
import "./blog.css";

export async function generateStaticParams() {
  try {
    const host = process.env.HASHNODE_HOST || "gucc.hashnode.dev";
    const response = await gqlClient(queries.getPosts(host))();
    const posts = response as {
      data: { publication: { posts: { edges: { node: { slug: string; content?: { markdown?: string } } }[] } } };
    };
    // Only return posts that have content with markdown
    return posts.data.publication.posts.edges
      .filter((post) => post.node.content?.markdown)
      .map((post) => ({
        slug: post.node.slug,
      }));
  } catch (error) {
    console.warn('Failed to fetch blog posts from Hashnode API:', error);
    // Return empty array as fallback when API is not accessible
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const slug = (await params).slug;
  
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
      metadataBase: new URL(
        process.env.NEXT_PUBLIC_BASE_URL || "https://localhost:3000"
      ),
      openGraph: {
        title: post.title,
        description: post.brief,
        type: "article",
        publishedTime: post.publishedAt,
        authors: [post.author.name],
        images: [ogImage],
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
  
  try {
    const host = process.env.HASHNODE_HOST || "gucc.hashnode.dev";
    const response = await gqlClient<PostResponse>(queries.getPostBySlug(host))({
      slug,
    });
    const post = response.data.publication.post;

    if (!post || !post.content || !post.content.markdown) {
      console.warn(`No content found for post slug: ${slug}`);
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

    // Handle null return from mdxToHtml
    if (!mdx) {
      console.warn(`Failed to compile MDX for post slug: ${slug}`);
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
            <p className="text-lg text-neutral-600 dark:text-neutral-400">
              We're unable to fetch blog content at the moment. Please try again later.
            </p>
          </div>
        </div>
      </div>
    );
  }
}
