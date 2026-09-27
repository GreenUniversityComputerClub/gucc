import { requireSignedIn } from "@/lib/api/session";
import { PageHeader } from "@/components/admin/ui";
import { ConfirmThenGo } from "./confirm-then-go";

type SP = Promise<{ next?: string; back?: string }>;
/** Only paths on this site. */
const local = (v: string | undefined, fallback: string) => (v && v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : fallback);

/** "Confirm it's you" before a sensitive download (exports), then continue to it. */
export default async function ConfirmPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  await requireSignedIn("/dashboard/confirm");
  return (
    <>
      <PageHeader title="Confirm it's you" description="Exports contain members' personal details, so they need your password (or a two-factor code) from the last few minutes." />
      <div className="max-w-lg rounded-xl border bg-card p-5">
        <ConfirmThenGo next={local(sp.next, "/dashboard")} back={local(sp.back, "/dashboard")} />
      </div>
    </>
  );
}
