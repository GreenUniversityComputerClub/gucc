import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo/metadata";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema, graph, webPageSchema } from "@/lib/seo/schema";

export const metadata: Metadata = buildMetadata({
  title: "NAT Test Resources",
  description: "NAT test resources and practice material prepared by the Green University Computer Club for students of Green University of Bangladesh.",
  path: "/nat-test",
  keywords: ["NAT test", "NAT test practice", "Green University NAT", "GUCC NAT test"],
  image: {
    eyebrow: "Resources",
    title: "NAT Test",
    subtitle: "Practice material and resources",
  },
});

const structuredData = graph(
  breadcrumbSchema([
    { name: "Home", path: "/" },
    { name: "NAT Test", path: "/nat-test" },
  ]),
  webPageSchema({
    name: "NAT Test Resources",
    description: "NAT test resources and practice material prepared by the Green University Computer Club for students of Green University of Bangladesh.",
    path: "/nat-test",
  })
);

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd id="nat-test-schema" data={structuredData} />
      {children}
    </>
  );
}
