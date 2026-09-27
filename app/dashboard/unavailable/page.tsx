import Link from "next/link";
import { PageHeader } from "@/components/admin/ui";

type SP = Promise<{ from?: string }>;

/** Shown when the API doesn't have what this page needs yet (it's older than the website). */
export default async function Unavailable({ searchParams }: { searchParams: SP }) {
  const { from } = await searchParams;
  const back = from && from.startsWith("/") && !from.startsWith("//") ? from : "/dashboard";
  return (
    <>
      <PageHeader title="Not available yet" description="This page needs the latest version of the club's API." />
      <div className="max-w-xl space-y-3 rounded-xl border bg-card p-5 text-sm">
        <p>The website has been updated, but the API it talks to hasn&apos;t caught up yet. The page will work after the next API release; nothing is lost in the meantime.</p>
        <p className="flex gap-3"><Link href={back} className="underline" prefetch={false}>Try again</Link><Link href="/dashboard" className="underline" prefetch={false}>Dashboard</Link></p>
      </div>
    </>
  );
}
