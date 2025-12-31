import { compileMDX } from 'next-mdx-remote/rsc';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import rehypeCodeTitles from 'rehype-code-titles';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import rehypePrism from 'rehype-prism-plus';

export async function mdxToHtml(source: string): Promise<React.ReactNode> {
  // Handle empty source
  if (!source || !source.trim()) {
    console.warn('Empty MDX source provided');
    return null;
  }

  // Preserve query parameters while removing align attribute from markdown images
  const cleanedSource = source.replace(/!\[(.*?)\]\((.*?)(?:\s+align=["'][^"']*["'])?\)/g, (match, alt, src) => {
    // If src already has query params, append format and auto
    if (src.includes('?')) {
      return `![${alt}](${src}&auto=compress,format&format=webp)`;
    }
    // If no query params, add them with ?
    return `![${alt}](${src}?auto=compress,format&format=webp)`;
  });

  try {
    const { content } = await compileMDX<{}>({
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

    // Ensure content is a valid React element/component
    if (!content) {
      console.warn('MDX compilation did not return valid content');
      return null;
    }

    return content;
  } catch (error) {
    console.error('Error compiling MDX:', error);
    return null;
  }
}
