import { describe, expect, it } from "vitest";
import { isPrivateAddress, parsePreview, previewableUrl } from "@/lib/link-preview";

describe("link previews never reach private addresses", () => {
  it("knows private, loopback, link-local and metadata addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "::", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ["8.8.8.8", "104.21.3.4", "172.32.0.1", "2606:4700::1111", "::ffff:8.8.8.8"]) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
    expect(isPrivateAddress("not-an-ip")).toBe(true);
  });

  it("accepts ordinary web addresses only", () => {
    expect(previewableUrl("https://www.youtube.com/watch?v=abc#t=1")?.href).toBe("https://www.youtube.com/watch?v=abc");
    expect(previewableUrl("http://example.com/page")).not.toBeNull();
    for (const bad of [
      "http://localhost:3000/", "http://127.0.0.1/", "http://10.0.0.5/admin", "http://[::1]/", "http://169.254.169.254/latest/meta-data",
      "file:///etc/passwd", "ftp://example.com/", "javascript:alert(1)", "https://user:pw@example.com/", "https://example.com:8443/",
      "http://intranet/", "http://printer.local/", "http://app.internal/", `https://example.com/${"a".repeat(2100)}`, "not a url",
    ]) {
      expect(previewableUrl(bad), bad).toBeNull();
    }
  });
});

describe("reading a page's preview", () => {
  const page = new URL("https://news.example.com/articles/1");

  it("prefers Open Graph, decodes entities and resolves the picture", () => {
    const p = parsePreview(`<!doctype html><html><head>
      <title>Fallback title</title>
      <meta property="og:title" content="GUCC wins &amp; celebrates &#x1F389;">
      <meta property='og:description' content="Line one
        line two <b>bold</b>">
      <meta property="og:image" content="/img/cover.jpg">
      <meta property="og:site_name" content="Example News">
      </head><body><meta property="og:title" content="ignored"></body></html>`, page);
    expect(p).toMatchObject({
      title: "GUCC wins & celebrates 🎉",
      description: "Line one line two bold",
      image: "https://news.example.com/img/cover.jpg",
      siteName: "Example News",
      host: "news.example.com",
      url: "https://news.example.com/articles/1",
    });
  });

  it("falls back to Twitter cards and the page's own title and description", () => {
    const p = parsePreview(`<head><title> Club  page </title><meta name="description" content="About us"><meta name="twitter:image" content="https://cdn.example.com/x.png"></head>`, page);
    expect(p).toMatchObject({ title: "Club page", description: "About us", image: "https://cdn.example.com/x.png", siteName: null });
  });

  it("drops insecure or private pictures and sign-in walls, and keeps text short", () => {
    const insecure = parsePreview(`<head><meta property="og:title" content="A"><meta property="og:image" content="http://example.com/a.jpg"></head>`, page);
    expect(insecure.image).toBeNull();
    const internal = parsePreview(`<head><meta property="og:title" content="A"><meta property="og:image" content="https://127.0.0.1/a.jpg"></head>`, page);
    expect(internal.image).toBeNull();
    const wall = parsePreview(`<head><title>Log in to Facebook</title></head>`, page);
    expect(wall.title).toBeNull();
    const long = parsePreview(`<head><meta property="og:title" content="${"x".repeat(400)}"></head>`, page);
    expect(long.title!.length).toBeLessThanOrEqual(160);
    expect(long.title!.endsWith("…")).toBe(true);
  });
});
