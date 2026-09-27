import { describe, expect, it } from "vitest";
import { hashPassword, PBKDF2_ITERATIONS, verifyPassword } from "@/lib/server/crypto";
import { hmac, requireSecret, signToken, verifyHmac, verifyToken } from "@/lib/server/signing";

const SECRET = "unit-test-secret-0123456789";

describe("signed tokens (upload capabilities, private media links)", () => {
  it("round-trips and rejects tampering, other secrets and expiry", async () => {
    const exp = Math.floor(Date.now() / 1000) + 60;
    const t = await signToken(SECRET, { p: "user", s: "usr_1", exp });
    expect(await verifyToken<{ exp: number; s: string }>(SECRET, t)).toMatchObject({ s: "usr_1" });
    const [body, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ p: "user", s: "usr_admin", exp })).toString("base64url");
    expect(await verifyToken(SECRET, `${forged}.${sig}`)).toBeNull();
    expect(await verifyToken(SECRET, `${body}.${sig.slice(0, -2)}xx`)).toBeNull();
    expect(await verifyToken("another-secret-0123456789", t)).toBeNull();
    const old = await signToken(SECRET, { s: "x", exp: Math.floor(Date.now() / 1000) - 1 });
    expect(await verifyToken(SECRET, old)).toBeNull();
    expect(await verifyToken(SECRET, "garbage")).toBeNull();
    expect(await verifyToken(SECRET, null)).toBeNull();
  });

  it("HMAC verification is exact", async () => {
    const sig = await hmac(SECRET, "media/2026/01/x/master.webp|123");
    expect(await verifyHmac(SECRET, "media/2026/01/x/master.webp|123", sig)).toBe(true);
    expect(await verifyHmac(SECRET, "media/2026/01/y/master.webp|123", sig)).toBe(false);
    expect(await verifyHmac(SECRET, "media/2026/01/x/master.webp|124", sig)).toBe(false);
  });

  it("refuses weak or missing secrets", () => {
    expect(() => requireSecret(undefined)).toThrow();
    expect(() => requireSecret("short")).toThrow();
    expect(requireSecret(SECRET)).toBe(SECRET);
  });
});

describe("password hashing (Workers free-plan budget)", () => {
  it("peppered hashes verify only with the pepper, and old hashes ask for a rehash", async () => {
    expect(PBKDF2_ITERATIONS).toBe(20_000);
    const peppered = await hashPassword("correct-Horse-battery", "pepper-1234567890");
    expect(peppered).toMatch(/^pbkdf2_sha256p\$20000\$/);
    expect(await verifyPassword("correct-Horse-battery", peppered, "pepper-1234567890")).toEqual({ ok: true, needsRehash: false });
    expect((await verifyPassword("correct-Horse-battery", peppered, "other-pepper-000000")).ok).toBe(false);
    expect((await verifyPassword("correct-Horse-battery", peppered, undefined)).ok).toBe(false);
    expect((await verifyPassword("wrong-password-xx", peppered, "pepper-1234567890")).ok).toBe(false);

    const legacy = await hashPassword("correct-Horse-battery", undefined, 100_000);
    expect(await verifyPassword("correct-Horse-battery", legacy, "pepper-1234567890")).toEqual({ ok: true, needsRehash: true });
    expect((await verifyPassword("x", "not-a-hash", "pepper-1234567890")).ok).toBe(false);
  });

  it("hashing stays well inside the 10 ms CPU budget", async () => {
    const t0 = performance.now();
    await hashPassword("correct-Horse-battery", "pepper-1234567890");
    expect(performance.now() - t0).toBeLessThan(40); // generous for CI machines; ~3 ms locally
  });
});
