/**
 * Open Graph cards cost CPU on Vercel, so only URLs the site made are rendered: each carries a
 * short signature of its parameters.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { ogCanonical, ogSignatureOk, signOg } from "@/lib/seo/og-sign";

afterEach(() => vi.unstubAllEnvs());

describe("signed OG card URLs", () => {
  it("accept the site's own URLs and refuse edited or made-up ones", () => {
    vi.stubEnv("OG_SIGNING_KEY", "og-test-key-0123456789");
    const params = new URLSearchParams({ title: "Hackathon 2026", subtitle: "Results", variant: "portrait" });
    const canonical = ogCanonical(params);
    const signed = new URLSearchParams(`${canonical}&s=${signOg(canonical)}`);
    expect(ogSignatureOk(signed)).toBe(true);
    // Parameter order doesn't matter; the signature covers the values.
    expect(ogSignatureOk(new URLSearchParams(`variant=portrait&subtitle=Results&title=Hackathon+2026&s=${signOg(canonical)}`))).toBe(true);
    const edited = new URLSearchParams(signed);
    edited.set("title", "Anything I like");
    expect(ogSignatureOk(edited)).toBe(false);
    expect(ogSignatureOk(new URLSearchParams("title=Made+up"))).toBe(false);
    expect(ogSignatureOk(new URLSearchParams(`${canonical}&s=${"0".repeat(20)}`))).toBe(false);
  });

  it("without a key (local development) every URL renders", () => {
    vi.stubEnv("OG_SIGNING_KEY", "");
    vi.stubEnv("API_SHARED_SECRET", "");
    expect(signOg("title=x")).toBeNull();
    expect(ogSignatureOk(new URLSearchParams("title=x"))).toBe(true);
  });
});
