import type { Metadata } from "next";
import { Newspaper, Rss } from "lucide-react";
import { PageHero } from "@/components/page-hero";
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
    <>
      <JsonLd id="blog-schema" data={schema} />
      <PageHero
        icon={<Newspaper />}
        eyebrow="GUCC Blog"
        title={<>Stories from the <span className="text-gradient">community</span></>}
        description="Insights, tutorials and stories from the Green University Computer Club community: technology, programming and innovation."
      >
        <a href="/blog/feed.xml" className="glass inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-medium text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Rss className="h-4 w-4 text-aurora-300" aria-hidden />Follow with RSS
        </a>
      </PageHero>
      <div className="container mx-auto max-w-6xl px-4 py-12">
        <BlogBrowser posts={cards} />
      </div>
    </>
  );
}
