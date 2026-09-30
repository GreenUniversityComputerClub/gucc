"use client";

import { useState } from "react";
import { ActionForm, Field } from "@/components/admin/ui";
import { PersonPicker } from "@/components/admin/person-picker";
import { createTaskAction } from "./actions";

/** New task: for a member with an account, or for an email address (someone without one yet). */
export function NewTaskForm({ emailEnabled, templates = [] }: { emailEnabled: boolean; templates?: Array<{ id: string; title: string }> }) {
  const [to, setTo] = useState<"member" | "email">("member");
  return (
    <ActionForm action={createTaskAction} submitLabel="Assign task" resetOnSuccess>
      <input type="hidden" name="assignTo" value={to} />
      {templates.length > 0 && (
        <Field name="templateId" label="Start from a template (optional)" type="select" className="max-w-md"
          options={[{ value: "", label: "No template" }, ...templates.map((t) => ({ value: t.id, label: t.title }))]}
          hint="The template fills in whatever you leave empty below, and adds its checklist." />
      )}
      <div className="grid gap-3 md:grid-cols-3">
        <Field name="title" label="Task" required={templates.length === 0} className="md:col-span-2" placeholder="e.g. Book the seminar hall for the workshop" />
        <Field name="dueAt" label="Due (Dhaka time)" type="datetime-local" />
      </div>
      <Field name="details" label="Details (optional)" type="textarea" rows={3} />
      <div className="grid gap-3 md:grid-cols-2">
        <Field name="checklist" label="Checklist (optional)" type="textarea" rows={3} placeholder={"One step per line, e.g.\nBook the hall\nPrint posters"} />
        <Field name="labels" label="Labels (optional)" placeholder="e.g. posters, urgent" hint="Separate with commas; up to 6." />
      </div>
      <fieldset className="min-w-0 space-y-2">
        <legend className="text-sm font-medium">For</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="radio" name="_to" checked={to === "member"} onChange={() => setTo("member")} className="h-4 w-4" /> A member</label>
          <label className="flex items-center gap-2"><input type="radio" name="_to" checked={to === "email"} onChange={() => setTo("email")} className="h-4 w-4" /> Someone without an account (email)</label>
        </div>
        {to === "member" ? (
          <PersonPicker name="assigneeUserId" label="Member" valueKind="user" withAccount />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            <Field name="assigneeEmail" label="Email address" type="email" required />
            <Field name="assigneeName" label="Name (optional)" />
            <p className="text-xs text-muted-foreground md:col-span-2">
              {emailEnabled
                ? "They'll get an email now. The task moves to their dashboard once they have an approved account with this address."
                : "Email isn't set up, so nobody is emailed: tell them yourself. The task moves to their dashboard once they have an approved account with this address."}
            </p>
          </div>
        )}
      </fieldset>
      <Field name="priority" label="Priority" type="select" defaultValue="NORMAL" className="max-w-xs"
        options={[{ value: "LOW", label: "Low" }, { value: "NORMAL", label: "Normal" }, { value: "HIGH", label: "High" }]} />
    </ActionForm>
  );
}
