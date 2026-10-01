import { redirect } from "next/navigation";
import { getLatestExecutiveYear } from "@/app/executives/util";

// Answered per request, so a new committee is where /executives leads the moment it's current.
export const dynamic = "force-dynamic";

/**
 * /executives opens the latest committee, the same page as the navbar's and the home page's
 * links (its tabs lead to every other year since 2016, and each person's profile). A temporary
 * redirect: next year it leads to that committee.
 */
export default async function ExecutivesIndex() {
  redirect(`/executives/${await getLatestExecutiveYear()}`);
}
