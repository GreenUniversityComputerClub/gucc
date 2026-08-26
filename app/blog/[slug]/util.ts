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

  const sharedParagraphMatch = withoutComments.match(
    /<p\b[^>]*>\s*<a\b[^>]*>\s*<span>\s*Share Md Fahim Sarker Mridul[\s\S]*?<\/p>/i,
  );
  const sharedParagraph = sharedParagraphMatch?.[0] ?? "";
  const withoutLinksAndShare = withoutComments
    .replace(
      /<p\b[^>]*>\s*<strong>\s*Links:\s*<\/strong>[\s\S]*?<\/p>/i,
      "",
    )
    .replace(
      /<p\b[^>]*>\s*<a\b[^>]*>\s*<span>\s*Share Md Fahim Sarker Mridul[\s\S]*?<\/p>/i,
      "",
    );
  const withAuthorDetails = sharedParagraph
    ? withoutLinksAndShare.replace(
        /(<p\b[^>]*>\s*<em>\s*<strong>\s*Author:[\s\S]*?<\/p>)/i,
        `$1${sharedParagraph}`,
      )
    : withoutLinksAndShare;

  const withVisibleInstallCommand = withAuthorDetails.replace(
    /<blockquote\b[^>]*>[\s\S]*?!pip\s+install\s+neurogebra[\s\S]*?<\/blockquote>/i,
    '<pre><code class="language-bash"><a href="https://pypi.org/project/neurogebra/">!pip install neurogebra</a></code></pre>',
  ).replace(
    /<span\b[^>]*>\s*!pip\s+install\s+neurogebra\s*<\/span>/i,
    '<a href="https://pypi.org/project/neurogebra/"><code>!pip install neurogebra</code></a>',
  );

  const withHyperlinkedResources = withVisibleInstallCommand.replace(
    /(<h2\b[^>]*>[\s\S]*?Get Involved\s*&amp;\s*Explore[\s\S]*?<\/h2>\s*)<ul\b[^>]*>[\s\S]*?<\/ul>/i,
    (_, heading) =>
      `${heading}<ul><li><a href="https://github.com/fahiiim/NeuroGebra">GitHub Repository</a></li><li><a href="https://neurogebra.readthedocs.io/">Official Documentation</a></li></ul>`,
  );

  // Substack's responsive picture markup depends on its own client-side styles.
  // Keep the article figures, but use the fully-qualified fallback image source.
  return withHyperlinkedResources.replace(
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
