import Link from "next/link";
import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { getLatestExecutiveYear } from "@/app/executives/util";

// Answered per request, so a new committee is where /executives leads the moment it's current.
export const dynamic = "force-dynamic";

/**
 * /executives opens the latest committee, the same page as the navbar's and the home page's
 * links (its tabs lead to every other year since 2016, and each person's profile). A temporary
 * redirect: next year it leads to that committee.
 */
export default async function ExecutivesIndex() {
  const year = await getLatestExecutiveYear();
  if (year) redirect(`/executives/${year}`);
  // Before any committee is published there is nowhere to send people: say so.
  return (
    <div className="container flex flex-col items-center px-4 py-24 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Users className="h-7 w-7" aria-hidden />
      </span>
      <h1 className="mt-6 font-display text-3xl font-bold tracking-tight">No committee published yet</h1>
      <p className="mt-3 max-w-md text-muted-foreground">The executive committee will appear here as soon as it is published.</p>
      <Link href="/" className="mt-8 inline-flex min-h-11 items-center rounded-full border border-border px-6 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        Back to home
      </Link>
    </div>
  );
}
