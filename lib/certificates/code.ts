/**
 * Certificate codes: 16 Crockford base-32 characters (80 random bits), shown as
 * GUCC-XXXX-XXXX-XXXX-XXXX. Unguessable, so a code is the proof; easy to read aloud or type (no I,
 * L, O or U, and typing them anyway still works).
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** A new random code (80 bits from the platform's secure random source). */
export function newCertificateCode(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out;
}

/** GUCC-XXXX-XXXX-XXXX-XXXX */
export const formatCode = (code: string) => `GUCC-${code.match(/.{1,4}/g)?.join("-") ?? code}`;

/** What someone typed or scanned, as a stored code, or null. Tolerant of case, spaces, dashes and look-alikes. */
export function normalizeCode(input: string): string | null {
  const s = input.toUpperCase().replace(/^\s*(HTTPS?:\/\/[^\s]*\/C\/)/, "").replace(/^GUCC/, "").replace(/[\s-]+/g, "")
    .replace(/[IL]/g, "1").replace(/O/g, "0").replace(/U/g, "V");
  return /^[0-9A-HJKMNP-TV-Z]{16}$/.test(s) ? s : null;
}
