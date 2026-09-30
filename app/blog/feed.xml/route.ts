import { listBlogPosts } from "../data";
import { SITE, SITE_URL } from "@/lib/seo/site";
import { escapeHtml } from "@/lib/html";

export const revalidate = 3600;

/** RSS 2.0 feed of the blog (newest 50), for feed readers and aggregators. */
export async function GET() {
  const posts = (await listBlogPosts()).slice(0, 50);
  const item = (p: (typeof posts)[number]) => {
    const url = `${SITE_URL}/blog/${p.slug}`;
    return `<item>
  <title>${escapeHtml(p.title)}</title>
  <link>${url}</link>
  <guid isPermaLink="true">${url}</guid>
  ${p.publishedAt ? `<pubDate>${new Date(p.publishedAt).toUTCString()}</pubDate>` : ""}
  <description>${escapeHtml(p.subtitle || p.brief || "")}</description>
  <dc:creator>${escapeHtml(p.author.name)}</dc:creator>
  ${[p.category, ...(p.tags ?? [])].filter(Boolean).map((c) => `<category>${escapeHtml(String(c))}</category>`).join("")}
  ${p.coverImage?.url ? `<enclosure url="${escapeHtml(p.coverImage.url.startsWith("http") ? p.coverImage.url : `${SITE_URL}${p.coverImage.url}`)}" type="image/jpeg" length="0" />` : ""}
</item>`;
  };
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel>
  <title>${escapeHtml(SITE.name)} Blog</title>
  <link>${SITE_URL}/blog</link>
  <atom:link href="${SITE_URL}/blog/feed.xml" rel="self" type="application/rss+xml" />
  <description>Articles, tutorials and stories from the Green University Computer Club.</description>
  <language>en</language>
  ${posts[0]?.publishedAt ? `<lastBuildDate>${new Date(posts[0].updatedAt ?? posts[0].publishedAt).toUTCString()}</lastBuildDate>` : ""}
${posts.map(item).join("\n")}
</channel>
</rss>
`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
