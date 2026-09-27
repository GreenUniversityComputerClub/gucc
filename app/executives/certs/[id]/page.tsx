import { getCommittees } from "@/lib/public/data";
import { CertsClient } from "./certs-client";

export const revalidate = 21600;

/** Rendered on the first visit, then cached (edits refresh it through the committees tag). */
export async function generateStaticParams() {
  return [];
}

/** Service certificates for the 2023–24 and reformed 2024 committees, from D1. */
export default async function ExecutiveCertificatesPage() {
  const committees = (await getCommittees()).filter((c) => c.year === "2023" || c.year === "2024");
  return <CertsClient executivesData={committees} />;
}
