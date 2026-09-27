import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Open Graph cards are rendered on demand (CPU on Vercel's free plan), so only URLs the site
 * itself made are rendered: each carries a short HMAC of its parameters. Anything else is sent to
 * the static card. Without a key (local development) every URL is accepted.
 */
const PARAMS = ["title", "subtitle", "eyebrow", "photo", "variant"] as const;

function key(): string | null {
  return process.env.OG_SIGNING_KEY || process.env.API_SHARED_SECRET || null;
}

/** The parameters in their fixed order, without the signature. */
export function ogCanonical(params: URLSearchParams): string {
  const out = new URLSearchParams();
  for (const k of PARAMS) {
    const v = params.get(k);
    if (v) out.set(k, v);
  }
  return out.toString();
}

export function signOg(canonical: string): string | null {
  const k = key();
  return k ? createHmac("sha256", `og:${k}`).update(canonical).digest("hex").slice(0, 20) : null;
}

export function ogSignatureOk(params: URLSearchParams): boolean {
  const expected = signOg(ogCanonical(params));
  if (expected === null) return true;
  const given = params.get("s") ?? "";
  return given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}
