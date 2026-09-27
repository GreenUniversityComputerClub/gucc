import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, decryptSecret, encryptSecret, hashRecoveryCode, hotp, newRecoveryCodes, totpAt, verifyTotp } from "@/lib/server/totp";

const RFC_SECRET = new TextEncoder().encode("12345678901234567890");

describe("TOTP (RFC 6238 / RFC 4226)", () => {
  it("matches the RFC 4226 HOTP vectors", async () => {
    const expected = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"];
    for (let i = 0; i < expected.length; i++) expect(await hotp(RFC_SECRET, i)).toBe(expected[i]);
  });

  it("matches the RFC 6238 SHA-1 vectors (8 digits)", async () => {
    const vectors: Array<[number, string]> = [[59, "94287082"], [1111111109, "07081804"], [1111111111, "14050471"], [1234567890, "89005924"], [2000000000, "69279037"], [20000000000, "65353130"]];
    for (const [t, code] of vectors) expect(await hotp(RFC_SECRET, Math.floor(t / 30), 8)).toBe(code);
  });

  it("accepts one step of drift, and never the same step twice", async () => {
    const now = 1_700_000_000;
    const code = await totpAt(RFC_SECRET, now);
    const step = Math.floor(now / 30);
    expect(await verifyTotp(RFC_SECRET, code, { now })).toBe(step);
    expect(await verifyTotp(RFC_SECRET, code, { now: now + 30 })).toBe(step);
    expect(await verifyTotp(RFC_SECRET, code, { now: now + 90 })).toBeNull();
    expect(await verifyTotp(RFC_SECRET, code, { now, lastStep: step })).toBeNull();
    expect(await verifyTotp(RFC_SECRET, "12345", { now })).toBeNull();
  });

  it("round-trips base32 and the encrypted secret", async () => {
    const bytes = crypto.getRandomValues(new Uint8Array(20));
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
    expect(base32Encode(new TextEncoder().encode("foobar"))).toBe("MZXW6YTBOI");
    const enc = await encryptSecret(bytes, "a-test-auth-secret-long-enough");
    expect(enc).not.toContain(base32Encode(bytes));
    expect(await decryptSecret(enc, "a-test-auth-secret-long-enough")).toEqual(bytes);
    await expect(decryptSecret(enc, "another-secret-entirely-000")).rejects.toThrow();
  });

  it("makes ten distinct recovery codes, hashed case- and dash-insensitively", async () => {
    const codes = newRecoveryCodes();
    expect(new Set(codes).size).toBe(10);
    expect(codes[0]).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}$/);
    expect(await hashRecoveryCode(codes[0].toUpperCase().replace("-", " "), "p")).toBe(await hashRecoveryCode(codes[0], "p"));
  });
});
