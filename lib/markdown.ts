/**
 * Markdown → HTML for content authored in the admin (posts, news,
 * announcements).
 *
 * Security model: authors are club members, not trusted developers, so
 *  - raw HTML in the source is escaped and shown as text, never emitted;
 *  - link and image URLs are limited to http(s), mailto and same-site paths
 *    (javascript:, data:, vbscript: … are dropped);
 *  - external links get rel="noopener noreferrer".
 * The output is therefore safe to render with dangerouslySetInnerHTML.
 *
 * Uses `marked` (small, no WASM) rather than the MDX toolchain, which kept the
 * server Worker over Cloudflare's size limit and can execute JSX.
 */
import { Marked, type Tokens } from "marked";
import { safeLocalPath } from "./safe-path";

import { escapeHtml } from "./html";

export { escapeHtml };

export function safeUrl(href: string | null | undefined): string | null {
  if (!href) return null;
  const h = href.trim();
  if (h.startsWith("/")) return safeLocalPath(h, "") || null;
  if (h.startsWith("#")) return h;
  try {
    const u = new URL(h);
    return ["http:", "https:", "mailto:"].includes(u.protocol) ? u.toString() : null;
  } catch {
    return null;
  }
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z]+;/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

const md = new Marked({ gfm: true, breaks: false, async: false });
md.use({
  renderer: {
    html({ text }: Tokens.HTML | Tokens.Tag) {
      return escapeHtml(text);
    },
    heading({ tokens, depth }: Tokens.Heading) {
      const inner = this.parser.parseInline(tokens);
      const id = slug(inner);
      return `<h${depth} id="${escapeHtml(id)}"><a class="anchor" href="#${escapeHtml(id)}" aria-hidden="true" tabindex="-1"></a>${inner}</h${depth}>\n`;
    },
    link({ href, title, tokens }: Tokens.Link) {
      const text = this.parser.parseInline(tokens);
      const url = safeUrl(href);
      if (!url) return text;
      const external = /^https?:/.test(url);
      return `<a href="${escapeHtml(url)}"${title ? ` title="${escapeHtml(title)}"` : ""}${external ? ' target="_blank" rel="noopener noreferrer"' : ""}>${text}</a>`;
    },
    image({ href, title, text }: Tokens.Image) {
      const url = safeUrl(href);
      if (!url) return escapeHtml(text);
      return `<img src="${escapeHtml(url)}" alt="${escapeHtml(text)}"${title ? ` title="${escapeHtml(title)}"` : ""} loading="lazy" decoding="async">`;
    },
  },
});

export function renderMarkdown(source: string): string {
  return md.parse(source ?? "") as string;
}
