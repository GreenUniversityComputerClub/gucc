import { CalendarDays, Link2, MapPin } from "lucide-react";
import { requireSignedIn, view } from "@/lib/api/session";
import { ActionForm, Field, PageHeader, Section } from "@/components/admin/ui";
import { PersonAvatar } from "@/components/person-avatar";
import { MeetingFields } from "../meeting-fields";
import { cancelMeetingAction, meetingNotesAction, updateMeetingAction, type MeetingDetail } from "../actions";
import { MeetingLive } from "./meeting-live";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit" });
const RESPONSE: Record<string, string> = { YES: "Going", NO: "Not going", MAYBE: "Maybe", INVITED: "Not replied" };

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSignedIn(`/dashboard/meetings/${id}`);
  const data = await view<MeetingDetail>("meetings.get", { id }, `/dashboard/meetings/${id}`);
  const { meeting: m, participants, role } = data;
  const editable = m.status === "SCHEDULED" && !m.over;
  const others = participants.filter((p) => p.user_id !== m.created_by);
  const link = m.meet_url ?? m.join_url;
  return (
    <>
      <PageHeader back={{ href: "/dashboard/meetings", label: "Meetings" }} title={m.title} description={`Organised by ${m.organizer}${m.series_id ? " · part of a weekly series" : ""}`} />
      <div className="mb-6 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <span className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden />{when(m.starts_at)}{m.ends_at ? ` – ${time(m.ends_at)}` : ""}</span>
        {m.location && <span className="inline-flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" aria-hidden />{m.location}</span>}
        {link && <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 underline"><Link2 className="h-4 w-4 text-muted-foreground" aria-hidden />{link.replace(/^https:\/\//, "").slice(0, 60)}</a>}
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <MeetingLive initial={data} meId={session.user.id} />
          <Section title="Minutes and decisions">
            {role.canEdit ? (
              <ActionForm action={meetingNotesAction.bind(null, m.id)} submitLabel="Save">
                <Field name="notes" label="Minutes" type="textarea" rows={8} defaultValue={m.notes} />
                <Field name="decisions" label="Decisions (one per line)" type="textarea" rows={3} defaultValue={m.decisions.join("\n")} />
              </ActionForm>
            ) : (
              <div className="space-y-3 text-sm">
                <p className="whitespace-pre-wrap">{m.notes || <span className="text-muted-foreground">No minutes yet.</span>}</p>
                {m.decisions.length > 0 && (
                  <div><h3 className="mb-1 font-medium">Decisions</h3><ul className="list-disc space-y-1 pl-5">{m.decisions.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
                )}
              </div>
            )}
          </Section>
          {role.canEdit && editable && (
            <Section title="Change the meeting" description="Participants are told about a new time, place or link, and newly invited people get an invitation.">
              <ActionForm action={updateMeetingAction.bind(null, m.id)}>
                <MeetingFields m={m} participants={others.map((p) => ({ userId: p.user_id, name: p.name ?? "Member" }))} />
              </ActionForm>
            </Section>
          )}
        </div>
        <div className="space-y-6">
          <Section title={`Participants (${participants.length})`}>
            <ul className="space-y-2 text-sm">
              {participants.map((p) => (
                <li key={p.user_id} className="flex items-center justify-between gap-2">
                  <PersonAvatar name={p.name} url={p.avatarUrl} size="xs" />
                  <span className="min-w-0 flex-1 truncate">{p.name}{p.user_id === m.created_by ? " (organiser)" : ""}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{p.attended ? "Came" : p.user_id === m.created_by ? "" : RESPONSE[p.response]}</span>
                </li>
              ))}
            </ul>
          </Section>
          {role.canEdit && editable && (
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
