import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSponsorship, getSponsorships } from "@/lib/public/data";
import { JsonLd } from "@/components/seo/json-ld";
import { buildMetadata } from "@/lib/seo/metadata";
import { breadcrumbSchema, graph, webPageSchema } from "@/lib/seo/schema";
import type sponsorJson from "@/data/sponsors.json";
import { SponsorsClient } from "../sponsors-client";

// Cached; refreshed when a sponsorship page is edited in the dashboard.
export const revalidate = 21600;
export const dynamicParams = true;

export async function generateStaticParams() {
  return (await getSponsorships()).map((p) => ({ slug: p.slug }));
}

type Content = Partial<typeof sponsorJson> & { event?: { name?: string; fullName?: string } };

/** "Sponsor CSE Carnival 2026"; a page titled apart from its event ("Partner with GUCC") keeps its title. */
function headline(title: string, content: Content): string {
  const name = content.event?.fullName ?? title;
  return title === name ? `Sponsor ${name}` : title;
}

function describe(title: string, summary: string | null, content: Content): string {
  const name = content.event?.fullName ?? content.event?.name ?? title;
  return summary ?? `Sponsor ${name} with the Green University Computer Club: sponsorship packages, the programs you support and how to get in touch.`;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = await getSponsorship(slug);
  if (!page) return buildMetadata({ title: "Sponsorship", description: "This sponsorship opportunity isn't available.", path: `/sponsors/${slug}`, noIndex: true });
  const content = page.content as Content;
  const name = content.event?.fullName ?? page.title;
  return buildMetadata({
    title: headline(page.title, content),
    description: describe(page.title, page.summary, content),
    path: `/sponsors/${page.slug}`,
    keywords: ["GUCC sponsors", "sponsor GUCC", `${name} sponsorship`, "tech sponsorship Bangladesh", "student club sponsorship"],
    image: { eyebrow: "Become a sponsor", title: name, subtitle: "Green University Computer Club" },
  });
}

/** One sponsorship opportunity, in the CSE Carnival page's design, from its own content. */
export default async function SponsorshipPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await getSponsorship(slug);
  if (!page) notFound();
  const content = page.content as Content;
  const name = content.event?.fullName ?? page.title;
  return (
    <>
      <JsonLd id={`sponsorship-${page.slug}`} data={graph(
        breadcrumbSchema([{ name: "Home", path: "/" }, { name: "Become a sponsor", path: "/become-a-sponsor" }, { name, path: `/sponsors/${page.slug}` }]),
        webPageSchema({ name: headline(page.title, content), description: describe(page.title, page.summary, content), path: `/sponsors/${page.slug}` }),
      )} />
      <SponsorsClient sponsorData={page.content as typeof sponsorJson} />
    </>
  );
}
