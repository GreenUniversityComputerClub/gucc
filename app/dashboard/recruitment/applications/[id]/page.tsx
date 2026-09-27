import Link from "next/link";
import { Fragment } from "react";
import { view } from "@/lib/api/session";
import type { getApplication } from "@/lib/server/services/recruitment";
import { ActionForm, PageHeader, Section, StatusBadge } from "@/components/admin/ui";
import { addApplicationNoteAction, assignReviewerAction, reviewApplicationAction } from "../../../actions";

export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { application: a, documents, notes, reviewers } = await view<Awaited<ReturnType<typeof getApplication>>>("recruitment.application", { id }, `/dashboard/recruitment/applications/${id}`);
  const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const v = (k: string) => (a[k] === null || a[k] === undefined ? "—" : String(a[k]));
  const rows: Array<[string, string]> = [
    ["Position", v("position_name")], ["Student ID", v("student_id")], ["Email", v("email")], ["Phone", v("phone")], ["Gender", v("gender")],
    ["Semester", v("semester")], ["Batch", v("batch")], ["CGPA", v("cgpa")], ["Completed credits", v("completed_credit")],
    ["Submitted", new Date(String(a.created_at)).toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })],
  ];
  const statuses: Array<[string, string, "default" | "outline" | "destructive"]> = [["SHORTLISTED", "Shortlist", "default"], ["INTERVIEW", "Invite to interview", "outline"], ["ACCEPTED", "Accept", "default"], ["REJECTED", "Reject", "destructive"]];
  return (
    <>
      <PageHeader title={v("full_name")} description={`${v("campaign_title")} · reference ${id.slice(4, 12).toUpperCase()}`} actions={<><StatusBadge status={v("status")} /><Link prefetch={false} href={`/dashboard/recruitment/${String(a.campaign_id)}`} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">All applications</Link></>} />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <Section title="Application">
            <dl className="grid grid-cols-[9rem_1fr] gap-y-2 text-sm">{rows.map(([k, val]) => <Fragment key={k}><dt className="text-muted-foreground">{k}</dt><dd className="break-words">{val}</dd></Fragment>)}</dl>
            {a.club_work ? <div className="mt-4"><p className="text-sm font-medium">Club work / experience</p><p className="mt-1 whitespace-pre-wrap text-sm">{String(a.club_work)}</p></div> : null}
          </Section>
          <Section title="Documents" description="Private files. Links are signed and expire in 15 minutes; reload the page for fresh links.">
            <div className="grid gap-4 sm:grid-cols-3">
              {documents.photo && (
                <a href={documents.photo} target="_blank" rel="noreferrer" className="block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={documents.photo} alt="Applicant photo" className="aspect-square w-full rounded-lg border object-cover" />
                  <span className="mt-1 block text-xs underline">Photo</span>
                </a>
              )}
              {documents.idCard && (
                <a href={documents.idCard} target="_blank" rel="noreferrer" className="block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={documents.idCard} alt="Student ID card" className="aspect-square w-full rounded-lg border object-contain" />
                  <span className="mt-1 block text-xs underline">Student ID card</span>
                </a>
              )}
              {documents.cv && <a href={documents.cv} target="_blank" rel="noreferrer" className="flex aspect-square items-center justify-center rounded-lg border bg-muted text-sm underline">Open CV (PDF)</a>}
            </div>
          </Section>
        </div>
        <div className="space-y-6">
        <Section title="Reviewer">
          <ActionForm action={assignReviewerAction.bind(null, id)} submitLabel="Save">
            <label className="grid gap-1 text-sm">
              <span className="sr-only">Assigned reviewer</span>
              <select name="reviewerId" defaultValue={a.assigned_to ? String(a.assigned_to) : ""} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                <option value="">Nobody assigned</option>
                {reviewers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </label>
          </ActionForm>
        </Section>
        <Section title="Notes" description="Only reviewers see these.">
          {notes.length > 0 ? (
            <ul className="mb-3 space-y-2 text-sm">
              {notes.map((n) => <li key={n.id} className="rounded-md bg-muted p-2"><p className="whitespace-pre-wrap">{n.body}</p><p className="mt-1 text-xs text-muted-foreground">{n.author ?? "Someone"} · {when(n.created_at)}</p></li>)}
            </ul>
          ) : a.reviewer_note ? <p className="mb-3 rounded-md bg-muted p-2 text-xs">Note: {String(a.reviewer_note)}</p> : null}
          <ActionForm action={addApplicationNoteAction.bind(null, id)} submitLabel="Add note" resetOnSuccess>
            <textarea name="note" rows={2} required placeholder="e.g. Strong programming background; interview on Sunday" aria-label="New note" className="w-full rounded-md border bg-background p-2 text-sm" />
          </ActionForm>
        </Section>
        <Section title="Decision">
          <div className="space-y-4">
            {statuses.map(([status, label, variant]) => (
              <ActionForm key={status} action={reviewApplicationAction.bind(null, id, status)} submitLabel={label} variant={variant} confirm={status === "REJECTED" ? "Reject this application?" : undefined}>
                <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="notify" /> Email the applicant</label>
                <textarea name="note" rows={1} placeholder="Note for reviewers (optional)" aria-label={`Note with ${label.toLowerCase()}`} className="w-full rounded-md border bg-background p-2 text-sm" />
              </ActionForm>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">If email isn&apos;t available, the result tells you and the applicant isn&apos;t emailed.</p>
        </Section>
        </div>
      </div>
    </>
  );
}
