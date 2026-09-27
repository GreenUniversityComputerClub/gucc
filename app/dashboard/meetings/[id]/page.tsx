import Link from "next/link";
import { requireSignedIn, view } from "@/lib/api/session";
import type { meetingDetail } from "@/lib/server/services/work";
import { ActionForm, Field, PageHeader, Section, StatusBadge } from "@/components/admin/ui";
import { MeetingFields } from "../meeting-fields";
import { cancelMeetingAction, meetingNotesAction, respondMeetingAction, updateMeetingAction } from "../actions";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
const RESPONSE: Record<string, string> = { YES: "Going", NO: "Not going", MAYBE: "Maybe", INVITED: "Not replied" };

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSignedIn(`/dashboard/meetings/${id}`);
  const { meeting: m, participants, role } = await view<Awaited<ReturnType<typeof meetingDetail>>>("meetings.get", { id }, `/dashboard/meetings/${id}`);
  const scheduled = m.status === "SCHEDULED";
  const upcoming = scheduled && (m.ends_at ?? m.starts_at) > new Date().toISOString();
  const others = participants.filter((p) => p.user_id !== m.created_by);
  return (
    <>
      <PageHeader title={m.title} description={`Organised by ${m.organizer}`} actions={<Link href="/dashboard/meetings" className="text-sm underline">All meetings</Link>} />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <Section title="When and where">
            <div className="space-y-2 text-sm">
              <p className="flex flex-wrap items-center gap-2"><StatusBadge status={m.status} /> {when(m.starts_at)}{m.ends_at ? ` – ${new Date(m.ends_at).toLocaleTimeString("en-GB", { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit" })}` : ""}</p>
              {m.location && <p>Place: {m.location}</p>}
              {m.meet_url && <p>Google Meet: <a href={m.meet_url} target="_blank" rel="noopener noreferrer" className="underline">{m.meet_url.replace("https://", "")}</a></p>}
            </div>
            {upcoming && role.participant && m.created_by !== session.user.id && (
              <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">Your reply: {RESPONSE[m.my_response ?? "INVITED"]}</span>
                {(["YES", "MAYBE", "NO"] as const).filter((r) => r !== m.my_response).map((r) => (
                  <ActionForm key={r} action={respondMeetingAction.bind(null, m.id, r)} submitLabel={RESPONSE[r]} successMessage="Reply saved." variant="outline" inline />
                ))}
              </div>
            )}
          </Section>
          <Section title="Agenda">
            <p className="whitespace-pre-wrap text-sm">{m.agenda || <span className="text-muted-foreground">No agenda yet.</span>}</p>
          </Section>
          <Section title="Notes">
            {role.canEdit ? (
              <ActionForm action={meetingNotesAction.bind(null, m.id)} submitLabel="Save notes">
                <Field name="notes" label="Notes and decisions" type="textarea" rows={8} defaultValue={m.notes} />
              </ActionForm>
            ) : <p className="whitespace-pre-wrap text-sm">{m.notes || <span className="text-muted-foreground">No notes yet.</span>}</p>}
          </Section>
          {role.canEdit && scheduled && (
            <Section title="Change the meeting" description="Participants are told about a new time, place or link, and newly invited people get an invitation.">
              <ActionForm action={updateMeetingAction.bind(null, m.id)}>
                <MeetingFields m={m} participants={others.map((p) => ({ userId: p.user_id, name: p.name ?? "Member" }))} />
              </ActionForm>
            </Section>
          )}
        </div>
        <div className="space-y-6">
          <Section title={`Participants (${participants.length})`}>
            <ul className="space-y-1.5 text-sm">
              {participants.map((p) => (
                <li key={p.user_id} className="flex justify-between gap-2">
                  <span className="min-w-0 truncate">{p.name}{p.user_id === m.created_by ? " (organiser)" : ""}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{p.user_id === m.created_by ? "" : RESPONSE[p.response]}</span>
                </li>
              ))}
            </ul>
          </Section>
          {role.canEdit && scheduled && (
            <Section title="Cancel">
              <ActionForm action={cancelMeetingAction.bind(null, m.id)} submitLabel="Cancel meeting" variant="destructive" confirm="Cancel this meeting? Participants are told.">
                <Field name="reason" label="Reason (optional)" />
              </ActionForm>
            </Section>
          )}
        </div>
      </div>
    </>
  );
}
