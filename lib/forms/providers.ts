/**
 * External forms: which services may be embedded, how each one's address becomes an embeddable
 * one, and whether a form is open right now. Pure (no fetching), so the website, the dashboard
 * and the API Worker all agree.
 *
 * Google short links (forms.gle) can't be turned into an embed address without asking Google
 * where they lead; lib/forms/inspect.ts does that on the website's server.
 */

export type FormProvider = "google" | "microsoft" | "tally" | "airtable";
export type FormDisplay = "AUTO" | "EMBED" | "LINK";
export type FormState = "open" | "scheduled" | "closed";

export const PROVIDER_LABEL: Record<FormProvider, string> = {
  google: "Google Form",
  microsoft: "Microsoft Form",
  tally: "Tally form",
  airtable: "Airtable form",
};

const HOSTS: Record<string, FormProvider> = {
  "docs.google.com": "google",
  "forms.gle": "google",
  "forms.office.com": "microsoft",
  "forms.microsoft.com": "microsoft",
  "tally.so": "tally",
  "airtable.com": "airtable",
};

/** The origins the Content Security Policy must allow in frames (next.config.ts). */
export const FORM_FRAME_ORIGINS = ["https://docs.google.com", "https://forms.gle", "https://forms.office.com", "https://forms.microsoft.com", "https://tally.so", "https://airtable.com"];

function parse(raw: string): URL | null {
  try {
    const u = new URL(raw.trim());
    return u.protocol === "https:" && !u.username && !u.password ? u : null;
  } catch {
    return null;
  }
}

/** Which service a form address belongs to, or null when it can't be embedded. */
export function providerOf(raw: string): FormProvider | null {
  const u = parse(raw);
  if (!u) return null;
  const provider = HOSTS[u.hostname.toLowerCase()];
  if (!provider) return null;
  if (provider === "google" && u.hostname === "docs.google.com" && !u.pathname.startsWith("/forms/")) return null;
  return provider;
}

/** A Google short link, which only Google can resolve. */
export const isShortLink = (raw: string) => parse(raw)?.hostname.toLowerCase() === "forms.gle";

/**
 * Pull a form address out of what a leader pasted: a plain link, or a whole embed code
 * (`<iframe src="…">`), as Google's "Send → <>" gives it.
 */
export function extractFormUrl(pasted: string): string {
  const text = pasted.trim();
  const src = text.match(/<iframe[^>]*\ssrc\s*=\s*["']([^"']+)["']/i)?.[1];
  return (src ?? text).replace(/&amp;/g, "&");
}

/** The height a pasted Google embed code asked for (`height="1234"`), if any. */
export function embedHeightOf(pasted: string): number | null {
  const h = Number(pasted.match(/<iframe[^>]*\sheight\s*=\s*["']?(\d{3,5})/i)?.[1]);
  return Number.isFinite(h) && h >= 300 && h <= 20000 ? h : null;
}

/** Google: the public answer page for any Google Forms address (editor links included). */
function googleViewform(u: URL): URL {
  const out = new URL(u.href);
  out.hash = "";
  out.pathname = out.pathname.replace(/\/(edit|viewform|formResponse|closedform|prefill)\/?$/, "") + "/viewform";
  const keep = new URLSearchParams();
  for (const [k, v] of out.searchParams) {
    // Pre-filled answers stay; tracking and display parameters go.
    if (k.startsWith("entry.") || (k === "usp" && v === "pp_url")) keep.append(k, v);
  }
  out.search = keep.toString();
  return out;
}

/**
 * The address to open the form directly (a new tab, outside the site). Short links stay as
 * they are; Google addresses are normalised to the answer page.
 */
export function openUrlFor(raw: string): string | null {
  const u = parse(raw);
  const provider = providerOf(raw);
  if (!u || !provider) return null;
  if (provider === "google" && u.hostname === "docs.google.com") return googleViewform(u).href;
  u.hash = "";
  return u.href;
}

/**
 * The address to show inside the page, or null when it can't be built without resolving a
 * short link first.
 */
export function embedUrlFor(raw: string): string | null {
  const u = parse(raw);
  const provider = providerOf(raw);
  if (!u || !provider) return null;
  switch (provider) {
    case "google": {
      if (u.hostname === "forms.gle") return null;
      const out = googleViewform(u);
      out.searchParams.set("embedded", "true");
      return out.href;
    }
    case "microsoft": {
      u.searchParams.set("embed", "true");
      return u.href;
    }
    case "tally": {
      const id = u.pathname.match(/^\/(?:r|forms|embed)\/([\w-]+)/)?.[1];
      if (!id) return null;
      return `https://tally.so/embed/${id}?alignLeft=1&hideTitle=1&transparentBackground=1&dynamicHeight=1`;
    }
    case "airtable": {
      const path = u.pathname.replace(/^\/embed\//, "/").replace(/^\/+/, "");
      if (!/(^|\/)shr\w+/.test(path)) return null;
      return `https://airtable.com/embed/${path}`;
    }
  }
}

/** Open, not yet open, or closed: from the schedule and the "accepting answers" switch. */
export function formState(f: { opensAt?: string | null; closesAt?: string | null; accepting?: boolean | number | null }, now: Date | number = Date.now()): FormState {
  const t = typeof now === "number" ? now : now.getTime();
  if (f.accepting === false || f.accepting === 0) return "closed";
  if (f.closesAt && Date.parse(f.closesAt) <= t) return "closed";
  if (f.opensAt && Date.parse(f.opensAt) > t) return "scheduled";
  return "open";
}

/**
 * Whether to show the form inside the page or a card that opens it at the provider. Forms that
 * need a Google account open at Google on phones and inside in-app browsers (Facebook, Messenger,
 * Instagram…), where signing in inside a frame usually fails.
 */
export function shouldEmbed(f: { display?: FormDisplay | null; requiresSignIn?: boolean | null; embedUrl?: string | null }, ctx: { phone: boolean; inAppBrowser: boolean }): boolean {
  if (!f.embedUrl) return false;
  if (f.display === "EMBED") return true;
  if (f.display === "LINK") return false;
  if (!f.requiresSignIn) return true;
  return !ctx.phone && !ctx.inAppBrowser;
}

/** In-app browsers of social apps, where Google sign-in and new tabs behave badly. */
export function isInAppBrowser(userAgent: string): boolean {
  return /FBAN|FBAV|FB_IAB|FBIOS|Messenger|Instagram|Line\/|MicroMessenger|Snapchat|TikTok|LinkedInApp|Twitter for/i.test(userAgent);
}
