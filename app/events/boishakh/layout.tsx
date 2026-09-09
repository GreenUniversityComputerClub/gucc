import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo/metadata";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema, graph, webPageSchema } from "@/lib/seo/schema";

export const metadata: Metadata = buildMetadata({
  title: "Pohela Boishakh at GUCC",
  description: "Pohela Boishakh celebrations hosted by the Green University Computer Club — the Bengali New Year programme at Green University of Bangladesh.",
  path: "/events/boishakh",
  keywords: ["Pohela Boishakh", "GUCC Boishakh", "Bengali New Year Green University", "Boishakh celebration Dhaka"],
  image: {
    eyebrow: "Celebration",
    title: "Pohela Boishakh",
    subtitle: "Bengali New Year at Green University",
  },
});

const structuredData = graph(
  breadcrumbSchema([
    { name: "Home", path: "/" },
    { name: "Events", path: "/events" },
    { name: "Pohela Boishakh", path: "/events/boishakh" },
  ]),
  webPageSchema({
    name: "Pohela Boishakh at GUCC",
    description: "Pohela Boishakh celebrations hosted by the Green University Computer Club — the Bengali New Year programme at Green University of Bangladesh.",
    path: "/events/boishakh",
  })
);

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd id="events-boishakh-schema" data={structuredData} />
      {children}
    </>
  );
}
