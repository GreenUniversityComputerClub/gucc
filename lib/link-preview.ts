/**
 * Link previews for messages: the title, description, picture and site name a page gives social
 * sites (Open Graph and Twitter cards, then the page's own <title> and description), read on the
 * website's server so the people chatting never contact the linked site until they open it.
 *
 * Safe to point at anything a member pastes: only http(s) on the usual ports; never this
 * machine, a private network or a cloud metadata address (checked for every redirect, after DNS);
 * at most 512 KB of the page, 5 seconds in all, 4 redirects; text is plain and trimmed.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export interface LinkPreview {
  url: string;
  host: string;
  siteName: string | null;
  title: string | null;
  description: string | null;
  image: string | null;
}

const MAX_BYTES = 512 * 1024;
const MAX_REDIRECTS = 4;
const TIMEOUT_MS = 5000;
const USER_AGENT = "Mozilla/5.0 (compatible; GUCC-LinkPreview/1.0; +https://gucc.green.edu.bd)";

/** Addresses a server must never be tricked into fetching (loopback, private, link-local, metadata…). */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number) as [number, number];
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && (b === 168 || b === 0)) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    const mapped = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]!);
    return x === "::" || x === "::1" || /^f[cd]/.test(x) || /^fe[89ab]/.test(x) || x.startsWith("ff") || x.startsWith("64:ff9b:") || x.startsWith("2001:db8:");
  }
  return true;
}

/** A web address a member may preview, or null. */
export function previewableUrl(raw: string): URL | null {
  if (raw.length > 2048) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password) return null;
  if (u.port && u.port !== "80" && u.port !== "443") return null;
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || host === "localhost" || /\.(localhost|local|internal|home|lan|intranet|corp)$/.test(host) || !host.includes(".") && !isIP(host)) return null;
  if (isIP(host) && isPrivateAddress(host)) return null;
  u.hash = "";
  return u;
}

async function resolvesPublic(host: string): Promise<boolean> {
  const bare = host.replace(/^\[|\]$/g, "");
  if (isIP(bare)) return !isPrivateAddress(bare);
  try {
    const all = await lookup(bare, { all: true, verbatim: true });
    return all.length > 0 && all.every((a) => !isPrivateAddress(a.address));
  } catch {
    return false;
  }
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", copy: "©", reg: "®", trade: "™" };

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Plain, single-line text of at most `max` characters (tags dropped, entities decoded). */
function clean(s: string | undefined | null, max: number): string | null {
  if (!s) return null;
  const t = decode(s.replace(/<[^>]*>/g, " ")).replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([a-zA-Z_:.-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) out[m[1]!.toLowerCase()] = m[3] ?? m[4] ?? m[5] ?? "";
  return out;
}

/** Titles of pages that ask you to sign in instead of showing the link (they make a useless preview). */
const LOGIN_WALL = /^(log ?in|sign ?in|log into|login|sign up|access denied|just a moment|attention required|403|404|page not found|error)\b/i;

/** Read a page's preview from its HTML (the part up to </head> is enough). Exported for tests. */
export function parsePreview(html: string, pageUrl: URL): LinkPreview {
  const end = html.search(/<\/head\s*>/i);
  const head = end >= 0 ? html.slice(0, end) : html;
  const meta: Record<string, string> = {};
  // Quoted values may contain ">" (valid HTML), so a tag ends at the first ">" outside quotes.
  for (const m of head.matchAll(/<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)) {
    const a = attrs(m[0]);
    const key = (a.property ?? a.name ?? a.itemprop ?? "").toLowerCase();
    if (key && a.content !== undefined && meta[key] === undefined) meta[key] = a.content;
  }
  const titleTag = head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const title = clean(meta["og:title"] ?? meta["twitter:title"] ?? titleTag, 160);
  const description = clean(meta["og:description"] ?? meta["twitter:description"] ?? meta.description, 300);
  let image: string | null = null;
  for (const raw of [meta["og:image:secure_url"], meta["og:image"], meta["og:image:url"], meta["twitter:image"], meta["twitter:image:src"], meta.image]) {
    if (!raw) continue;
    try {
      const u = new URL(decode(raw.trim()), pageUrl);
      // Pictures are shown to members straight from the site: https only (no mixed content).
      if (u.protocol === "https:" && u.href.length <= 2048 && previewableUrl(u.href)) {
        image = u.href;
        break;
      }
    } catch {
      /* next candidate */
    }
  }
  const host = pageUrl.hostname.replace(/^www\./, "");
  const walled = title !== null && LOGIN_WALL.test(title) && !meta["og:title"];
  return {
    url: pageUrl.href,
    host,
    siteName: clean(meta["og:site_name"] ?? meta["application-name"], 60),
    title: walled ? null : title,
    description: walled ? null : description,
    image,
  };
}

async function readHead(res: Response): Promise<string> {
  const type = res.headers.get("content-type") ?? "";
  const charset = type.match(/charset=([\w-]+)/i)?.[1] ?? "utf-8";
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder(charset);
  } catch {
    decoder = new TextDecoder("utf-8");
  }
  const reader = res.body?.getReader();
  if (!reader) return "";
  let text = "";
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      const from = Math.max(0, text.length - 16);
      text += decoder.decode(value, { stream: true });
      if (bytes >= MAX_BYTES || /<\/head\s*>/i.test(text.slice(from))) break;
    }
  } finally {
    reader.cancel().catch(() => undefined);
  }
  return text;
}

/** Fetch and read a link's preview; null when the page can't be previewed. */
export async function fetchPreview(raw: string): Promise<LinkPreview | null> {
  let url = previewableUrl(raw);
  if (!url) return null;
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!(await resolvesPublic(url.hostname))) return null;
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: "manual",
        signal,
        headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml;q=0.9,image/*;q=0.5,*/*;q=0.1", "Accept-Language": "en;q=0.9,bn;q=0.8" },
        cache: "no-store",
      });
    } catch {
      return null;
    }
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      res.body?.cancel().catch(() => undefined);
      if (!next) return null;
      try {
        url = previewableUrl(new URL(next, url).href);
      } catch {
        return null;
      }
      if (!url) return null;
      continue;
    }
    if (!res.ok) {
      res.body?.cancel().catch(() => undefined);
      return null;
    }
    const type = (res.headers.get("content-type") ?? "").toLowerCase();
    // A link straight to a picture previews as that picture.
    if (/^image\/(png|jpe?g|gif|webp|avif)/.test(type)) {
      res.body?.cancel().catch(() => undefined);
      const host = url.hostname.replace(/^www\./, "");
      return { url: url.href, host, siteName: null, title: null, description: null, image: url.protocol === "https:" ? url.href : null };
    }
    if (!type.includes("html")) {
      res.body?.cancel().catch(() => undefined);
      return null;
    }
    try {
      return parsePreview(await readHead(res), url);
    } catch {
      return null;
    }
  }
  return null;
}
