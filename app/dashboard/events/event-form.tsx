import { Field } from "@/components/admin/ui";
import { MediaField } from "@/components/admin/media-field";
import { RegistrationFieldsEditor, type RegFieldRow } from "@/components/admin/structured-editors";

/** Stored instants → the value a datetime-local input expects, in Dhaka time (UTC+6, no DST). */
const dt = (v: unknown) => (typeof v === "string" && v ? (v.length === 10 ? `${v}T00:00` : new Date(new Date(v).getTime() + 6 * 3600_000).toISOString().slice(0, 16)) : "");

/** Shared fields for creating and editing an event. Times are entered in local (Dhaka) time. */
export function EventFields({ e, bannerUrl, categories = [] }: { e?: Record<string, unknown>; bannerUrl?: string | null; categories?: Array<{ slug: string; name: string }> }) {
  const v = (k: string) => (e?.[k] as string | number | null | undefined) ?? null;
  let fields: RegFieldRow[] = [];
  try {
    fields = JSON.parse(String(v("registration_fields_json") ?? "[]"));
  } catch {
    fields = [];
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Field name="title" label="Title" defaultValue={v("title")} required />
        <Field name="slug" label="URL slug" defaultValue={v("slug")} hint="Leave empty to derive from the title. Changing it changes the public URL." />
        <Field name="category" label="Category" defaultValue={v("category_name")} list="event-categories" placeholder="Workshop, Contest, Sports…" hint="The category decides which positions may manage the event." />
        <datalist id="event-categories">{categories.map((c) => <option key={c.slug} value={c.name} />)}</datalist>
        <Field name="organizer" label="Organizer" defaultValue={v("organizer") ?? "GUCC"} />
        <Field name="startAt" label="Starts (Dhaka time)" type="datetime-local" defaultValue={dt(v("start_at"))} required />
        <Field name="endAt" label="Ends" type="datetime-local" defaultValue={dt(v("end_at"))} />
        <Field name="timeText" label="Schedule text" defaultValue={v("time_text")} placeholder="7:00 PM - 9:00 PM" />
        <Field name="venue" label="Venue" defaultValue={v("venue")} />
        <Field name="mode" label="Mode" type="select" defaultValue={v("mode") ?? "OFFLINE"} options={[{ value: "OFFLINE", label: "On campus" }, { value: "ONLINE", label: "Online" }, { value: "HYBRID", label: "Hybrid" }]} />
        <Field name="externalLink" label="External link" type="url" defaultValue={v("external_link")} hint="Facebook post or other page with more details." />
        <Field name="participants" label="Participants" defaultValue={v("participants_reported") ?? v("participants_text")} placeholder="120" hint={'After the event: a number, or text such as "All Executive Members". Shown in the Participants bar on the event page.'} />
      </div>
      <MediaField name="bannerMediaId" label="Banner" defaultId={v("banner_media_id") as string | null} defaultUrl={bannerUrl} />
      <Field name="description" label="Description" type="textarea" rows={6} defaultValue={v("description")} hint="Line breaks are kept on the event page." />
      <Field name="guestsText" label="Guests" type="textarea" rows={3} defaultValue={v("guests_text")} hint={'One per line, e.g. "Chief Guest: Name, Title" or "Special Guest: Name, Title"'} />
      <Field name="judgesText" label="Judges" type="textarea" rows={3} defaultValue={v("judges_text")} hint={'Kept on record; the public page lists guests only, as it always has. To show a judge there, add a line under Guests, e.g. "Judge: Name - Title, Organisation".'} />
      <fieldset className="min-w-0 grid gap-4 rounded-lg border p-4 md:grid-cols-2">
        <legend className="px-1 text-sm font-semibold">Registration</legend>
        <Field name="registrationEnabled" label="Accept registrations on the site" type="checkbox" defaultValue={Boolean(v("registration_enabled"))} />
        <Field name="capacity" label="Capacity" type="number" defaultValue={v("capacity")} hint="Beyond this, people join a waitlist." />
        <Field name="registrationOpensAt" label="Opens" type="datetime-local" defaultValue={dt(v("registration_opens_at"))} />
        <Field name="registrationClosesAt" label="Closes" type="datetime-local" defaultValue={dt(v("registration_closes_at"))} />
        <Field name="registrationFormUrl" label="Google Form (optional)" type="url" defaultValue={v("registration_form_url")} placeholder="https://forms.gle/…" hint="Shown on the event page as a registration button. Use it instead of, or as well as, registration on the site." />
        <Field name="registrationFormLabel" label="Button text" defaultValue={v("registration_form_label")} placeholder="Register on Google Forms" />
        <div className="md:col-span-2">
          <p className="mb-2 text-sm font-medium">Extra questions</p>
          <RegistrationFieldsEditor name="registrationFields" initial={fields} />
        </div>
      </fieldset>
    </div>
  );
}
