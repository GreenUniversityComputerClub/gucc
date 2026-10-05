/**
 * Look at an external form before it's shown: where a short link really leads, whether it needs
 * a Google account, whether it still takes answers, and (for public Google Forms) its title,
 * description and number of questions. Runs on the website's server (never in the API Worker,
 * which has 10 ms of CPU), only for the form services in lib/forms/providers.ts, re-checking the
 * host at every redirect; 5 seconds and 1.5 MB at most.
 */
import "server-only";
import { unstable_cache } from "next/cache";
import { embedUrlFor, extractFormUrl, openUrlFor, providerOf, type FormProvider } from "./providers";
import { parseGooglePage } from "./google-page";

export type FormInspection =
  | {
      ok: true;
      provider: FormProvider;
      /** The form's own answer page (short links resolved). */
      openUrl: string;
      /** The address to frame, or null when it can't be framed. */
      embedUrl: string | null;
      requiresSignIn: boolean;
      /** The provider says it no longer takes answers. */
      closed: boolean;
      title: string | null;
      description: string | null;
      questionCount: number | null;
    }
  | { ok: false; error: string };

const ALLOWED = new Set(["docs.google.com", "forms.gle", "forms.office.com", "forms.microsoft.com", "tally.so", "airtable.com"]);
const SIGN_IN_HOSTS = new Set(["accounts.google.com", "login.microsoftonline.com", "login.live.com"]);
const MAX_BYTES = 1_500_000;
const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 5000;
const UA = "Mozilla/5.0 (compatible; GUCC-Forms/1.0; +https://gucc.green.edu.bd)";

async function readText(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder("utf-8");
  let text = "";
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      text += decoder.decode(value, { stream: true });
      if (bytes >= MAX_BYTES) break;
    }
  } finally {
    reader.cancel().catch(() => undefined);
  }
  return text;
}

/** Inspect a pasted link or embed code. Never throws. */
export async function inspectForm(pasted: string): Promise<FormInspection> {
  const raw = extractFormUrl(pasted);
  const provider = providerOf(raw);
  if (!provider) return { ok: false, error: "Use a Google, Microsoft, Tally or Airtable form link (https://…)." };
  let url = new URL(raw);
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  let requiresSignIn = false;
  let res: Response | null = null;
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const r = await fetch(url, { redirect: "manual", signal, cache: "no-store", headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "en" } });
      if (r.status >= 300 && r.status < 400) {
        r.body?.cancel().catch(() => undefined);
        const next = r.headers.get("location");
        if (!next) break;
        const target = new URL(next, url);
        if (SIGN_IN_HOSTS.has(target.hostname)) {
          requiresSignIn = true;
          break;
        }
        if (target.protocol !== "https:" || !ALLOWED.has(target.hostname)) return { ok: false, error: "This link leads outside the form service." };
        url = target;
        continue;
      }
      res = r;
      break;
    }
  } catch {
    return { ok: false, error: "The form didn't answer in time. Check the link, or try again." };
  }
  const openUrl = openUrlFor(url.href) ?? url.href;
  const embedUrl = embedUrlFor(url.href);
  const closedByPath = /\/closedform\b/.test(url.pathname);
  let details = { title: null as string | null, description: null as string | null, questionCount: null as number | null, closed: closedByPath };
  if (res) {
    if (res.status === 401 || res.status === 403) requiresSignIn = true;
    if (res.ok && provider === "google") {
      const page = parseGooglePage(await readText(res));
      details = { ...page, closed: closedByPath || page.closed };
    } else {
      res.body?.cancel().catch(() => undefined);
    }
  }
  return { ok: true, provider, openUrl, embedUrl, requiresSignIn, ...details };
}

/**
 * The same, remembered for a day per address (refreshed with the "forms" cache tag). Next's
 * fetch cache doesn't keep redirects, so the whole answer is cached instead. A failed look isn't
 * remembered (it is usually a hiccup): it throws, which keeps it out of the cache.
 */
export const inspectFormCached = unstable_cache(async (url: string) => {
  const r = await inspectForm(url);
  if (!r.ok) throw new Error(r.error);
  return r;
}, ["form-inspection-v2"], { revalidate: 86_400, tags: ["forms"] });
