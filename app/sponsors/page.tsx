import { notFound } from "next/navigation";
import { getPublicSetting } from "@/lib/public/data";
import type sponsorJson from "@/data/sponsors.json";
import { SponsorsClient } from "./sponsors-client";

// Page content is the organization setting "page.sponsorship", editable in /admin/settings.
export const revalidate = 21600;

export default async function SponsorsPage() {
  const data = await getPublicSetting<typeof sponsorJson>("page.sponsorship");
  if (!data) notFound();
  return <SponsorsClient sponsorData={data} />;
}
