import { compileMDX } from 'next-mdx-remote/rsc';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import rehypeCodeTitles from 'rehype-code-titles';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import rehypePrism from 'rehype-prism-plus';

function decodeJsonString(str: string): string {
  let res = str;
  for (let i = 0; i < 3; i++) {
    if (res.includes('\\"')) {
      res = res.replace(/\\"/g, '"');
    }
  }
  return res
    .replace(/\\\\/g, "\\")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "")
    .replace(/\\t/g, "\t")
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
}

export function cleanSubstackContent(rawHtml: string): string {
  let html = decodeJsonString(rawHtml);

  // Remove comment buttons, share buttons, and Substack button widgets
  html = html.replace(
    /<p[^>]*class=["'][^"']*button-wrapper[^"']*["'][^>]*>[\s\S]*?<\/p>/gi,
    ""
  );

  // Remove Substack restack/view image buttons inside figures
  html = html.replace(
    /<div[^>]*class=["'][^"']*image-link-expand[^"']*["'][^>]*>[\s\S]*?<\/div>\s*<\/div>/gi,
    ""
  );
  html = html.replace(
    /<div[^>]*class=["'][^"']*image-link-expand[^"']*["'][^>]*>[\s\S]*?<\/div>/gi,
    ""
  );

  // Simplify picture tags to clean responsive img elements
  html = html.replace(/<picture>[\s\S]*?<img([^>]+)>[\s\S]*?<\/picture>/gi, "<img$1>");

  // Remove top redundant author and links blocks (handled cleanly by the redesigned Header)
  html = html.replace(/<p\b[^>]*>\s*<em>\s*<strong>\s*Author:[\s\S]*?<\/p>/gi, "");
  html = html.replace(/<p\b[^>]*>\s*<strong>\s*Links:\s*<\/strong>[\s\S]*?<\/p>/gi, "");

  // Remove duplicate top banner image if present (d8cd3082 banner)
  html = html.replace(
    /<div\b[^>]*class=["'][^"']*captioned-image-container[^"']*["'][^>]*>\s*<figure>\s*<a\b[^>]*href=["'][^"']*d8cd3082-e9b2-446d-99ff-893807594138[^"']*["'][^>]*>[\s\S]*?<\/figure>\s*<\/div>/gi,
    ""
  );

  // Convert terminal command blockquote to a proper semantic code block
  html = html.replace(
    /<blockquote\b[^>]*>[\s\S]*?!pip\s+install\s+neurogebra[\s\S]*?<\/blockquote>/gi,
    '<pre class="language-bash"><code class="language-bash">pip install neurogebra</code></pre>'
  );

  // Format inline technical expressions
  html = html.replace(
    /\(custom_loss\s*=\s*0\.7\s*\*s*mse\s*\+\s*0\.3\s*\*\s*mae\)/gi,
    "(<code>custom_loss = 0.7 * mse + 0.3 * mae</code>)"
  );

  // Format resource links and package install command
  html = html.replace(
    /<li>\s*<p>\s*<em>\s*<strong>\s*PyPI Package:\s*<\/strong>\s*<a\b[^>]*href=["']https:\/\/pypi\.org\/project\/neurogebra\/["'][^>]*>\s*pip install neurogebra\s*<\/a>\s*<\/em>\s*<\/p>\s*<\/li>/gi,
    '<li><p><strong>PyPI Package:</strong> <a href="https://pypi.org/project/neurogebra/" target="_blank" rel="noopener noreferrer">pypi.org/project/neurogebra</a></p><pre class="language-bash"><code class="language-bash">pip install neurogebra</code></pre></li>'
  );
  html = html.replace(
    /<li>\s*<p>\s*<em>\s*<strong>\s*GitHub Repository:\s*<\/strong>\s*<a\b[^>]*href=["'](https:\/\/github\.com\/fahiiim\/NeuroGebra)["'][^>]*>[\s\S]*?<\/a>\s*<\/em>\s*<\/p>\s*<\/li>/gi,
    '<li><p><strong>GitHub Repository:</strong> <a href="https://github.com/fahiiim/NeuroGebra" target="_blank" rel="noopener noreferrer">github.com/fahiiim/NeuroGebra</a></p></li>'
  );
  html = html.replace(
    /<li>\s*<p>\s*<em>\s*<strong>\s*Official Documentation:\s*<\/strong>[\s\S]*?<a\b[^>]*href=["'](https?:\/\/neurogebra\.readthedocs\.io\/?)["'][^>]*>[\s\S]*?<\/a>\s*<\/em>\s*<\/p>/gi,
    '<li><p><strong>Official Documentation:</strong> <a href="https://neurogebra.readthedocs.io/" target="_blank" rel="noopener noreferrer">neurogebra.readthedocs.io</a></p>'
  );

  // Ensure external links open safely
  html = html.replace(
    /<a\b(?![^>]*\btarget=)([^>]*href=["']https?:\/\/[^"']+["'][^>]*)>/gi,
    '<a$1 target="_blank" rel="noopener noreferrer">'
  );

  // Clean empty paragraphs
  html = html.replace(/<p>\s*<\/p>/gi, "");

  return html.trim();
}

export async function fetchSubstackArticle(url: string): Promise<string> {
  const response = await fetch(url, {
    next: { revalidate: 3600 },
  });

  if (!response.ok) {
    throw new Error(`Substack returned ${response.status} for ${url}`);
  }

  const source = await response.text();

  const marker = "body_html";
  const markerIdx = source.indexOf(marker);
  if (markerIdx === -1) {
    throw new Error("Substack body_html not found");
  }

  const colonIdx = source.indexOf(":", markerIdx);
  let start = colonIdx + 1;
  while (source[start] === "\\" || source[start] === '"' || source[start] === " ") {
    start++;
  }

  let end = -1;
  const kwList = [
    "truncated_body_text",
    "truncated_body",
    "wordcount",
    "postTags",
    "post_preview_limit",
    "language",
    "publishedBylines",
    "has_dynamic_content",
  ];
  for (const kw of kwList) {
    const idx = source.indexOf(kw, start);
    if (idx !== -1 && (end === -1 || idx < end)) {
      end = idx;
    }
  }

  if (end === -1) {
    throw new Error("Substack article content end not found");
  }

  let actualEnd = end;
  while (actualEnd > start && source[actualEnd] !== '"' && source[actualEnd] !== "\\") {
    actualEnd--;
  }
  while (
    actualEnd > start &&
    (source[actualEnd] === '"' || source[actualEnd] === "\\" || source[actualEnd] === ",")
  ) {
    actualEnd--;
  }
  actualEnd++;

  const rawHtml = source.slice(start, actualEnd);
  return cleanSubstackContent(rawHtml);
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
