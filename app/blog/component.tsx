"use client";

import React, { useState } from "react";
import Link from "next/link";
import { unstable_ViewTransition as ViewTransition } from "react";
import ReadingProgress from "@/components/reading-progress";
import CodeBlockEnhancer from "@/components/blog/code-block-enhancer";
import { Post, PostEdge } from "./types";

interface PostContentProps {
  post: Post;
  mdx: React.ReactNode;
}

function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // Fallback to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore fallback error
    }
  };

  return (
    <button
      type="button"
      onClick={handleShare}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700/80 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
      aria-label="Share this article"
    >
      {copied ? (
        <>
          <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Link Copied!</span>
        </>
      ) : (
        <>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
            />
          </svg>
          <span>Share</span>
        </>
      )}
    </button>
  );
}

export default function PostContent({ post, mdx }: PostContentProps) {
  const publishedDate = post.publishedAt
    ? new Date(post.publishedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  const category = post.category || "Research & Open Source";

  // Generate author initials if no avatar image
  const authorInitials = post.author?.name
    ? post.author.name
        .replace(/[^a-zA-Z\s]/g, "")
        .split(/\s+/)
        .filter(Boolean)
        .map((n) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "GU";

  return (
    <div className="w-full min-h-screen bg-white dark:bg-[#0a0f18] text-slate-900 dark:text-slate-100 transition-colors duration-300">
      <ReadingProgress />

      <div className="max-w-[780px] mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        {/* Back to Blog Navigation */}
        <nav className="mb-10 sm:mb-12">
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors group"
          >
            <svg
              className="w-4 h-4 group-hover:-translate-x-1 transition-transform duration-200"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Back to all articles</span>
          </Link>
        </nav>

        {/* Article Header */}
        <header className="mb-10 sm:mb-14">
          {/* Category Kicker */}
          <div className="mb-4">
            <span className="inline-block text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-mono">
              {category}
            </span>
          </div>

          {/* Prominent Article Title */}
          <ViewTransition name={`post-title-${post.id}`}>
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-[3.25rem] font-extrabold tracking-tight leading-[1.14] text-slate-900 dark:text-white mb-6">
              {post.title}
            </h1>
          </ViewTransition>

          {/* Subtitle / Excerpt */}
          {(post.subtitle || post.brief) && (
            <ViewTransition name={`post-subtitle-${post.id}`}>
              <p className="text-lg sm:text-xl text-slate-600 dark:text-slate-300 font-normal leading-relaxed mb-8">
                {post.subtitle || post.brief}
              </p>
            </ViewTransition>
          )}

          {/* Author Card & Meta Row */}
          <div className="flex flex-wrap items-center justify-between gap-4 py-5 border-y border-slate-200/80 dark:border-slate-800">
            <div className="flex items-center gap-3.5">
              {/* Author Avatar */}
              {post.author?.avatarUrl ? (
                <img
                  src={post.author.avatarUrl}
                  alt={post.author.name}
                  className="w-11 h-11 rounded-full object-cover ring-2 ring-emerald-500/30"
                />
              ) : (
                <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white font-semibold text-sm shadow-sm ring-2 ring-emerald-500/20">
                  {authorInitials}
                </div>
              )}

              {/* Author Details & Date */}
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white">
                    {post.author?.name || "GUCC Contributor"}
                  </span>
                  {post.author?.github && (
                    <a
                      href={post.author.github}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-slate-400 hover:text-emerald-500 transition-colors"
                      title="GitHub Profile"
                    >
                      <svg className="w-4 h-4 fill-current inline" viewBox="0 0 24 24">
                        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                      </svg>
                    </a>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {publishedDate && <span>{publishedDate}</span>}
                  <span>•</span>
                  <span>{post.readTimeInMinutes} min read</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <ShareButton title={post.title} />
            </div>
          </div>

          {/* Featured Cover Image */}
          {post.coverImage && (
            <div className="mt-8 relative w-full rounded-2xl overflow-hidden border border-slate-200/80 dark:border-slate-800 shadow-md">
              <img
                src={post.coverImage.url}
                alt={post.title}
                className="w-full h-auto object-cover max-h-[460px]"
              />
            </div>
          )}
        </header>

        {/* Article Body with CodeBlockEnhancer */}
        <main className="article-reading-container">
          <ViewTransition name={`post-content-${post.id}`}>
            <CodeBlockEnhancer>
              <div className="prose">{mdx}</div>
            </CodeBlockEnhancer>
          </ViewTransition>
        </main>

        {/* Article Footer & Next Steps */}
        <footer className="mt-16 pt-8 border-t border-slate-200/80 dark:border-slate-800 text-center">
          <div className="inline-flex flex-col items-center gap-3">
            <div className="w-8 h-1 rounded-full bg-emerald-500/60 mx-auto mb-2"></div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Published by Green University Computer Club
            </p>
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 transition-all shadow-sm hover:shadow"
            >
              Explore More Articles
            </Link>
          </div>
        </footer>
      </div>
    </div>
  );
}

export function BlogPostMeta({ post }: { post: PostEdge }) {
  return (
    <ViewTransition name={`post-meta-${post.node.id}`}>
      <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400 mb-6">
        {post.node.publishedAt && (
          <time
            dateTime={post.node.publishedAt}
            className="text-xs font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider font-mono"
          >
            {new Date(post.node.publishedAt).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </time>
        )}
        <span className="text-slate-300 dark:text-slate-600">•</span>
        <span className="font-medium text-xs">
          {post.node.readTimeInMinutes} min read
        </span>
      </div>
    </ViewTransition>
  );
}
