/**
 * What a public Google Form's page says about itself: its title, description, number of
 * questions, and whether it still takes answers. Pure, so it can be tested against saved pages.
 */

/** Google Forms item types that are questions (not titles, page breaks, pictures or videos). */
const GOOGLE_QUESTION_TYPES = new Set([0, 1, 2, 3, 4, 5, 7, 9, 10, 13, 18]);

const decodeEntities = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const clip = (s: unknown, max: number) => (typeof s === "string" && s.trim() ? s.replace(/\s+/g, " ").trim().slice(0, max) : null);

/** What a public Google Form page says about itself. */
export function parseGooglePage(html: string): { title: string | null; description: string | null; questionCount: number | null; closed: boolean } {
  const closed = /no longer accepting responses|isn['’]t accepting responses|closedform/i.test(html.slice(0, 200_000)) && !/FB_PUBLIC_LOAD_DATA_/.test(html);
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']*)["']/i)?.[1];
  let title = og ? clip(decodeEntities(og), 150) : null;
  let description: string | null = null;
  let questionCount: number | null = null;
  const data = html.match(/FB_PUBLIC_LOAD_DATA_\s*=\s*([\s\S]*?);\s*<\/script>/)?.[1];
  if (data) {
    try {
      const d = JSON.parse(data) as unknown[];
      const form = d[1] as unknown[] | undefined;
      if (Array.isArray(form)) {
        title = clip(form[8], 150) ?? title;
        // Paragraphs stay (the page shows the description as the form does).
        description = typeof form[0] === "string" ? form[0].replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, 1000) || null : null;
        const items = Array.isArray(form[1]) ? (form[1] as unknown[][]) : [];
        questionCount = items.filter((it) => Array.isArray(it) && GOOGLE_QUESTION_TYPES.has(Number(it[3]))).length;
      }
    } catch {
      // Google changes this format now and then: the form still works without the details.
    }
  }
  return { title, description, questionCount, closed };
}

