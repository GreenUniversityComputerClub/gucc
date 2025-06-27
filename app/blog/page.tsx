import { unstable_ViewTransition as ViewTransition } from "react";
import Link from "next/link";
import { gqlClient } from "@/lib/blog";
import { queries } from "@/lib/blog";
import { PostsResponse } from "./types";
import { BlogPostMeta } from "./component";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Blog | Green University Computer Club",
  description:
    "Explore articles, insights, and stories from the Green University Computer Club - sharing knowledge in technology, programming, and innovation.",
};

export default async function Blog() {
  const host = process.env.HASHNODE_HOST || "gucc.hashnode.dev";
  const response = await gqlClient(queries.getPosts(host))();
  const posts = response as PostsResponse;
  const postsData = posts.data.publication.posts.edges;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        {/* Header Section */}
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-green-600 to-green-400 bg-clip-text text-transparent mb-4 p-2">
            Blog
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto">
            Explore our latest articles, insights, and stories from the Green
            University Computer Club
          </p>
        </div>

        {/* Blog Posts Grid */}
        <div className="space-y-8">
          {postsData.map((post) => (
            <article key={post.node.id} className="group">
              <Link href={`/blog/${post.node.slug}`} className="block">
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 p-6 border border-slate-200 dark:border-slate-700 hover:border-green-300 dark:hover:border-green-600">
                  <div className="flex justify-between items-start mb-4">
                    <ViewTransition name={`post-title-${post.node.id}`}>
                      <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white group-hover:text-green-600 dark:group-hover:text-green-400 transition-colors duration-300 leading-tight">
                        {post.node.title}
                      </h2>
                    </ViewTransition>
                  </div>

                  <ViewTransition
                    name={`post-${post.node.subtitle ? "subtitle" : "content"}-${post.node.id}`}
                  >
                    <p className="text-slate-600 dark:text-slate-300 mb-6 line-clamp-3 text-lg leading-relaxed">
                      {post.node.subtitle || post.node.brief}
                    </p>
                  </ViewTransition>

                  <div className="flex items-center justify-between">
                    <BlogPostMeta post={post} />
                  </div>
                </div>
              </Link>
            </article>
          ))}
        </div>

        {/* Empty State */}
        {postsData.length === 0 && (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">📝</div>
            <h3 className="text-2xl font-semibold text-slate-900 dark:text-white mb-2">
              No posts yet
            </h3>
            <p className="text-slate-600 dark:text-slate-400">
              Check back soon for new content!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export async function generateStaticParams() {
  const host = process.env.HASHNODE_HOST || "gucc.hashnode.dev";
  const response = await gqlClient(queries.getPosts(host))();
  const posts = response as PostsResponse;
  return posts.data.publication.posts.edges.map((post) => ({
    slug: post.node.slug,
  }));
}
