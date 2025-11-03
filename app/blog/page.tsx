import { ViewTransition } from "react";
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
  try {
    const host = process.env.HASHNODE_HOST || "gucc.hashnode.dev";
    const response = await gqlClient(queries.getPosts(host))();
    const posts = response as PostsResponse;
    const postsData = posts.data.publication.posts.edges;

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800">
        <div className="container mx-auto px-4 py-16 max-w-4xl">
          {/* Header Section */}
          <div className="text-center mb-20">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-green-500 to-emerald-500 rounded-2xl mb-8 shadow-lg">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h1 className="text-5xl md:text-6xl font-extrabold bg-gradient-to-r from-green-600 via-emerald-600 to-green-500 bg-clip-text text-transparent mb-6 tracking-tight">
              Our Blog
            </h1>
            <p className="text-xl text-slate-600 dark:text-slate-300 max-w-3xl mx-auto leading-relaxed">
              Discover insights, tutorials, and stories from the Green University Computer Club community. 
              Stay updated with the latest in technology, programming, and innovation.
            </p>
            <div className="mt-8 h-1 w-24 bg-gradient-to-r from-green-500 to-emerald-500 mx-auto rounded-full"></div>
          </div>

          {/* Blog Posts List */}
          {postsData.length > 0 ? (
            <div className="space-y-12">
              {postsData.map((post, index) => (
                <article key={post.node.id} className="group">
                  <Link href={`/blog/${post.node.slug}`} className="block">
                    <div className="bg-white/80 dark:bg-slate-800/30 backdrop-blur-sm rounded-xl border border-slate-200/60 dark:border-slate-700/40 hover:border-green-300/60 dark:hover:border-green-600/40 transition-all duration-300 overflow-hidden hover:shadow-lg hover:shadow-green-500/5">
                      
                      {/* Cover Image */}
                      {post.node.coverImage && (
                        <div className="relative overflow-hidden">
                          <div className="aspect-[2/1] sm:aspect-[3/1] relative">
                            <img
                              src={post.node.coverImage.url}
                              alt={post.node.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                              loading={index < 3 ? "eager" : "lazy"}
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/10 to-transparent"></div>
                            
                            {/* Reading Time Badge */}
                            <div className="absolute top-6 right-6">
                              <span className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium bg-white/95 dark:bg-slate-800/95 text-slate-700 dark:text-slate-300 backdrop-blur-sm shadow-lg">
                                <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                {post.node.readTimeInMinutes} min read
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Content */}
                      <div className="p-8 lg:p-10">
                        {/* Meta Information */}
                        <div className="flex items-center gap-4 mb-4">
                          {post.node.publishedAt && (
                            <time
                              dateTime={post.node.publishedAt}
                              className="text-sm font-medium text-green-600 dark:text-green-400 uppercase tracking-wide"
                            >
                              {new Date(post.node.publishedAt).toLocaleDateString("en-US", {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                              })}
                            </time>
                          )}
                          
                          {!post.node.coverImage && (
                            <>
                              <span className="text-slate-300 dark:text-slate-600">•</span>
                              <div className="flex items-center text-sm text-slate-500 dark:text-slate-400">
                                <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span className="font-medium">{post.node.readTimeInMinutes} min read</span>
                              </div>
                            </>
                          )}
                        </div>

                        {/* Title */}
                        <ViewTransition name={`post-title-${post.node.id}`}>
                          <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-slate-900 dark:text-white group-hover:text-green-600 dark:group-hover:text-green-400 transition-colors duration-300 leading-tight mb-4">
                            {post.node.title}
                          </h2>
                        </ViewTransition>

                        {/* Subtitle or Brief */}
                        <ViewTransition name={`post-${post.node.subtitle ? "subtitle" : "content"}-${post.node.id}`}>
                          <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed mb-6 line-clamp-3">
                            {post.node.subtitle || post.node.brief}
                          </p>
                        </ViewTransition>

                        {/* Read More Link */}
                        <div className="flex items-center text-green-600 dark:text-green-400 font-semibold group-hover:gap-2 transition-all duration-300">
                          <span>Continue Reading</span>
                          <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  </Link>

                  {/* Separator Line */}
                  {index < postsData.length - 1 && (
                    <div className="mt-12 flex justify-center">
                      <div className="w-24 h-px bg-gradient-to-r from-transparent via-slate-300 dark:via-slate-600 to-transparent"></div>
                    </div>
                  )}
                </article>
              ))}
            </div>
          ) : (
            /* Enhanced Empty State */
            <div className="text-center py-24">
              <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 rounded-3xl mb-8 shadow-lg">
                <svg className="w-12 h-12 text-slate-400 dark:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <h3 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">
                No Posts Yet
              </h3>
              <p className="text-lg text-slate-600 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
                We're working on bringing you amazing content. Check back soon for insightful articles and tutorials!
              </p>
              <div className="mt-8">
                <div className="inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span>New content coming soon</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  } catch (error) {
    console.warn('Failed to fetch blog posts from Hashnode API:', error);
    
    // Fallback UI when blog API is not accessible
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800">
        <div className="container mx-auto px-4 py-16 max-w-4xl">
          {/* Header Section */}
          <div className="text-center mb-20">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-green-500 to-emerald-500 rounded-2xl mb-8 shadow-lg">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h1 className="text-5xl md:text-6xl font-extrabold bg-gradient-to-r from-green-600 via-emerald-600 to-green-500 bg-clip-text text-transparent mb-6 tracking-tight">
              Our Blog
            </h1>
            <p className="text-xl text-slate-600 dark:text-slate-300 max-w-3xl mx-auto leading-relaxed">
              Discover insights, tutorials, and stories from the Green University Computer Club community. 
              Stay updated with the latest in technology, programming, and innovation.
            </p>
            <div className="mt-8 h-1 w-24 bg-gradient-to-r from-green-500 to-emerald-500 mx-auto rounded-full"></div>
          </div>

          {/* Service Unavailable State */}
          <div className="text-center py-24">
            <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-orange-100 to-orange-200 dark:from-orange-900 dark:to-orange-800 rounded-3xl mb-8 shadow-lg">
              <svg className="w-12 h-12 text-orange-500 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h3 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">
              Service Temporarily Unavailable
            </h3>
            <p className="text-lg text-slate-600 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
              We're unable to load blog content at the moment. Please check back later for our latest articles and insights.
            </p>
            <div className="mt-8">
              <div className="inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
                <span>Service will be restored soon</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
