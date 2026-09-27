import { Field } from "@/components/admin/ui";

const dt = (v: unknown) => (typeof v === "string" && v ? new Date(new Date(v).getTime() + 6 * 3600_000).toISOString().slice(0, 16) : "");

export function CampaignFields({ c, positions }: { c?: Record<string, unknown> & { positionIds?: string[] }; positions: Array<{ id: string; name: string; category: string }> }) {
  const v = (k: string) => (c?.[k] as string | null | undefined) ?? null;
  const chosen = new Set(c?.positionIds ?? []);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Field name="title" label="Title" defaultValue={v("title")} placeholder="Call for Executive Members: GUCC ExCom 2027-28" required className="md:col-span-2" />
        <Field name="opensAt" label="Opens (Dhaka time)" type="datetime-local" defaultValue={dt(v("opens_at"))} hint="Leave empty to open as soon as the status is Open." />
        <Field name="closesAt" label="Closes (Dhaka time)" type="datetime-local" defaultValue={dt(v("closes_at"))} required />
        <Field name="status" label="Status" type="select" defaultValue={v("status") ?? "DRAFT"} options={[{ value: "DRAFT", label: "Draft (not visible)" }, { value: "OPEN", label: "Open (accepting applications in the window)" }, { value: "CLOSED", label: "Closed" }, { value: "ARCHIVED", label: "Archived" }]} />
        <Field name="circularUrl" label="Circular link" type="url" defaultValue={v("circular_url")} placeholder="https://…" />
      </div>
      <Field name="description" label="Introduction" type="textarea" rows={5} defaultValue={v("description")} hint="Shown above the form. Plain text; blank lines start new paragraphs. Leave empty to use the standard GUCC call text (it names the committee from the title, e.g. 2026-27)." />
      <fieldset className="min-w-0 rounded-lg border p-4">
        <legend className="px-1 text-sm font-semibold">Positions offered</legend>
        <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
          {positions.filter((p) => p.category !== "FACULTY").map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="positionIds" value={p.id} defaultChecked={chosen.has(p.id)} className="h-4 w-4" /> {p.name}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
