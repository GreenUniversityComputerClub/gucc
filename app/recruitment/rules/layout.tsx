import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo/metadata";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema, graph, webPageSchema } from "@/lib/seo/schema";

export const metadata: Metadata = buildMetadata({
  title: "Recruitment Rules & Eligibility",
  description: "The official rules, eligibility criteria and code of conduct for Green University Computer Club executive recruitment.",
  path: "/recruitment/rules",
  keywords: ["GUCC recruitment rules", "GUCC eligibility", "GUCC code of conduct"],
  image: {
    eyebrow: "Recruitment",
    title: "Recruitment Rules",
    subtitle: "Eligibility and code of conduct",
  },
});

const structuredData = graph(
  breadcrumbSchema([
    { name: "Home", path: "/" },
    { name: "Recruitment", path: "/recruitment" },
    { name: "Rules", path: "/recruitment/rules" },
  ]),
  webPageSchema({
    name: "Recruitment Rules & Eligibility",
    description: "The official rules, eligibility criteria and code of conduct for Green University Computer Club executive recruitment.",
    path: "/recruitment/rules",
  })
);

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd id="recruitment-rules-schema" data={structuredData} />
      {children}
    </>
  );
}
