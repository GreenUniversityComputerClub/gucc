import { Field, FormSection } from "@/components/admin/ui";
import { MediaField } from "@/components/admin/media-field";
import { MarkdownEditor } from "@/components/admin/markdown-editor";
import { RegistrationFieldsEditor, type RegFieldRow } from "@/components/admin/structured-editors";
import { dhakaLocalInput } from "@/lib/time";

/** Stored instants → the value a datetime-local input expects, in Dhaka time (UTC+6, no DST). */
const dt = (v: unknown) => (typeof v === "string" && v.length === 10 ? `${v}T00:00` : dhakaLocalInput(typeof v === "string" ? v : null));

/**
 * Shared fields for creating and editing an event, in steps: the basics, date and place, the
 * banner, the description (with formatting and a preview), guests, registration, and the rest.
 * Times are entered in local (Dhaka) time.
 */
export function EventFields({ e, bannerUrl, categories = [] }: { e?: Record<string, unknown>; bannerUrl?: string | null; categories?: Array<{ slug: string; name: string }> }) {
  const v = (k: string) => (e?.[k] as string | number | null | undefined) ?? null;
  let fields: RegFieldRow[] = [];
  try {
    fields = JSON.parse(String(v("registration_fields_json") ?? "[]"));
  } catch {
    fields = [];
  }
  return (
    <div className="space-y-5">
      <FormSection title="Basics" description="What the event is called, what kind it is, and who runs it.">
        <div className="grid gap-4 md:grid-cols-2">
          <Field name="title" label="Title" defaultValue={v("title")} required placeholder="e.g. Intro to Machine Learning Workshop" className="md:col-span-2" />
          <Field name="category" label="Category" defaultValue={v("category_name")} list="event-categories" placeholder="Workshop, Contest, Sports…" hint="The category decides which positions may manage the event." />
          <datalist id="event-categories">{categories.map((c) => <option key={c.slug} value={c.name} />)}</datalist>
          <Field name="organizer" label="Organizer" defaultValue={v("organizer") ?? "GUCC"} />
        </div>
      </FormSection>

      <FormSection title="Date and place" description="Times are in Dhaka time.">
        <div className="grid gap-4 md:grid-cols-2">
          <Field name="startAt" label="Starts (Dhaka time)" type="datetime-local" defaultValue={dt(v("start_at"))} required />
          <Field name="endAt" label="Ends" type="datetime-local" defaultValue={dt(v("end_at"))} />
          <Field name="timeText" label="Schedule text" defaultValue={v("time_text")} placeholder="7:00 PM - 9:00 PM" hint="Optional: shown instead of the times, e.g. for several sessions." />
          <Field name="mode" label="Mode" type="select" defaultValue={v("mode") ?? "OFFLINE"} options={[{ value: "OFFLINE", label: "On campus" }, { value: "ONLINE", label: "Online" }, { value: "HYBRID", label: "Hybrid" }]} />
          <Field name="venue" label="Venue" defaultValue={v("venue")} placeholder="e.g. Room 402, A Building, or Zoom" className="md:col-span-2" />
        </div>
      </FormSection>

      <FormSection title="Banner" description="The event's picture. A wide image (about 1600 × 900) fills the cards best; posters are shown whole on the event page.">
        <MediaField name="bannerMediaId" label="Banner" defaultId={v("banner_media_id") as string | null} defaultUrl={bannerUrl} />
      </FormSection>

      <FormSection title="About the event" description="What happens, who it's for, what to bring. Formatting works: headings, bold, lists and links; line breaks are kept.">
        <MarkdownEditor name="description" label="Description" defaultValue={v("description") as string | null} rows={10} breaks
          draftKey={`event:${String(v("id") ?? "new")}`}
          hint="Use the toolbar or type **bold**, _italic_, ## headings, - lists. HTML and scripts are shown as text, never run." />
      </FormSection>

      <FormSection title="Guests and judges">
        <Field name="guestsText" label="Guests" type="textarea" rows={3} defaultValue={v("guests_text")} placeholder={"Chief Guest: Name, Title\nSpecial Guest: Name, Title"} hint={'One per line, e.g. "Chief Guest: Name, Title".'} />
        <Field name="judgesText" label="Judges" type="textarea" rows={3} defaultValue={v("judges_text")} hint={'Kept on record; the public page lists guests only. To show a judge there, add a line under Guests, e.g. "Judge: Name - Title, Organisation".'} />
      </FormSection>

      <FormSection title="Registration" description="Let people register on the site, link a Google Form, or both.">
        <div className="grid gap-4 md:grid-cols-2">
          <Field name="registrationEnabled" label="Accept registrations on the site" type="checkbox" defaultValue={Boolean(v("registration_enabled"))} className="md:col-span-2" />
          <Field name="capacity" label="Capacity" type="number" defaultValue={v("capacity")} hint="Beyond this, people join a waitlist." />
          <span className="hidden md:block" aria-hidden />
          <Field name="registrationOpensAt" label="Opens" type="datetime-local" defaultValue={dt(v("registration_opens_at"))} />
          <Field name="registrationClosesAt" label="Closes" type="datetime-local" defaultValue={dt(v("registration_closes_at"))} />
          <Field name="registrationFormUrl" label="Google Form (optional)" type="url" defaultValue={v("registration_form_url")} placeholder="https://forms.gle/…" hint="Shown on the event page as a registration button." />
          <Field name="registrationFormLabel" label="Button text" defaultValue={v("registration_form_label")} placeholder="Register on Google Forms" />
          <div className="md:col-span-2">
            <p className="mb-2 text-sm font-medium">Extra questions</p>
            <RegistrationFieldsEditor name="registrationFields" initial={fields} />
          </div>
        </div>
      </FormSection>

      <FormSection title="More" description="Links, the web address and figures for after the event.">
        <div className="grid gap-4 md:grid-cols-2">
          <Field name="externalLink" label="External link" type="url" defaultValue={v("external_link")} hint="Facebook post or other page with more details." />
          <Field name="participants" label="Participants" defaultValue={v("participants_reported") ?? v("participants_text")} placeholder="120" hint={'After the event: a number, or text such as "All Executive Members".'} />
          <Field name="slug" label="URL slug" defaultValue={v("slug")} hint="Leave empty to derive from the title. Changing it changes the public address." className="md:col-span-2" />
        </div>
      </FormSection>
    </div>
  );
}
