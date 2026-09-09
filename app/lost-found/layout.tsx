import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo/metadata";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema, graph, webPageSchema } from "@/lib/seo/schema";

export const metadata: Metadata = buildMetadata({
  title: "Lost & Found — Green University Campus",
  description: "The Green University Computer Club lost and found board. Report an item you lost or found on the Green University of Bangladesh campus and get it back to its owner.",
  path: "/lost-found",
  keywords: ["Green University lost and found", "GUB lost item", "campus lost and found", "GUCC lost found"],
  image: {
    eyebrow: "Campus Service",
    title: "Lost & Found",
    subtitle: "Report and recover items on campus",
  },
});

const structuredData = graph(
  breadcrumbSchema([
    { name: "Home", path: "/" },
    { name: "Lost & Found", path: "/lost-found" },
  ]),
  webPageSchema({
    name: "Lost & Found — Green University Campus",
    description: "The Green University Computer Club lost and found board. Report an item you lost or found on the Green University of Bangladesh campus and get it back to its owner.",
    path: "/lost-found",
  })
);

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd id="lost-found-schema" data={structuredData} />
      {children}
    </>
  );
}
