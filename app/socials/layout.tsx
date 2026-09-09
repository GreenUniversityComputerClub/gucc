import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo/metadata";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema, graph, webPageSchema } from "@/lib/seo/schema";

export const metadata: Metadata = buildMetadata({
  title: "Official Social Media Links",
  description: "All official Green University Computer Club channels in one place: Facebook page and group, LinkedIn, Instagram, YouTube and GitHub. Follow GUCC for event announcements and results.",
  path: "/socials",
  keywords: ["GUCC Facebook", "GUCC LinkedIn", "GUCC Instagram", "GUCC YouTube", "GUCC GitHub", "Green University Computer Club social media"],
  image: {
    eyebrow: "Connect",
    title: "Follow GUCC",
    subtitle: "Every official channel in one place",
  },
});

const structuredData = graph(
  breadcrumbSchema([
    { name: "Home", path: "/" },
    { name: "Socials", path: "/socials" },
  ]),
  webPageSchema({
    name: "Official Social Media Links",
    description: "All official Green University Computer Club channels in one place: Facebook page and group, LinkedIn, Instagram, YouTube and GitHub. Follow GUCC for event announcements and results.",
    path: "/socials",
  })
);

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd id="socials-schema" data={structuredData} />
      {children}
    </>
  );
}
