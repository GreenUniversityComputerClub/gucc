import { describe, expect, it } from "vitest";
import { cleanSections, comparisonTiers, comparisonValue, safeHref, sectionsOf, videoEmbed, visibleSections } from "@/lib/sponsorship/sections";
import { GENERAL_SPONSORSHIP } from "@/lib/sponsorship/general";

describe("sponsorship sections", () => {
  it("pages saved before sections get the classic order", () => {
    expect(sectionsOf({}).map((s) => s.type)).toEqual(["recognition", "programs", "why", "achievements", "partners", "packages", "opportunities", "gallery", "contact"]);
    expect(sectionsOf(GENERAL_SPONSORSHIP.content as never).length).toBe(9);
  });

  it("keeps known sections once each, in the saved order, and hides hidden ones", () => {
    const c = { sections: [{ id: "a", type: "packages" }, { id: "b", type: "packages" }, { id: "x", type: "marquee" }, { id: "faq1", type: "faq", visible: false }, { id: "t", type: "text" }] } as never;
    expect(sectionsOf(c).map((s) => s.id)).toEqual(["a", "faq1", "t"]);
    expect(visibleSections(c).map((s) => s.id)).toEqual(["a", "t"]);
  });

  it("cleans what the API stores: links, sizes, unknown blocks, too many sections", () => {
    const { content, errors } = cleanSections({
      sections: [
        { id: "cta 1!", type: "cta", data: { label: "Go", href: "javascript:alert(1)" } },
        { id: "img", type: "images", data: { items: [{ src: "http://insecure.example/a.png", alt: "a" }, { src: "/media/x.webp", alt: "b" }] } },
        { id: "v", type: "video", data: { url: "https://evil.example/video" } },
        { id: "f", type: "faq", data: { items: [{ q: "", a: "x" }, { q: "When?", a: "Soon" }] } },
      ],
      theme: { accent: "neon", heroImage: "javascript:x" },
      seo: { title: "x".repeat(100), noIndex: "yes" },
    } as never);
    expect(errors).toEqual([]);
    const [cta, img, video, faq] = content.sections!;
    expect(cta).toMatchObject({ id: "cta1", data: { href: "#contact" } });
    expect(img!.data).toEqual({ items: [{ src: "/media/x.webp", alt: "b" }] });
    expect(video!.data).toMatchObject({ url: "" });
    expect(faq!.data).toEqual({ items: [{ q: "When?", a: "Soon" }] });
    expect(content.theme).toEqual({});
    expect(content.seo).toEqual({ title: "x".repeat(70) });
    expect(cleanSections({ sections: Array.from({ length: 31 }, (_, i) => ({ id: `t${i}`, type: "text" })) } as never).errors).toHaveLength(1);
  });

  it("videos, links and the comparison table", () => {
    expect(videoEmbed("https://youtu.be/dQw4w9WgXcQ")?.src).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0");
    expect(videoEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10")?.id).toBe("dQw4w9WgXcQ");
    expect(videoEmbed("https://vimeo.com/123456789")?.src).toContain("player.vimeo.com/video/123456789");
    expect(videoEmbed("http://youtu.be/dQw4w9WgXcQ")).toBeNull();
    expect([safeHref("#contact"), safeHref("/contact?topic=x"), safeHref("//evil.example"), safeHref("mailto:a@b.co"), safeHref("data:text/html,x")]).toEqual(["#contact", "/contact?topic=x", null, "mailto:a@b.co", null]);
    expect(comparisonTiers({ packages: [{ tier: "Title Sponsor" }, { tier: "Partner" }] } as never)).toEqual(["Title Sponsor", "Partner"]);
    expect(comparisonValue({ gold: true, silver: false, bronze: false }, "Gold Sponsor")).toBe(true);
    expect(comparisonValue({ gold: true, silver: false, bronze: false, values: { "Gold Sponsor": false } }, "Gold Sponsor")).toBe(false);
    expect(comparisonValue({ gold: false, silver: true, bronze: false }, "Partner")).toBe(false);
  });
});
