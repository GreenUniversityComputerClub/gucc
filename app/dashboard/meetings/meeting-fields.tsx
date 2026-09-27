import { Field } from "@/components/admin/ui";
import { PeopleMultiPicker, type Chosen } from "@/components/admin/people-multi-picker";
import type { MeetingRow } from "@/lib/server/services/work";

const local = (iso: string | null | undefined) => (iso ? new Date(new Date(iso).getTime() + 6 * 3600_000).toISOString().slice(0, 16) : "");

/** Shared fields for scheduling and editing a meeting. Times are Dhaka time. */
export function MeetingFields({ m, participants = [] }: { m?: MeetingRow; participants?: Chosen[] }) {
  return (
    <>
      <Field name="title" label="Title" defaultValue={m?.title} required placeholder="e.g. Executive committee meeting" />
      <div className="grid gap-3 md:grid-cols-2">
        <Field name="startsAt" label="Starts (Dhaka time)" type="datetime-local" defaultValue={local(m?.starts_at)} required />
        <Field name="endsAt" label="Ends (optional)" type="datetime-local" defaultValue={local(m?.ends_at)} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field name="meetUrl" label="Google Meet link (optional)" defaultValue={m?.meet_url} placeholder="https://meet.google.com/abc-defg-hij"
          hint="Create the meeting in Google Calendar or Meet, then paste its link here." />
        <Field name="location" label="Place (optional)" defaultValue={m?.location} placeholder="e.g. Room 402, A Building" />
      </div>
      <Field name="agenda" label="Agenda (optional)" type="textarea" rows={4} defaultValue={m?.agenda} />
      <PeopleMultiPicker name="participants" label="Participants" initial={participants} hint="Only members with an approved account can be invited." />
      <Field name="allExecutives" label="Also invite everyone on the current committee" type="checkbox" />
    </>
  );
}
