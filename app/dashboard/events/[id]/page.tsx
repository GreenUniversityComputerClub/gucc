import Link from "next/link";
import { rpc, view } from "@/lib/api/session";
import type { eventView } from "@/lib/server/views/admin";
import { ActionForm, EmptyState, PageHeader, Section, StatusBadge } from "@/components/admin/ui";
import { EventPeopleEditor } from "@/components/admin/structured-editors";
import { eventPeopleAction, eventStatusAction, publishEventAction, registrationStatusAction, removeEventMediaAction, updateEventAction } from "../../actions";
import { EventFields } from "../event-form";
import { GalleryUploader } from "../gallery-uploader";

type View = Awaited<ReturnType<typeof eventView>>;

export default async function EventDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, cats] = await Promise.all([
    view<View>("views.event", { id }, `/dashboard/events/${id}`),
    rpc<Array<{ slug: string; name: string }>>("categories.list", { kind: "EVENT" }),
  ]);
  const { event: e, people, counts, capabilities: cap, bannerUrl, registrations, gallery, canUploadGallery } = data;
  const status = String(e.status);
  const isPublic = ["PUBLISHED", "ONGOING", "COMPLETED"].includes(status);

  return (
    <>
      <PageHeader
        title={String(e.title)}
        description={`/events/${e.slug}${e.category_name ? ` · ${e.category_name}` : ""}`}
        actions={<><StatusBadge status={status} />{isPublic && <Link prefetch={false} href={`/events/${e.slug}`} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">View public page</Link>}</>}
      />

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
          {cap.delete && <ActionForm action={eventStatusAction.bind(null, id, "ARCHIVED")} submitLabel="Archive" variant="outline" inline confirm="Archive this event? It disappears from the site but stays in history." />}
        </div>
        {cap.publish !== "ALLOW" && <p className="mt-2 text-xs text-muted-foreground">{cap.publishExplanation}</p>}
      </Section>

      {cap.edit ? (
        <Section title="Details" className="mt-6">
          <ActionForm action={updateEventAction.bind(null, id)} submitLabel="Save changes">
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
                {(cap.edit || canUploadGallery) && (
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
        <Section title={`Registrations · ${counts.registered} registered, ${counts.waitlisted} waitlisted`} className="mt-6">
          {registrations.length === 0 ? <EmptyState>No registrations yet.</EmptyState> : (
            <>
              <a href={`/api/admin/events/${id}/registrations`} className="text-sm underline">Download CSV</a>
              <ul className="mt-3 divide-y text-sm">
                {registrations.map((r) => (
                  <li key={r.id} className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-medium">{r.name} <StatusBadge status={r.status} /></p>
                      <p className="truncate text-xs text-muted-foreground">{[r.email, r.student_id].filter(Boolean).join(" · ")}</p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {r.status !== "ATTENDED" && <ActionForm action={registrationStatusAction.bind(null, r.id, "ATTENDED")} submitLabel="Attended" variant="outline" inline />}
                      {r.status === "WAITLISTED" && <ActionForm action={registrationStatusAction.bind(null, r.id, "REGISTERED")} submitLabel="Admit" variant="outline" inline />}
                      {r.status !== "CANCELLED" && <ActionForm action={registrationStatusAction.bind(null, r.id, "CANCELLED")} submitLabel="Cancel" variant="outline" inline />}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Section>
      )}
    </>
  );
}
