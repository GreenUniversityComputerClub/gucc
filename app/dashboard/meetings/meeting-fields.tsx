import { Field } from "@/components/admin/ui";
import { PeopleMultiPicker, type Chosen } from "@/components/admin/people-multi-picker";
import type { MeetingRow } from "@/lib/server/services/work";
import { ConflictHint } from "./conflict-hint";

const local = (iso: string | null | undefined) => (iso ? new Date(new Date(iso).getTime() + 6 * 3600_000).toISOString().slice(0, 16) : "");

/** Shared fields for scheduling and editing a meeting. Times are Dhaka time. */
export function MeetingFields({ m, participants = [] }: { m?: MeetingRow; participants?: Chosen[] }) {
  return (
    <>
      {m && <input type="hidden" name="expectedUpdatedAt" value={m.updated_at} />}
      <Field name="title" label="Title" defaultValue={m?.title} required placeholder="e.g. Executive committee meeting" />
      <div className="grid gap-3 md:grid-cols-2">
        <Field name="startsAt" label="Starts (Dhaka time)" type="datetime-local" defaultValue={local(m?.starts_at)} required />
        <Field name="endsAt" label="Ends (optional)" type="datetime-local" defaultValue={local(m?.ends_at)} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field name="meetUrl" label="Meeting link (optional)" defaultValue={m?.meet_url ?? m?.join_url} placeholder="https://meet.google.com/abc-defg-hij"
          hint="Google Meet, Zoom, Teams or any https link. Create the room there first, then paste its link." />
        <Field name="location" label="Place (optional)" defaultValue={m?.location} placeholder="e.g. Room 402, A Building" />
      </div>
      {m ? (
        <Field name="agenda" label="Agenda notes (optional)" type="textarea" rows={3} defaultValue={m.agenda} />
      ) : (
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem]">
          <Field name="agendaItems" label="Agenda (optional)" type="textarea" rows={3} placeholder={"One item per line, e.g.\nUpdates from each team\nBudget for the fair"} />
          <Field name="repeatWeeks" label="Repeat" type="select" defaultValue="1"
            options={[{ value: "1", label: "Doesn't repeat" }, ...[2, 3, 4, 6, 8, 12].map((n) => ({ value: String(n), label: `Weekly, ${n} times` }))]} />
        </div>
      )}
      <PeopleMultiPicker name="participants" label="Participants" initial={participants} hint="Only members with an approved account can be invited." />
      <Field name="allExecutives" label="Also invite everyone on the current committee" type="checkbox" />
      <ConflictHint exceptId={m?.id} />
    </>
  );
}
