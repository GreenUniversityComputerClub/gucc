import Link from "next/link";
import { requireSignedIn, view } from "@/lib/api/session";
import type { listReports } from "@/lib/server/services/messaging";
import { ActionForm, EmptyState, Field, PageHeader } from "@/components/admin/ui";
import { resolveReportAction } from "../chat/actions";
import { cn } from "@/lib/utils";

type Reports = Awaited<ReturnType<typeof listReports>>;
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short" });

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  // The API decides who may see this (moderators of chat or lost & found).
  await requireSignedIn("/dashboard/reports");
  const sp = await searchParams;
  const status = ["OPEN", "DISMISSED", "ACTIONED"].includes(sp.status ?? "") ? sp.status! : "OPEN";
  const rows = await view<Reports>("reports.list", { status }, "/dashboard/reports");
  return (
    <>
      <PageHeader title="Reports" description="Messages and lost & found posts that members reported. You see only the reported item, never the rest of a conversation." />
      <nav aria-label="Status" className="mb-4 flex gap-2 text-sm">
        {[["OPEN", "Open"], ["ACTIONED", "Removed"], ["DISMISSED", "Dismissed"]].map(([k, label]) => (
          <Link key={k} prefetch={false} href={`/dashboard/reports?status=${k}`} className={cn("rounded-full border px-3 py-1", status === k && "bg-primary text-primary-foreground")}>{label}</Link>
        ))}
      </nav>
      {rows.length === 0 ? <EmptyState>No reports here.</EmptyState> : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">{r.resource_type === "message" ? "Message" : "Lost & found post"} · reported by {r.reporter} · {when(r.created_at)}</p>
              <p className="mt-1 text-sm"><strong>Reason:</strong> {r.reason}</p>
              <blockquote className="mt-2 whitespace-pre-wrap rounded-md border-l-4 bg-muted/50 p-3 text-sm">
                {r.resource_type === "message"
                  ? <><span className="block text-xs text-muted-foreground">{r.sender} wrote (as reported):</span><span className="whitespace-pre-line break-words">{r.body}</span></>
                  : <><span className="block">{r.post_title}</span>{r.body && <span className="mt-1 block whitespace-pre-line break-words text-xs text-muted-foreground">As reported: {r.body}</span>}</>}
              </blockquote>
              {status === "OPEN" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <ActionForm action={resolveReportAction.bind(null, r.id, "ACTIONED", true)} submitLabel="Remove it" variant="destructive" inline confirm="Remove this and close the report?">
                    <Field name="note" label="Note (optional)" />
                  </ActionForm>
                  <ActionForm action={resolveReportAction.bind(null, r.id, "DISMISSED", false)} submitLabel="Dismiss" variant="outline" inline />
                  {r.sender_id && <Link prefetch={false} href={`/dashboard/access/${encodeURIComponent(r.sender_id)}`} className="self-center text-sm underline">Sender&apos;s account</Link>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
