import Link from "next/link";
import { rpc, view } from "@/lib/api/session";
import type { eventView } from "@/lib/server/views/admin";
import { ActionForm, PageHeader, Section, StatusBadge } from "@/components/admin/ui";
import { EventPeopleEditor } from "@/components/admin/structured-editors";
import { eventPeopleAction, eventStatusAction, publishEventAction, removeEventMediaAction, updateEventAction } from "../../actions";
import { EventFields } from "../event-form";
import { GalleryUploader } from "../gallery-uploader";
import { Registrations } from "./registrations";
import { AgendaEditor } from "./agenda-editor";
import { CheckInScanner } from "./check-in";
import { duplicateEventAction } from "./event-tools";

type View = Awaited<ReturnType<typeof eventView>>;

export default async function EventDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, cats] = await Promise.all([
    view<View>("views.event", { id }, `/dashboard/events/${id}`),
    rpc<Array<{ slug: string; name: string }>>("categories.list", { kind: "EVENT" }),
  ]);
  const { event: e, people, counts, capabilities: cap, bannerUrl, registrations, gallery, canUploadGallery, sentBack, agenda } = data;
  const status = String(e.status);
  const isPublic = ["PUBLISHED", "ONGOING", "COMPLETED"].includes(status);
  // The save button (and its warning) says what saving does here. Registered people are told
  // automatically when the date, time or place of a live event changes.
  const saveLabel = status === "PENDING_APPROVAL" ? "Save (withdraws the approval request)" : isPublic ? "Save and update the live event" : "Save changes";
  const saveWarning = status === "PENDING_APPROVAL"
    ? "Saving takes it out of the approval queue (reviewers mustn't approve old details). Send it for approval again afterwards. Save now?"
    : undefined;

  return (
    <>
      <PageHeader
        back={{ href: "/dashboard/events", label: "Events" }}
        title={String(e.title)}
        description={`/events/${e.slug}${e.category_name ? ` · ${e.category_name}` : ""}`}
        actions={<><StatusBadge status={status} content />{isPublic && <Link prefetch={false} href={`/events/${e.slug}`} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">View public page</Link>}
          <ActionForm action={duplicateEventAction.bind(null, id)} submitLabel="Duplicate" variant="outline" inline confirm="Make a copy of this event as a new draft (details, speakers, programme and form; you set the new date)?" /></>}
      />

      {sentBack && (
        <p role="status" className="mb-4 rounded-xl border border-amber-400/60 bg-amber-500/10 p-4 text-sm">
          <strong>Changes requested{sentBack.by ? ` by ${sentBack.by}` : ""}:</strong> {sentBack.comment ?? "No note was left."} Edit the details below, then send it for approval again.
        </p>
      )}
      <Section title="Publishing">
        <div className="flex flex-wrap items-center gap-2">
          {!isPublic && status !== "PENDING_APPROVAL" && (cap.publish !== "DENY" || cap.edit) && (
            <ActionForm action={publishEventAction.bind(null, id)} submitLabel={cap.publish === "ALLOW" ? "Publish" : "Submit for approval"} inline />
          )}
          {status === "PENDING_APPROVAL" && <span className="text-sm text-muted-foreground">Waiting for approval.</span>}
          {status === "PUBLISHED" && cap.edit && <ActionForm action={eventStatusAction.bind(null, id, "ONGOING")} submitLabel="Mark ongoing" variant="outline" inline />}
          {(status === "PUBLISHED" || status === "ONGOING") && cap.edit && <ActionForm action={eventStatusAction.bind(null, id, "COMPLETED")} submitLabel="Mark completed" variant="outline" inline />}
          {isPublic && cap.publish === "ALLOW" && <ActionForm action={eventStatusAction.bind(null, id, "DRAFT")} submitLabel="Unpublish" variant="outline" inline confirm="Take this event off the public site?" />}
          {cap.edit && ["DRAFT", "PENDING_APPROVAL", "PUBLISHED", "ONGOING"].includes(status) && (
            <ActionForm action={eventStatusAction.bind(null, id, "CANCELLED")} submitLabel="Cancel event" variant="destructive" inline confirm="Cancel this event? Registered members are notified.">
              <input name="reason" aria-label="Reason" placeholder="Reason (sent to registrants)" className="h-9 w-full min-w-0 rounded-md border bg-background px-2 text-base sm:w-56 md:text-sm" />
            </ActionForm>
          )}
          {cap.delete && <ActionForm action={eventStatusAction.bind(null, id, "ARCHIVED")} submitLabel="Archive" variant="outline" inline redirectTo="/dashboard/events?status=ARCHIVED" confirm="Archive this event? It leaves the site; you can restore it from “Archived”." />}
        </div>
        {cap.publish !== "ALLOW" && <p className="mt-2 text-xs text-muted-foreground">{cap.publishExplanation}</p>}
      </Section>

      {cap.edit ? (
        <Section title="Details" className="mt-6">
          <ActionForm action={updateEventAction.bind(null, id)} submitLabel={saveLabel} confirm={saveWarning}>
            {/* Optimistic locking: refused if someone else saved after this page loaded. */}
            <input type="hidden" name="expectedUpdatedAt" value={String(e.updated_at ?? "")} />
            <EventFields e={e} bannerUrl={bannerUrl} categories={cats.ok ? cats.data : []} />
          </ActionForm>
        </Section>
      ) : (
        <p className="mt-6 text-sm text-muted-foreground">You can view this event but not edit it.</p>
      )}

      {cap.edit && (
        <Section title="Speakers and event team" description="Speakers appear on the event page. Coordinators and photographers linked to a member account can edit this event or upload its photos (their event-scoped permissions). Guests and judges are entered in the details above." className="mt-6">
          <ActionForm action={eventPeopleAction.bind(null, id)} submitLabel="Save people">
            <EventPeopleEditor name="people" initial={people.map((p) => ({ role: p.role, name: p.name, title: p.title ?? undefined, userId: p.user_id, email: p.email }))} />
          </ActionForm>
        </Section>
      )}

      {cap.edit && (
        <Section title="Programme" description="Sessions shown on the public event page, in order." className="mt-6">
          <AgendaEditor eventId={id} initial={agenda ?? []} />
        </Section>
      )}

      <Section title={`Gallery (${gallery.length})`} description="Photos shown on the public event page." className="mt-6">
        {canUploadGallery && <GalleryUploader eventId={id} />}
        {gallery.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No photos yet.</p>
        ) : (
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {gallery.map((g) => (
              <li key={g.id} className="overflow-hidden rounded-lg border bg-card">
                {g.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={g.thumb} alt={g.alt ?? ""} loading="lazy" className="aspect-4/3 w-full object-cover" />
                ) : <div className="flex aspect-4/3 items-center justify-center bg-muted text-xs">{g.name ?? "file"}</div>}
                {g.canRemove && (
                  <div className="p-2">
                    <ActionForm action={removeEventMediaAction.bind(null, id, g.id)} submitLabel="Remove" variant="ghost" inline confirm="Remove this photo from the gallery? It stays in the media library." />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {cap.registrations && (
        <Section title="Registrations" description={`${counts.registered} registered · ${counts.attended ?? 0} attended · ${counts.waitlisted} on the waitlist${e.capacity ? ` · ${e.capacity} seats` : ""}`} className="mt-6"
          actions={registrations.length > 0 ? <a href={`/api/admin/events/${id}/registrations`} className="inline-flex min-h-10 items-center text-sm underline">Download CSV</a> : undefined}>
          {["PUBLISHED", "ONGOING"].includes(status) && <div className="mb-4"><CheckInScanner eventId={id} /></div>}
          <Registrations initial={registrations} />
        </Section>
      )}
    </>
  );
}
