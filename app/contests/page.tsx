import { JsonLd } from "@/components/seo/json-ld";
import { getPublicContests } from "@/lib/public/data";
import {
  breadcrumbSchema,
  collectionPageSchema,
  graph,
  itemListSchema,
} from "@/lib/seo/schema";
import { ContestsBrowser } from "./contests-browser";

/**
 * Server wrapper so the index's structured data stays on the index — the
 * layout it used to live in also wraps every /contests/[id] page.
 */
export const revalidate = 21600;

export default async function ContestsPage() {
  const all = await getPublicContests();
  const contests = all.filter((contest) => (contest.teams?.length ?? 0) > 0);

  const structuredData = graph(
  breadcrumbSchema([
    { name: "Home", path: "/" },
    { name: "Contests", path: "/contests" },
  ]),
  collectionPageSchema({
    name: "GUBIAN Contest History",
    description:
      "Programming contests where Green University of Bangladesh teams competed, including ICPC, IUPC, NCPC and hackathons.",
    path: "/contests",
    list: itemListSchema(
      "Programming contests",
      contests.map((contest) => ({
        name: contest.title,
        path: `/contests/${contest.id}`,
      }))
    ),
  })
  );

  return (
    <>
      <JsonLd id="contests-schema" data={structuredData} />
      <ContestsBrowser contests={all as never} />
    </>
  );
}
