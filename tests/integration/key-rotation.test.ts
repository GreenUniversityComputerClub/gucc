/**
 * Rotating AUTH_SECRET and PASSWORD_PEPPER without signing anyone out or locking anyone out:
 * the previous value keeps working during the overlap, and whatever it protected is upgraded
 * to the new one the next time it's used.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { Ctx } from "@/lib/server/context";
import { hashPassword, pepperId, verifyPassword } from "@/lib/server/crypto";
import { signToken, verificationSecrets, verifyToken } from "@/lib/server/signing";
import { confirmMfaSetup, startMfaSetup } from "@/lib/server/services/mfa";
import { login } from "@/lib/server/services/auth";
import { base32Decode, decryptSecret, totpAt } from "@/lib/server/totp";
import { createWorld, type TestWorld } from "../support/d1";

const OLD = "old-secret-0123456789abcdef";
const NEW = "new-secret-0123456789abcdef";

describe("password pepper rotation", () => {
  it("names the pepper in each hash, verifies old hashes once, and asks for a re-hash", async () => {
    const stored = await hashPassword("Correct-Horse-9!", "pepper-old");
    expect(stored.split("$")).toHaveLength(5);
    expect(stored.endsWith(`$${await pepperId("pepper-old")}`)).toBe(true);
    // After the switch: new pepper first, previous as the fallback.
    expect(await verifyPassword("Correct-Horse-9!", stored, "pepper-new", "pepper-old")).toEqual({ ok: true, needsRehash: true });
    expect(await verifyPassword("wrong", stored, "pepper-new", "pepper-old")).toEqual({ ok: false, needsRehash: false });
    // Without the previous pepper the old hash no longer verifies.
    expect((await verifyPassword("Correct-Horse-9!", stored, "pepper-new")).ok).toBe(false);
    const upgraded = await hashPassword("Correct-Horse-9!", "pepper-new");
    expect(await verifyPassword("Correct-Horse-9!", upgraded, "pepper-new", "pepper-old")).toEqual({ ok: true, needsRehash: false });
    // Hashes from before key ids existed still verify, and get one.
    const legacy = stored.split("$").slice(0, 4).join("$");
    expect(await verifyPassword("Correct-Horse-9!", legacy, "pepper-old")).toEqual({ ok: true, needsRehash: true });
  });
});

describe("AUTH_SECRET rotation", () => {
  it("accepts tokens signed with the previous secret until they expire; signs with the new one", async () => {
    const exp = Math.floor(Date.now() / 1000) + 60;
    const oldToken = await signToken(OLD, { s: "x", exp });
    expect(await verifyToken(verificationSecrets({ AUTH_SECRET: NEW, AUTH_SECRET_PREVIOUS: OLD }), oldToken)).toMatchObject({ s: "x" });
    expect(await verifyToken(verificationSecrets({ AUTH_SECRET: NEW }), oldToken)).toBeNull();
    expect(verificationSecrets({ AUTH_SECRET: NEW, AUTH_SECRET_PREVIOUS: NEW })).toEqual([NEW]);
    expect(verificationSecrets({ AUTH_SECRET: NEW, AUTH_SECRET_PREVIOUS: "short" })).toEqual([NEW]);
  });
});

describe("through the services", () => {
  let w: TestWorld;
  beforeEach(async () => {
    w = await createWorld();
  });
  const withEnv = async (userId: string | null, env: Partial<Ctx["env"]>): Promise<Ctx> => {
    const c = await w.ctx(userId);
    return { ...c, env: { ...c.env, ...env } };
  };

  it("re-encrypts a two-factor secret under the new AUTH_SECRET the first time it's used", async () => {
    const id = await w.user({ email: "m@x.bd", roles: ["member"] });
    const { secret } = await startMfaSetup(await withEnv(id, { AUTH_SECRET: OLD }));
    const code = await totpAt(base32Decode(secret.replace(/\s/g, "")), Date.now() / 1000);
    await confirmMfaSetup(await withEnv(id, { AUTH_SECRET: NEW, AUTH_SECRET_PREVIOUS: OLD }), code);
    const row = w.sqlite.prepare("SELECT secret_enc, confirmed_at FROM user_mfa WHERE user_id = ?").get(id) as { secret_enc: string; confirmed_at: string | null };
    expect(row.confirmed_at).not.toBeNull();
    await expect(decryptSecret(row.secret_enc, NEW)).resolves.toBeInstanceOf(Uint8Array);
    await expect(decryptSecret(row.secret_enc, OLD)).rejects.toThrow();
  });

  it("signs in with a password hashed under the previous pepper, and re-hashes it", async () => {
    const id = await w.user({ email: "m@x.bd", roles: ["member"] });
    w.sqlite.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(await hashPassword("Correct-Horse-Battery-9!", "pepper-old-0123456789"), id);
    const session = await login(await withEnv(null, { PASSWORD_PEPPER: "pepper-new-0123456789", PASSWORD_PEPPER_PREVIOUS: "pepper-old-0123456789" }), { email: "m@x.bd", password: "Correct-Horse-Battery-9!" });
    expect(session.userId).toBe(id);
    const hash = (w.sqlite.prepare("SELECT password_hash FROM users WHERE id = ?").get(id) as { password_hash: string }).password_hash;
    expect(hash.endsWith(`$${await pepperId("pepper-new-0123456789")}`)).toBe(true);
  });
});
