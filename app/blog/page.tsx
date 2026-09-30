import type { Metadata } from "next";
import { Rss } from "lucide-react";
import { JsonLd } from "@/components/seo/json-ld";
import { buildMetadata } from "@/lib/seo/metadata";
import { SITE_URL } from "@/lib/seo/site";
import { ORGANIZATION_ID, WEBSITE_ID, breadcrumbSchema, graph, itemListSchema } from "@/lib/seo/schema";
import { listBlogPosts } from "./data";
import { BlogBrowser, type BlogCard } from "./blog-browser";
import { toBlogCard } from "./blog-card";

export const metadata: Metadata = {
  ...buildMetadata({
    title: "Blog — Technology, Programming & Club Stories",
    description:
      "Tutorials, research and stories by Green University Computer Club (GUCC) members: machine learning, open source, competitive programming and careers.",
    path: "/blog",
    keywords: ["GUCC blog", "Green University Computer Club blog", "programming articles Bangladesh", "machine learning blog Bangladesh", "CSE student blog", "tech tutorials Bangladesh"],
    image: { eyebrow: "Blog", title: "GUCC Blog", subtitle: "Technology, programming and club stories" },
  }),
  alternates: { canonical: `${SITE_URL}/blog`, types: { "application/rss+xml": `${SITE_URL}/blog/feed.xml` } },
};

export const revalidate = 3600;

export default async function Blog() {
  const posts = await listBlogPosts();
  // What the cards need, without article bodies (smaller page, faster first paint).
  const cards: BlogCard[] = posts.map(toBlogCard);
  const schema = graph(
    breadcrumbSchema([{ name: "Home", path: "/" }, { name: "Blog", path: "/blog" }]),
    {
      "@type": "Blog", "@id": `${SITE_URL}/blog#blog`, url: `${SITE_URL}/blog`, name: "Green University Computer Club Blog",
      description: "Articles, tutorials and stories from the Green University Computer Club.", inLanguage: "en", publisher: { "@id": ORGANIZATION_ID }, isPartOf: { "@id": WEBSITE_ID },
    },
    itemListSchema("GUCC blog posts", cards.slice(0, 50).map((c) => ({ name: c.title, path: `/blog/${c.slug}`, image: c.cover ?? undefined }))),
  );
  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50/60 via-background to-background dark:from-emerald-950/20">
      <JsonLd id="blog-schema" data={schema} />
      <div className="container mx-auto max-w-6xl px-4 py-12 sm:py-16">
        <header className="mb-10 text-center">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-emerald-600/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">GUCC Blog</p>
          <h1 className="mb-4 bg-gradient-to-r from-green-600 via-emerald-600 to-green-500 bg-clip-text text-4xl font-extrabold tracking-tight text-transparent sm:text-5xl md:text-6xl">Our Blog</h1>
          <p className="mx-auto max-w-2xl text-lg leading-relaxed text-muted-foreground">
            Insights, tutorials and stories from the Green University Computer Club community: technology, programming and innovation.
          </p>
          <a href="/blog/feed.xml" className="mt-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-emerald-600"><Rss className="h-4 w-4" aria-hidden />Follow with RSS</a>
        </header>
        <BlogBrowser posts={cards} />
      </div>
    </div>
  );
}
