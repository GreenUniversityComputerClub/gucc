/**
 * WebCrypto helpers (available in Workers and Node 20+). No dependencies.
 *
 * Passwords: PBKDF2-HMAC-SHA256 over HMAC(pepper, password).
 *
 * The Workers free plan allows 10 ms of CPU per request, and 100 000 PBKDF2
 * iterations alone take ~15 ms, so logins would randomly fail with "exceeded
 * CPU". We use 20 000 iterations (~3 ms) and add a server-side pepper
 * (PASSWORD_PEPPER, a Worker secret that never touches the database): a
 * leaked database alone cannot be brute-forced at all. On a paid plan raise
 * PBKDF2_ITERATIONS (Workers cap it at 100 000); the count is stored in each
 * hash and older hashes are upgraded on the next successful login.
 *
 *   pbkdf2_sha256$<iterations>$<salt>$<hash>          no pepper (development)
 *   pbkdf2_sha256p$<iterations>$<salt>$<hash>$<kid>   peppered; kid names the pepper (a short
 *                                                     hash of it), so a pepper rotation needs
 *                                                     one PBKDF2 run per sign-in, not two
 *
 * Rotating the pepper: set PASSWORD_PEPPER_PREVIOUS to the old value and PASSWORD_PEPPER to the new
 * one. Hashes made with the old pepper still verify and are re-hashed with the new one at the next
 * sign-in (docs/platform/RUNBOOK.md, "Rotate secrets").
 */

export const PBKDF2_ITERATIONS = 20_000;
const enc = new TextEncoder();

export function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64url(s: string): Uint8Array {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return b64url(buf);
}

export async function sha256Hex(input: string | Uint8Array | ArrayBuffer): Promise<string> {
  const data = typeof input === "string" ? enc.encode(input) : input;
  const digest = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function peppered(password: string, pepper: string | undefined): Promise<Uint8Array> {
  const pw = enc.encode(password.normalize("NFKC"));
  if (!pepper) return pw;
  const k = await crypto.subtle.importKey("raw", enc.encode(pepper), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, pw));
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number, pepper?: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", (await peppered(password, pepper)) as BufferSource, "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, key, 256);
  return new Uint8Array(bits);
}

/** A short, non-secret name for a pepper (which one made a hash), without revealing it. */
export async function pepperId(pepper: string): Promise<string> {
  return (await sha256Hex(`gucc-pepper-id|${pepper}`)).slice(0, 8);
}

export async function hashPassword(password: string, pepper?: string, iterations = PBKDF2_ITERATIONS): Promise<string> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const hash = await pbkdf2(password, salt, iterations, pepper);
  return pepper
    ? `pbkdf2_sha256p$${iterations}$${b64url(salt)}$${b64url(hash)}$${await pepperId(pepper)}`
    : `pbkdf2_sha256$${iterations}$${b64url(salt)}$${b64url(hash)}`;
}

export interface VerifyResult {
  ok: boolean;
  needsRehash: boolean;
}

export async function verifyPassword(password: string, stored: string | null, pepper?: string, previousPepper?: string): Promise<VerifyResult> {
  const parts = (stored ?? "").split("$");
  const scheme = parts[0];
  const iterations = Number(parts[1]);
  const peppered = scheme === "pbkdf2_sha256p";
  const valid = (parts.length === 4 || (peppered && parts.length === 5)) && (scheme === "pbkdf2_sha256" || (peppered && Boolean(pepper))) && iterations >= 1000 && iterations <= 100_000;
  // Which pepper made this hash: named by its id, or (older hashes without one) the current, then the previous.
  let candidates: Array<string | undefined> = [undefined];
  if (valid && peppered) {
    const kid = parts[4];
    if (!kid) candidates = [pepper, ...(previousPepper ? [previousPepper] : [])];
    else if (kid === (await pepperId(pepper!))) candidates = [pepper];
    else if (previousPepper && kid === (await pepperId(previousPepper))) candidates = [previousPepper];
    else candidates = [];
  }
  if (!valid || candidates.length === 0) {
    // Burn comparable time so a missing account is not distinguishable by timing.
    await pbkdf2(password, new Uint8Array(16), PBKDF2_ITERATIONS, pepper);
    return { ok: false, needsRehash: false };
  }
  for (const candidate of candidates) {
    const actual = await pbkdf2(password, fromB64url(parts[2]), iterations, candidate);
    if (timingSafeEqual(actual, fromB64url(parts[3]))) {
      // Re-hash when the cost, the pepper or the format isn't current.
      const current = iterations === PBKDF2_ITERATIONS && peppered === Boolean(pepper) && candidate === pepper && (!peppered || parts.length === 5);
      return { ok: true, needsRehash: !current };
    }
  }
  return { ok: false, needsRehash: false };
}

/** Hash an IP with a server secret so logs can correlate abuse without storing addresses. */
export async function hashIp(ip: string | null | undefined, secret: string | undefined): Promise<string | null> {
  if (!ip) return null;
  return (await sha256Hex(`${secret ?? "no-secret"}|${ip}`)).slice(0, 32);
}
