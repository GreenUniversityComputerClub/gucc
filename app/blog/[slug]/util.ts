import { compileMDX } from 'next-mdx-remote/rsc';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import rehypeCodeTitles from 'rehype-code-titles';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import rehypePrism from 'rehype-prism-plus';

export async function fetchSubstackArticle(url: string) {
  const response = await fetch(url, {
    next: { revalidate: 3600 },
  });

  if (!response.ok) {
    throw new Error(`Substack returned ${response.status} for ${url}`);
  }

  const source = await response.text();
  const marker = '\\"body_html\\":\\"';
  const start = source.indexOf(marker);

  if (start === -1) {
    throw new Error('Substack article content was not found');
  }

  const contentStart = start + marker.length;
  const contentEnd = source.indexOf('\\",\\"', contentStart);

  if (contentEnd === -1) {
    throw new Error('Substack article content was incomplete');
  }

  const encodedHtml = source.slice(contentStart, contentEnd);
  const html = (JSON.parse(`"${encodedHtml}"`) as string).replace(
    /\\"/g,
    '"',
  );

  const withoutComments = html.replace(
    /<p\b[^>]*class=["'][^"']*button-wrapper[^"']*["'][^>]*>[\s\S]*?<\/p>/gi,
    (button) => (/leave a comment/i.test(button) ? "" : button),
  );

  // Substack's responsive picture markup depends on its own client-side styles.
  // Keep the article figures, but use the fully-qualified fallback image source.
  return withoutComments.replace(
    /<picture>[\s\S]*?<img([^>]+)>[\s\S]*?<\/picture>/gi,
    "<img$1>",
  );
}

export async function mdxToHtml(source: string) {
  // Preserve query parameters while removing align attribute from markdown images
  const cleanedSource = source.replace(/!\[(.*?)\]\((.*?)(?:\s+align=["'][^"']*["'])?\)/g, (match, alt, src) => {
    // If src already has query params, append format and auto
    if (src.includes('?')) {
      return `![${alt}](${src}&auto=compress,format&format=webp)`;
    }
    // If no query params, add them with ?
    return `![${alt}](${src}?auto=compress,format&format=webp)`;
  });

  const { content } = await compileMDX({
    source: cleanedSource,
    options: {
      parseFrontmatter: true,
      mdxOptions: {
        remarkPlugins: [remarkGfm],
        rehypePlugins: [
          rehypeSlug,
          rehypeCodeTitles,
          rehypePrism,
          [
            rehypeAutolinkHeadings,
            {
              properties: {
                className: ['anchor'],
              },
            },
          ],
        ],
      },
    },
  });

  return content;
}
