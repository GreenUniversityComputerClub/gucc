import { OG_CONTENT_TYPE, OG_SIZE, renderOgCard } from "@/lib/seo/og-card";
import { SITE } from "@/lib/seo/site";

export const runtime = "nodejs";
export const alt = `${SITE.name} (${SITE.shortName})`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/** Site-wide fallback card, baked at build time. */
export default async function OpengraphImage() {
  return renderOgCard({
    eyebrow: `${SITE.shortName} · Since 2013`,
    title: "Green University Computer Club",
    subtitle: "7000+ members · Events, contests, hackathons and open source",
  });
}
