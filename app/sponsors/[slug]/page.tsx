import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSponsorship, getSponsorships } from "@/lib/public/data";
import { JsonLd } from "@/components/seo/json-ld";
import { buildMetadata, truncate } from "@/lib/seo/metadata";
import { breadcrumbSchema, graph, webPageSchema } from "@/lib/seo/schema";
import { absoluteUrl } from "@/lib/seo/site";
import type { SponsorPackage, SponsorshipContent } from "@/lib/sponsorship/content";
import { visibleSections, type BlockData, type SectionedContent } from "@/lib/sponsorship/sections";
import { SponsorshipView } from "@/components/sponsorship/sponsorship-view";

// Cached; refreshed when a sponsorship page is edited in the dashboard.
export const revalidate = 21600;
export const dynamicParams = true;

export async function generateStaticParams() {
  return (await getSponsorships()).map((p) => ({ slug: p.slug }));
}

/** "Sponsor CSE Carnival 2026"; a page titled apart from its event ("Partner with GUCC") keeps its title. */
function headline(title: string, content: SectionedContent): string {
  if (content.seo?.title) return content.seo.title;
  const name = content.event?.fullName ?? title;
  return title === name ? `Sponsor ${name}` : title;
}

function describe(title: string, summary: string | null, content: SectionedContent): string {
  const name = content.event?.fullName ?? content.event?.name ?? title;
  return content.seo?.description ?? summary ?? `Sponsor ${name} with the Green University Computer Club: sponsorship packages, the programs you support and how to get in touch.`;
}

const packagesOf = (c: SponsorshipContent) => (Array.isArray(c.packages) ? c.packages : []) as SponsorPackage[];

/** "Packages from ৳40,000", "Partnership" (price on request), for the link preview. */
function priceLine(c: SponsorshipContent): string {
  const priced = packagesOf(c).filter((p) => Number(p.price) > 0);
  if (!priced.length) return "Partnership with GUCC";
  const low = priced.reduce((a, b) => (Number(b.price) < Number(a.price) ? b : a));
  return `Packages from ${low.currency === "BDT" || !low.currency ? "৳" : `${low.currency} `}${Number(low.price).toLocaleString("en-US")}`;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = await getSponsorship(slug);
  if (!page) return buildMetadata({ title: "Sponsorship", description: "This sponsorship opportunity isn't available.", path: `/sponsors/${slug}`, noIndex: true });
  const content = page.content as SectionedContent;
  const name = content.event?.fullName ?? page.title;
  return buildMetadata({
    title: headline(page.title, content),
    description: describe(page.title, page.summary, content),
    path: `/sponsors/${page.slug}`,
    keywords: ["GUCC sponsors", "sponsor GUCC", `${name} sponsorship`, "tech sponsorship Bangladesh", "student club sponsorship"],
    image: content.seo?.ogImage ?? { eyebrow: "Become a sponsor", title: name, subtitle: priceLine(content) },
    noIndex: content.seo?.noIndex === true,
  });
}

/** One sponsorship opportunity, from its own content and section order. */
export default async function SponsorshipPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await getSponsorship(slug);
  if (!page) notFound();
  const content = page.content as SectionedContent;
  const name = content.event?.fullName ?? page.title;
  const path = `/sponsors/${page.slug}`;
  const sections = visibleSections(content);
  const packages = sections.some((s) => s.type === "packages") ? packagesOf(content) : [];
  const faqs = sections.filter((s) => s.type === "faq").flatMap((s) => (s.data as BlockData["faq"] | undefined)?.items ?? []);
  return (
    <>
      <JsonLd id={`sponsorship-${page.slug}`} data={graph(
        breadcrumbSchema([{ name: "Home", path: "/" }, { name: "Become a sponsor", path: "/become-a-sponsor" }, { name, path }]),
        webPageSchema({ name: headline(page.title, content), description: truncate(describe(page.title, page.summary, content), 300), path }),
        packages.length > 0 && {
          "@type": "OfferCatalog",
          "@id": `${absoluteUrl(path)}#packages`,
          name: `${name} sponsorship packages`,
          url: absoluteUrl(`${path}#packages`),
          itemListElement: packages.map((p) => ({
            "@type": "Offer",
            name: p.tier,
            description: p.benefits.slice(0, 6).join("; "),
            ...(Number(p.price) > 0 ? { price: Number(p.price), priceCurrency: p.currency || "BDT" } : {}),
            seller: { "@type": "Organization", name: "Green University Computer Club" },
          })),
        },
        faqs.length > 0 && {
          "@type": "FAQPage",
          "@id": `${absoluteUrl(path)}#faq`,
          mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
        },
      )} />
      <SponsorshipView content={content} />
    </>
  );
}
