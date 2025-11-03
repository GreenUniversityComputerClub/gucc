"use client";

import { PostEdge } from "./types";
import { unstable_ViewTransition as ViewTransition } from "react";
import Link from "next/link";
import ReadingProgress from "@/components/reading-progress";

import { Post } from "./types";

interface PostContentProps {
  post: Post;
  mdx: React.ReactNode;
}

export default function PostContent({ post, mdx }: PostContentProps) {
  const publishedDate = post.publishedAt
    ? new Date(post.publishedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <div className="w-full max-w-none">
      <ReadingProgress />

      {/* Back to Blog Navigation */}
      <nav className="mb-8">
        <Link
          href="/blog"
          className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-green-600 dark:hover:text-green-400 transition-colors duration-200 group"
        >
          <svg
            className="w-4 h-4 group-hover:-translate-x-1 transition-transform duration-200"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          <span className="font-medium">Back to Blog</span>
        </Link>
      </nav>

      <article className="w-full max-w-none">
        <header className="mb-8">
          <ViewTransition name={`post-title-${post.id}`}>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6 text-slate-900 dark:text-white leading-tight">
              {post.title}
            </h1>
          </ViewTransition>

          {post.coverImage && (
            <div className="relative w-full mb-6 rounded-xl overflow-hidden shadow-lg">
              <img
                src={post.coverImage.url}
                alt={post.title}
                className="w-full h-auto object-cover"
              />
            </div>
          )}

          {post.subtitle && (
            <ViewTransition name={`post-subtitle-${post.id}`}>
              <h2 className="text-lg md:text-xl text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
                {post.subtitle}
              </h2>
            </ViewTransition>
          )}

          <BlogPostMeta post={{ node: post }} />
        </header>

        <ViewTransition name={`post-content-${post.id}`}>
          <div className="prose prose-lg dark:prose-invert prose-slate max-w-none prose-headings:scroll-mt-20 prose-img:rounded-lg prose-img:shadow-md">
            {mdx}
          </div>
        </ViewTransition>
      </article>
    </div>
  );
}

export function BlogPostMeta({ post }: { post: PostEdge }) {
  return (
    <ViewTransition name={`post-meta-${post.node.id}`}>
      <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400 mb-8 pb-8 border-b border-slate-200 dark:border-slate-700">
        {post.node.publishedAt && (
          <time
            dateTime={post.node.publishedAt}
            className="text-sm text-slate-500 dark:text-slate-400 font-medium"
          >
            {new Date(post.node.publishedAt).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </time>
        )}
        <span className="text-slate-300 dark:text-slate-600">•</span>
        <span className="font-medium">
          {post.node.readTimeInMinutes} min read
        </span>
        {/* <span className="text-slate-300 dark:text-slate-600">•</span> */}
        {/* <span className="font-medium">{post.node.views} views</span> */}
      </div>
    </ViewTransition>
  );
}
