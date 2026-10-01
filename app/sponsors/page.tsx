import { redirect } from "next/navigation";
import { getSponsorshipHref } from "@/lib/public/data";

// Answered per request, so it follows the dashboard's choice at once.
export const dynamic = "force-dynamic";

/**
 * /sponsors opens the default sponsorship page (chosen in the dashboard), or the overview of all
 * of them when there's no default. A temporary redirect: the default can change.
 */
export default async function SponsorsIndex() {
  redirect(await getSponsorshipHref());
}
