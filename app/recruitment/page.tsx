import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema, graph, webPageSchema } from "@/lib/seo/schema";
import { RecruitmentClient } from "./recruitment-client";

/**
 * Server wrapper so this page's structured data does not leak onto
 * /recruitment/rules, which inherits the same layout.
 */
const structuredData = graph(
  breadcrumbSchema([
    { name: "Home", path: "/" },
    { name: "Recruitment", path: "/recruitment" },
  ]),
  webPageSchema({
    name: "Executive Recruitment",
    description:
      "GUCC executive recruitment for Green University of Bangladesh students: available positions, selection rounds, eligibility and how to apply.",
    path: "/recruitment",
  })
);

export default function RecruitmentPage() {
  return (
    <>
      <JsonLd id="recruitment-schema" data={structuredData} />
      <RecruitmentClient />
    </>
  );
}
