/** Form addresses: which services may be framed, how each becomes embeddable, and when a form is open. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { embedHeightOf, embedUrlFor, extractFormUrl, formState, isInAppBrowser, openUrlFor, providerOf } from "@/lib/forms/providers";
import { chromeIntent, cookieAdvice, SIGN_IN_PAGE, visitorOf } from "@/lib/forms/frame";
import { parseGooglePage } from "@/lib/forms/google-page";

const ID = "1FAIpQLSe0xRAKii3KNOj52TwTLlByVs0PBPNDUEZrxBrisILWFK1YQA";

describe("form providers", () => {
  it("accepts only the form services the page can frame", () => {
    expect(providerOf(`https://docs.google.com/forms/d/e/${ID}/viewform`)).toBe("google");
    expect(providerOf("https://forms.gle/P8NCR5h9bkk6ne1H9")).toBe("google");
    expect(providerOf("https://forms.office.com/Pages/ResponsePage.aspx?id=abc")).toBe("microsoft");
    expect(providerOf("https://tally.so/r/w4ZQ1b")).toBe("tally");
    expect(providerOf("https://airtable.com/appX/shrY")).toBe("airtable");
    expect(providerOf("https://docs.google.com/document/d/1/edit")).toBeNull();
    expect(providerOf("http://docs.google.com/forms/d/e/x/viewform")).toBeNull();
    expect(providerOf("https://evil.example/forms")).toBeNull();
  });

  it("turns any Google Forms address into the embedded answer page, keeping pre-filled answers", () => {
    expect(embedUrlFor(`https://docs.google.com/forms/d/e/${ID}/viewform?usp=send_form`)).toBe(`https://docs.google.com/forms/d/e/${ID}/viewform?embedded=true`);
    expect(embedUrlFor(`https://docs.google.com/forms/d/e/${ID}/viewform?usp=pp_url&entry.1=GUCC`)).toBe(`https://docs.google.com/forms/d/e/${ID}/viewform?usp=pp_url&entry.1=GUCC&embedded=true`);
    expect(embedUrlFor("https://docs.google.com/forms/d/abc123/edit")).toBe("https://docs.google.com/forms/d/abc123/viewform?embedded=true");
    expect(openUrlFor(`https://docs.google.com/forms/d/e/${ID}/viewform?embedded=true`)).toBe(`https://docs.google.com/forms/d/e/${ID}/viewform`);
  });

  it("can't embed a short link before it is resolved", () => {
    expect(embedUrlFor("https://forms.gle/P8NCR5h9bkk6ne1H9")).toBeNull();
  });

  it("builds Microsoft, Tally and Airtable embed addresses", () => {
    expect(embedUrlFor("https://forms.office.com/Pages/ResponsePage.aspx?id=abc")).toBe("https://forms.office.com/Pages/ResponsePage.aspx?id=abc&embed=true");
    expect(embedUrlFor("https://tally.so/r/w4ZQ1b")).toMatch(/^https:\/\/tally\.so\/embed\/w4ZQ1b\?/);
    expect(embedUrlFor("https://airtable.com/appX/shrY")).toBe("https://airtable.com/embed/appX/shrY");
  });

  it("reads a link out of Google's embed code", () => {
    const code = `<iframe src="https://docs.google.com/forms/d/e/${ID}/viewform?embedded=true&amp;usp=x" width="640" height="2363" frameborder="0">Loading…</iframe>`;
    expect(extractFormUrl(code)).toBe(`https://docs.google.com/forms/d/e/${ID}/viewform?embedded=true&usp=x`);
    expect(embedHeightOf(code)).toBe(2363);
  });

  it("works out whether a form is open", () => {
    const now = Date.parse("2026-10-04T12:00:00Z");
    expect(formState({}, now)).toBe("open");
    expect(formState({ opensAt: "2026-10-05T00:00:00Z" }, now)).toBe("scheduled");
    expect(formState({ closesAt: "2026-10-04T11:00:00Z" }, now)).toBe("closed");
    expect(formState({ accepting: false }, now)).toBe("closed");
  });

  it("recognises the in-app browsers of social apps", () => {
    expect(isInAppBrowser("Mozilla/5.0 (iPhone) [FBAN/FBIOS;FBAV/400.0]")).toBe(true);
    expect(isInAppBrowser("Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile Safari/537.36")).toBe(false);
  });
});

describe("helping a visitor whose form stays blank", () => {
  const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
  const CHROME_ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
  const EDGE = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0";
  const FIREFOX = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0";
  const MAC_SAFARI = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

  it("tells browsers apart", () => {
    expect(visitorOf(IPHONE)).toEqual({ browser: "safari", ios: true, android: false });
    expect(visitorOf("Mozilla/5.0 (iPhone) AppleWebKit/605 CriOS/130 Mobile Safari/604.1")).toMatchObject({ browser: "chrome", ios: true });
    expect(visitorOf(CHROME_ANDROID)).toEqual({ browser: "chrome", ios: false, android: true });
    expect(visitorOf(EDGE).browser).toBe("edge");
    expect(visitorOf(FIREFOX).browser).toBe("firefox");
    expect(visitorOf(MAC_SAFARI).browser).toBe("safari");
    expect(visitorOf("curl/8").browser).toBe("other");
  });

  it("names the setting to change in each browser", () => {
    expect(cookieAdvice(visitorOf(IPHONE))).toContain("Prevent Cross-Site Tracking");
    expect(cookieAdvice(visitorOf(MAC_SAFARI))).toContain("Prevent cross-site tracking");
    expect(cookieAdvice(visitorOf(FIREFOX))).toContain("Enhanced Tracking Protection");
    expect(cookieAdvice(visitorOf(CHROME_ANDROID))).toContain("third-party cookies");
    expect(cookieAdvice(visitorOf("curl/8"))).toContain("third-party cookies");
  });

  it("offers only the provider's sign-in page, never the form", () => {
    expect(SIGN_IN_PAGE.google?.url).toBe("https://accounts.google.com/");
    expect(SIGN_IN_PAGE.microsoft?.url).toBe("https://login.microsoftonline.com/");
    expect(SIGN_IN_PAGE.tally).toBeUndefined();
    for (const p of Object.values(SIGN_IN_PAGE)) expect(p?.url).not.toMatch(/forms|viewform/);
  });

  it("builds a Chrome address for Android's in-app browsers", () => {
    const href = "https://gucc.green.edu.bd/forms/cr-2026?x=1";
    const intent = chromeIntent(href)!;
    expect(intent.startsWith("intent://gucc.green.edu.bd/forms/cr-2026?x=1#Intent;scheme=https;package=com.android.chrome;")).toBe(true);
    expect(intent).toContain(`S.browser_fallback_url=${encodeURIComponent(href)}`);
    expect(chromeIntent("http://localhost:3001/forms/x")).toContain("#Intent;scheme=http;package=com.android.chrome;");
    expect(chromeIntent("javascript:alert(1)")).toBeNull();
    expect(chromeIntent("not a url")).toBeNull();
  });
});

describe("Google form pages", () => {
  const page = (data: unknown) => `<html><head><meta property="og:title" content="CR Form &amp; Info"></head><body><script>var FB_PUBLIC_LOAD_DATA_ = ${JSON.stringify(data)};</script></body></html>`;

  it("reads the title, description and number of questions", () => {
    const items = [[1, "Intro", null, 6], [2, "Name", null, 0], [3, "Batch", null, 3], [4, "Section", null, 8], [5, "Photo", null, 11], [6, "Rating", null, 18]];
    const p = parseGooglePage(page([null, ["Fill this in.\n\n\n\nThanks", items, null, null, null, null, null, null, "CR Information Form"]]));
    expect(p).toEqual({ title: "CR Information Form", description: "Fill this in.\n\nThanks", questionCount: 3, closed: false });
  });

  it("falls back to the page title, and notices a closed form", () => {
    expect(parseGooglePage(page("not the usual shape")).title).toBe("CR Form & Info");
    expect(parseGooglePage("<html><body>This form is no longer accepting responses</body></html>").closed).toBe(true);
  });

  it("parses the next.config CSP so every accepted form host can be framed", () => {
    const csp = readFileSync("next.config.ts", "utf8").match(/"frame-src [^"]+"/)?.[0] ?? "";
    for (const host of ["https://docs.google.com", "https://forms.gle", "https://forms.office.com", "https://tally.so", "https://airtable.com"]) expect(csp).toContain(host);
  });
});
