import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema, graph, webPageSchema } from "@/lib/seo/schema";
import { getRecruitment } from "@/lib/public/data";
import { RecruitmentClosed, RecruitmentForm } from "./recruitment-client";

// Campaign status comes from the database; refreshed every few minutes and when admins save.
export const revalidate = 300;

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

export default async function RecruitmentPage() {
  const { open, upcoming, semesters, genders } = await getRecruitment();
  return (
    <>
      <JsonLd id="recruitment-schema" data={structuredData} />
      {open ? <RecruitmentForm campaign={open} semesters={semesters} genders={genders} /> : <RecruitmentClosed upcoming={upcoming} />}
    </>
  );
}
