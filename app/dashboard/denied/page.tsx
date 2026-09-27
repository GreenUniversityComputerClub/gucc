import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/admin/ui";

export default function Denied() {
  return (
    <>
      <PageHeader title="No access" />
      <EmptyState>
        <p>Your current role and position don&apos;t include access to that page.</p>
        <p className="mt-2">If you need it for your work, ask the President, General Secretary or a Moderator to assign the permission.</p>
        <Link prefetch={false} href="/dashboard" className="mt-4 inline-block underline">Back to the dashboard</Link>
      </EmptyState>
    </>
  );
}
