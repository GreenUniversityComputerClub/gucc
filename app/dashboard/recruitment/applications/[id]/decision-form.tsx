"use client";

import { useState } from "react";
import { ActionForm } from "@/components/admin/ui";
import { decisionEmail } from "@/lib/recruitment/decision-emails";
import { cn } from "@/lib/utils";
import { reviewApplicationAction } from "../../../actions";

const CHOICES: Array<{ status: string; label: string; hint: string }> = [
  { status: "SHORTLISTED", label: "Shortlist", hint: "Worth a closer look" },
  { status: "INTERVIEW", label: "Invite to interview", hint: "Meet them next" },
  { status: "ACCEPTED", label: "Accept", hint: "They join the team" },
  { status: "REJECTED", label: "Reject", hint: "Not this time" },
];

/**
 * One decision at a time: pick the outcome, optionally email the applicant (the exact email is
 * previewed), leave a note for the other reviewers, then save once.
 */
export function DecisionForm({ id, current, applicant }: { id: string; current: string; applicant: { fullName: string; email: string; campaignTitle: string; positionName: string } }) {
  const [status, setStatus] = useState(CHOICES.some((c) => c.status === current) ? current : "");
  const [notify, setNotify] = useState(false);
  const email = status ? decisionEmail(status, applicant) : null;
  const chosen = CHOICES.find((c) => c.status === status);
  return (
    <ActionForm action={reviewApplicationAction.bind(null, id)} submitLabel={chosen ? `Save: ${chosen.label.toLowerCase()}` : "Save decision"}
      variant={status === "REJECTED" ? "destructive" : "default"}
      confirm={status === "REJECTED" ? `Reject ${applicant.fullName}'s application?${notify ? " They will be emailed." : ""}` : undefined}>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Outcome</legend>
        {CHOICES.map((c) => (
          <label key={c.status} className={cn("flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm hover:bg-muted", status === c.status && "border-primary bg-primary/5")}>
            <input type="radio" name="status" value={c.status} checked={status === c.status} onChange={() => setStatus(c.status)} className="h-4 w-4" required />
            <span className="min-w-0 flex-1"><span className="font-medium">{c.label}</span><span className="block text-xs text-muted-foreground">{c.hint}</span></span>
            {current === c.status && <span className="text-xs text-muted-foreground">current</span>}
          </label>
        ))}
      </fieldset>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Note for reviewers <span className="font-normal text-muted-foreground">(optional)</span></span>
        <textarea name="note" rows={2} placeholder="Why, in a line. Only reviewers see it." className="w-full rounded-md border bg-background p-2 text-base md:text-sm" />
      </label>
      <label className="flex min-h-11 items-center gap-2 text-sm md:min-h-9">
        <input type="checkbox" name="notify" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="h-4 w-4" /> Email the applicant ({applicant.email})
      </label>
      {notify && (
        email ? (
          <div className="rounded-md border bg-muted/50 p-3 text-xs" aria-live="polite">
            <p className="font-medium">Subject: {email.subject}</p>
            <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{email.text}</p>
            <p className="mt-2 text-muted-foreground">If email isn&apos;t available, the result tells you and nothing is sent.</p>
          </div>
        ) : <p className="text-xs text-muted-foreground">Choose an outcome to see the email.</p>
      )}
    </ActionForm>
  );
}
