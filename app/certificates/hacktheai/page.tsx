import { VerificationForm } from './components/verification-form'

import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo/metadata";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema, graph, webPageSchema } from "@/lib/seo/schema";
import { PageHero } from "@/components/page-hero";
import { Award } from "lucide-react";

export const metadata: Metadata = buildMetadata({
  title: "HackTheAI Certificate Verification",
  description:
    "Verify a HackTheAI participation certificate issued by the Green University Computer Club. Enter the credentials printed on the certificate to confirm it is genuine.",
  path: "/certificates/hacktheai",
  keywords: [
    "HackTheAI certificate",
    "HackTheAI verification",
    "GUCC certificate",
    "hackathon certificate Bangladesh",
  ],
  image: {
    eyebrow: "HackTheAI",
    title: "Certificate Verification",
    subtitle: "Confirm a HackTheAI certificate is genuine",
  },
});


const structuredData = graph(
  breadcrumbSchema([
    { name: "Home", path: "/" },
    { name: "HackTheAI Certificates", path: "/certificates/hacktheai" },
  ]),
  webPageSchema({
    name: "HackTheAI Certificate Verification",
    description:
      "Verify a HackTheAI participation certificate issued by the Green University Computer Club.",
    path: "/certificates/hacktheai",
  })
);

export default function CertificateVerificationPage() {
  return (
    <>
      <JsonLd id="hacktheai-schema" data={structuredData} />
      <PageHero
        icon={<Award />}
        eyebrow="HackTheAI"
        title={<>Participation <span className="text-gradient">Certificate</span></>}
        description="Verify your participation and download your personalized certificate"
      />
      <div className="container mx-auto max-w-4xl px-4 py-12">
        <VerificationForm />
      </div>
    </>
  )
}

