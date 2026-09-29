import Link from "next/link";
import { requireSignedIn, view } from "@/lib/api/session";
import type { listReports } from "@/lib/server/services/messaging";
import { ActionForm, EmptyState, Field, PageHeader } from "@/components/admin/ui";
import { liftRestrictionAction, resolveReportAction } from "../chat/actions";
import { dhakaDateTime, relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";

type Reports = Awaited<ReturnType<typeof listReports>>;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  // The API decides who may see this (moderators of chat or lost & found).
  await requireSignedIn("/dashboard/reports");
  const sp = await searchParams;
  const status = ["OPEN", "DISMISSED", "ACTIONED"].includes(sp.status ?? "") ? sp.status! : "OPEN";
  const rows = await view<Reports>("reports.list", { status }, "/dashboard/reports");
  return (
    <>
      <PageHeader title="Reports" description="Messages and lost & found posts that members reported, oldest first. You see only the reported item (and the two messages before it when the reporter shared them), never the rest of a conversation. Reporters and senders are told the outcome." />
      <nav aria-label="Status" className="mb-4 flex flex-wrap gap-2 text-sm">
        {[["OPEN", "Open"], ["ACTIONED", "Acted on"], ["DISMISSED", "Dismissed"]].map(([k, label]) => (
          <Link key={k} prefetch={false} href={`/dashboard/reports?status=${k}`} aria-current={status === k ? "page" : undefined}
            className={cn("inline-flex min-h-10 items-center rounded-full border px-4", status === k ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>{label}</Link>
        ))}
      </nav>
      {rows.length === 0 ? <EmptyState>{status === "OPEN" ? "No open reports. Nice." : "No reports here."}</EmptyState> : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {r.categoryLabel && <span className="rounded-full bg-destructive/10 px-2 py-0.5 font-medium text-destructive">{r.categoryLabel}</span>}
                <span>{r.resource_type === "message" ? "Message" : "Lost & found post"}</span>
                <span>· reported by {r.reporter}</span>
                <span>· <time dateTime={r.created_at} title={dhakaDateTime(r.created_at)}>{relativeTime(r.created_at)}</time></span>
                {r.others > 0 && <span>· {r.others} more report{r.others === 1 ? "" : "s"} of the same item</span>}
              </div>
              <p className="mt-2 text-sm"><strong>Reason:</strong> {r.reason}</p>
              <blockquote className="mt-2 rounded-md border-l-4 bg-muted/50 p-3 text-sm">
                {r.resource_type === "message"
                  ? <><span className="block text-xs text-muted-foreground">{r.sender} wrote (as reported):</span><span className="whitespace-pre-line break-words">{r.body}</span></>
                  : <><span className="block">{r.post_title}</span>{r.body && <span className="mt-1 block whitespace-pre-line break-words text-xs text-muted-foreground">As reported: {r.body}</span>}</>}
              </blockquote>
              {r.resource_type === "message" && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {r.sender}: {r.sender_actioned ? `${r.sender_actioned} earlier report${r.sender_actioned === 1 ? "" : "s"} acted on` : "no earlier reports acted on"}
                  {r.sender_restricted_until && <> · messaging paused until {dhakaDateTime(r.sender_restricted_until)}</>}
                </p>
              )}
              {status !== "OPEN" && r.note && <p className="mt-2 text-xs text-muted-foreground">Moderator note: {r.note}</p>}
              {status === "OPEN" && (
                <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                  <details className="rounded-lg border p-3 open:bg-muted/30">
                    <summary className="cursor-pointer text-sm font-medium">Remove it…</summary>
                    <ActionForm action={resolveReportAction.bind(null, r.id, "ACTIONED", true)} submitLabel="Remove and close" variant="destructive" className="mt-3"
                      confirm={r.resource_type === "message" ? "Remove this message for both people and close the report?" : "Remove this post and close the report?"}>
                      {r.resource_type === "message" && (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Field name="warn" label="Warn the sender (they get a notice)" type="checkbox" />
                          <Field name="restrictDays" label="Pause their messaging" type="select" defaultValue=""
                            options={[{ value: "", label: "No pause" }, { value: "1", label: "1 day" }, { value: "7", label: "7 days" }, { value: "30", label: "30 days" }]} />
                        </div>
                      )}
                      <Field name="note" label="Note (optional; included in the sender's notice)" />
                    </ActionForm>
                  </details>
                  <div className="flex flex-wrap items-start gap-2">
                    <ActionForm action={resolveReportAction.bind(null, r.id, "DISMISSED", false)} submitLabel="Dismiss (no rule broken)" variant="outline" inline />
                    {r.sender_id && r.sender_restricted_until && <ActionForm action={liftRestrictionAction.bind(null, r.sender_id)} submitLabel="Lift messaging pause" variant="outline" inline />}
                    {r.sender_id && <Link prefetch={false} href={`/dashboard/access/${encodeURIComponent(r.sender_id)}`} className="inline-flex min-h-10 items-center text-sm underline">Sender&apos;s account</Link>}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
