// SEO and link-preview audit of a running site: every public page from the sitemap (plus the
// static list) is checked for one <h1>, title and description lengths, an absolute self
// canonical, complete Open Graph / Twitter tags with a reachable image, JSON-LD that parses and
// has what its type needs, noindex only where intended, alt text on images, and internal links
// that don't 404. Prints a report; exits 1 when something is wrong.
// Usage: BASE=http://localhost:3000 node scripts/qa/seo-audit.mjs [--limit 80] [path ...]
const BASE = (process.env.BASE ?? "http://localhost:3000").replace(/\/+$/, "");
const args = process.argv.slice(2);
const limitAt = args.indexOf("--limit");
const LIMIT = limitAt >= 0 ? Number(args[limitAt + 1]) : 120;
const explicit = args.filter((a, i) => a.startsWith("/") && args[i - 1] !== "--limit");
const PRIVATE = [/^\/dashboard/, /^\/auth/, /^\/api/, /^\/forms\/dashboard/, /^\/executives\/certs\//, /^\/certificates\/hacktheai\/verify/];
const REQUIRED = { Event: ["name", "startDate", "location"], BlogPosting: ["headline", "datePublished"], BreadcrumbList: ["itemListElement"], Organization: ["name", "url"] };

const attr = (tag, name) => tag.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i"))?.[1] ?? tag.match(new RegExp(`${name}\\s*=\\s*'([^']*)'`, "i"))?.[1] ?? null;
const metas = (html) => [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
const meta = (html, key) => metas(html).map((t) => ((attr(t, "property") ?? attr(t, "name")) === key ? attr(t, "content") : null)).find((v) => v !== null && v !== undefined) ?? null;
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

async function paths() {
  if (explicit.length) return explicit;
  const set = new Set(["/", "/events", "/blog", "/executives", "/contests", "/join", "/contact", "/sponsors", "/collaborations", "/socials", "/lost-found", "/recruitment", "/news", "/announcements"]);
  try {
    const xml = await (await fetch(`${BASE}/sitemap.xml`)).text();
    for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) set.add(new URL(m[1]).pathname);
  } catch { /* the static list only */ }
  return [...set].slice(0, LIMIT);
}

const checked = new Map();
async function status(url) {
  if (!checked.has(url)) checked.set(url, fetch(url, { method: "GET", redirect: "follow" }).then((r) => r.status, () => 0));
  return checked.get(url);
}

const problems = [];
const note = (path, msg) => problems.push(`${path}: ${msg}`);

for (const path of await paths()) {
  const res = await fetch(`${BASE}${path}`, { redirect: "follow" }).catch(() => null);
  if (!res || !res.ok) { note(path, `HTTP ${res?.status ?? "unreachable"}`); continue; }
  const html = await res.text();
  const priv = PRIVATE.some((r) => r.test(path));
  const robots = meta(html, "robots") ?? "";
  if (!priv && /noindex/i.test(robots)) note(path, "public page is noindex");
  if (priv && !/noindex/i.test(robots)) note(path, "private page is indexable");
  if (/noindex/i.test(robots)) continue;
  const h1 = (html.match(/<h1\b/gi) ?? []).length;
  if (h1 !== 1) note(path, `${h1} <h1> elements (want 1)`);
  const title = decode(html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? "");
  if (title.length < 20 || title.length > 70) note(path, `title is ${title.length} characters: "${title}"`);
  const desc = decode(meta(html, "description") ?? "");
  if (desc.length < 70 || desc.length > 170) note(path, `description is ${desc.length} characters`);
  const canonical = [...html.matchAll(/<link\b[^>]*rel="canonical"[^>]*>/gi)].map((m) => attr(m[0], "href"))[0];
  if (!canonical || !/^https?:\/\//.test(canonical)) note(path, `canonical missing or relative (${canonical})`);
  else if (new URL(canonical).pathname.replace(/\/$/, "") !== decodeURI(path).replace(/\/$/, "")) note(path, `canonical points elsewhere: ${canonical}`);
  for (const k of ["og:title", "og:description", "og:url", "og:image", "twitter:card", "twitter:image"]) if (!meta(html, k)) note(path, `missing ${k}`);
  const image = meta(html, "og:image");
  if (image && (await status(decode(image))) !== 200) note(path, `og:image doesn't load (${image.slice(0, 80)})`);
  if (image && !meta(html, "og:image:alt")) note(path, "og:image has no alt text");
  for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    let data;
    try { data = JSON.parse(m[1]); } catch { note(path, "JSON-LD doesn't parse"); continue; }
    const nodes = (Array.isArray(data?.["@graph"]) ? data["@graph"] : [data]).flat();
    for (const n of nodes) for (const f of REQUIRED[n?.["@type"]] ?? []) if (n[f] === undefined) note(path, `JSON-LD ${n["@type"]} lacks ${f}`);
  }
  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  const noAlt = imgs.filter((t) => attr(t, "alt") === null).length;
  if (noAlt) note(path, `${noAlt} image(s) without alt`);
  const links = [...new Set([...html.matchAll(/<a\b[^>]*href="(\/[^"#?]*)[^"]*"/gi)].map((m) => m[1]))].filter((l) => !PRIVATE.some((r) => r.test(l))).slice(0, 40);
  for (const l of links) if ((await status(`${BASE}${l}`)) === 404) note(path, `links to a missing page: ${l}`);
}

console.log(problems.length ? problems.join("\n") : "SEO audit: no problems found.");
console.log(`\n${checked.size} URLs fetched.`);
process.exit(problems.length ? 1 : 0);
