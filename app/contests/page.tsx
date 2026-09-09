import { JsonLd } from "@/components/seo/json-ld";
import contestsData from "@/data/contests.json";
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
const contests = (
  contestsData.contests as Array<{ id: number; title: string; teams?: unknown[] }>
).filter((contest) => (contest.teams?.length ?? 0) > 0);

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

export default function ContestsPage() {
  return (
    <>
      <JsonLd id="contests-schema" data={structuredData} />
      <ContestsBrowser />
    </>
  );
}
