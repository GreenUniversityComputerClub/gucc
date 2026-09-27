/**
 * Time-based one-time passwords (RFC 6238, SHA-1, 6 digits, 30-second steps) as authenticator
 * apps use them, with WebCrypto only so the same code runs in the Worker and in tests. The
 * shared secret is stored encrypted (AES-GCM, key derived from AUTH_SECRET), never in clear.
 */
import { b64url, fromB64url, sha256Hex } from "./crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
/** A copy backed by a plain ArrayBuffer, as WebCrypto's types expect. */
const buf = (b: Uint8Array): Uint8Array<ArrayBuffer> => new Uint8Array(b);
export const STEP_SECONDS = 30;

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Uint8Array {
  const clean = input.toUpperCase().replace(/[\s=-]/g, "");
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error("Invalid base32");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

export async function hotp(secret: Uint8Array, counter: number, digits = 6): Promise<string> {
  const msg = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    msg[i] = c & 0xff;
    c = Math.floor(c / 256);
  }
  const key = await crypto.subtle.importKey("raw", buf(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));
  const offset = mac[mac.length - 1]! & 0x0f;
  const bin = ((mac[offset]! & 0x7f) << 24) | (mac[offset + 1]! << 16) | (mac[offset + 2]! << 8) | mac[offset + 3]!;
  return String(bin % 10 ** digits).padStart(digits, "0");
}

export const stepAt = (unixSeconds: number) => Math.floor(unixSeconds / STEP_SECONDS);

export async function totpAt(secret: Uint8Array, unixSeconds: number, digits = 6): Promise<string> {
  return hotp(secret, stepAt(unixSeconds), digits);
}

/**
 * The step a code belongs to (one step either side is accepted for clock drift), or null.
 * A step at or before `lastStep` is refused, so a code can't be used twice.
 */
export async function verifyTotp(secret: Uint8Array, code: string, opts: { now?: number; lastStep?: number | null } = {}): Promise<number | null> {
  const clean = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return null;
  const current = stepAt(opts.now ?? Date.now() / 1000);
  for (const step of [current, current - 1, current + 1]) {
    if (opts.lastStep != null && step <= opts.lastStep) continue;
    if ((await hotp(secret, step)) === clean) return step;
  }
  return null;
}

async function aesKey(authSecret: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(authSecret), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new TextEncoder().encode("gucc-mfa"), info: new TextEncoder().encode("totp-secret-v1") },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(secret: Uint8Array, authSecret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(authSecret), buf(secret)));
  return `v1.${b64url(iv)}.${b64url(ct)}`;
}

export async function decryptSecret(stored: string, authSecret: string): Promise<Uint8Array> {
  const [v, iv, ct] = stored.split(".");
  if (v !== "v1" || !iv || !ct) throw new Error("Unknown secret format");
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf(fromB64url(iv)) }, await aesKey(authSecret), buf(fromB64url(ct))));
}

export function otpauthUri(secretBase32: string, account: string, issuer = "GUCC"): string {
  return `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;
}

/** Ten one-time recovery codes like "k7qp-3xzm" (lowercase, no look-alike characters). */
export function newRecoveryCodes(count = 10): string[] {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: count }, () => {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    const s = [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
    return `${s.slice(0, 4)}-${s.slice(4)}`;
  });
}

export const normalizeRecoveryCode = (code: string) => code.toLowerCase().replace(/[^a-z0-9]/g, "");
export const hashRecoveryCode = (code: string, pepper = "") => sha256Hex(`${pepper}|recovery|${normalizeRecoveryCode(code)}`);
