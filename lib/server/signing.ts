/**
 * HMAC-SHA256 signing for short-lived capabilities the browser carries
 * directly to the API Worker: upload tokens and private-media links.
 * The secret never leaves the server; tokens expire; any change to the
 * signed payload invalidates the signature.
 */
import { b64url, fromB64url, timingSafeEqual } from "./crypto";

const enc = new TextEncoder();

async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

export async function hmac(secret: string, data: string): Promise<string> {
  const sig = await crypto.subtle.sign("HMAC", await key(secret), enc.encode(data));
  return b64url(sig);
}

/**
 * Checks against the current secret and, during a rotation, the previous one (AUTH_SECRET_PREVIOUS),
 * so links and tokens issued just before the switch keep working until they expire.
 */
export async function verifyHmac(secret: string | readonly string[], data: string, signature: string): Promise<boolean> {
  for (const s of typeof secret === "string" ? [secret] : secret) {
    try {
      if (timingSafeEqual(fromB64url(await hmac(s, data)), fromB64url(signature))) return true;
    } catch {
      return false;
    }
  }
  return false;
}

/** A compact signed token: base64url(JSON payload) + "." + signature. */
export async function signToken(secret: string, payload: Record<string, unknown>): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  return `${body}.${await hmac(secret, body)}`;
}

export async function verifyToken<T extends { exp: number }>(secret: string | readonly string[], token: string | null | undefined): Promise<T | null> {
  if (!token || token.length > 4000) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig || !(await verifyHmac(secret, body, sig))) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(body))) as T;
    return typeof payload.exp === "number" && payload.exp > Date.now() / 1000 ? payload : null;
  } catch {
    return null;
  }
}

export function requireSecret(secret: string | undefined): string {
  if (!secret || secret.length < 16) throw new Error("AUTH_SECRET is not configured (at least 16 characters).");
  return secret;
}

/** The current AUTH_SECRET, then the previous one while a rotation is in progress. Signing always uses the first. */
export function verificationSecrets(env: { AUTH_SECRET?: string; AUTH_SECRET_PREVIOUS?: string }): string[] {
  const current = requireSecret(env.AUTH_SECRET);
  const previous = env.AUTH_SECRET_PREVIOUS && env.AUTH_SECRET_PREVIOUS.length >= 16 && env.AUTH_SECRET_PREVIOUS !== current ? [env.AUTH_SECRET_PREVIOUS] : [];
  return [current, ...previous];
}
