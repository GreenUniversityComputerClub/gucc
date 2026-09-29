"use client";

/**
 * Plain editors for page content kept in organization settings: the home page messages and
 * figures, the navbar Services menu and the partner clubs. Each writes JSON into a hidden
 * "value" input for the existing settings action, so validation stays on the server.
 */
import { useState } from "react";
import { Rows } from "./structured-editors";
import { uploadImage } from "@/lib/media/client";

const input = "h-10 w-full rounded-md border border-input bg-background px-3 text-base md:h-9 md:text-sm";
const area = "min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
const initialsOf = (name: string) => name.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w) && !/^(Mr|Mrs|Ms|Md|Dr)\.?$/i.test(w)).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");

/** Pick a photo: uploads to the media library and keeps its /media/… address (served through the site). */
function PhotoInput({ value, onChange, label }: { value: string; onChange: (url: string) => void; label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {value ? <img src={value} alt="" className="h-12 w-12 rounded-full border object-cover" /> : <span className="h-12 w-12 rounded-full border bg-muted" aria-hidden />}
      <label className="cursor-pointer rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
        {busy ? "Uploading…" : `Change ${label.toLowerCase()}`}
        <input type="file" accept="image/*" className="sr-only" disabled={busy} onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setBusy(true);
          setError(null);
          const r = await uploadImage(f, { alt: label });
          setBusy(false);
          if (!r.ok || !r.url) return setError(r.ok ? "Upload finished without an address." : r.error);
          onChange(r.url);
        }} />
      </label>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

type Person = { name: string; title: string; photo: string; initials: string; message: string };
export interface HomeContent {
  chairperson: { heading: string; subheading: string; person: Person };
  moderators: { heading: string; subheading: string; people: Person[] };
  stats: Array<{ value: number; suffix?: string; label: string }>;
}

function PersonFields({ p, update }: { p: Person; update: (patch: Partial<Person>) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="sm:col-span-2"><PhotoInput value={p.photo} onChange={(photo) => update({ photo })} label="Photo" /></div>
      <label className="grid gap-1 text-xs font-medium">Name<input className={input} value={p.name} onChange={(e) => update({ name: e.target.value, initials: initialsOf(e.target.value) })} /></label>
      <label className="grid gap-1 text-xs font-medium">Title<input className={input} value={p.title} onChange={(e) => update({ title: e.target.value })} /></label>
      <label className="grid gap-1 text-xs font-medium sm:col-span-2">Message<textarea className={area} rows={4} value={p.message} onChange={(e) => update({ message: e.target.value })} /></label>
    </div>
  );
}

export function HomeContentEditor({ initial }: { initial: HomeContent }) {
  const [c, setC] = useState<HomeContent>(initial);
  const blank: Person = { name: "", title: "", photo: "", initials: "", message: "" };
  return (
    <div className="space-y-5">
      <input type="hidden" name="value" value={JSON.stringify(c)} />
      <fieldset className="min-w-0 space-y-2 rounded-lg border p-3">
        <legend className="px-1 text-sm font-semibold">Chairperson&apos;s message</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-medium">Heading<input className={input} value={c.chairperson.heading} onChange={(e) => setC({ ...c, chairperson: { ...c.chairperson, heading: e.target.value } })} /></label>
          <label className="grid gap-1 text-xs font-medium">Subheading<input className={input} value={c.chairperson.subheading} onChange={(e) => setC({ ...c, chairperson: { ...c.chairperson, subheading: e.target.value } })} /></label>
        </div>
        <PersonFields p={c.chairperson.person} update={(patch) => setC({ ...c, chairperson: { ...c.chairperson, person: { ...c.chairperson.person, ...patch } } })} />
      </fieldset>
      <fieldset className="min-w-0 space-y-2 rounded-lg border p-3">
        <legend className="px-1 text-sm font-semibold">Moderators&apos; messages</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-medium">Heading<input className={input} value={c.moderators.heading} onChange={(e) => setC({ ...c, moderators: { ...c.moderators, heading: e.target.value } })} /></label>
          <label className="grid gap-1 text-xs font-medium">Subheading<input className={input} value={c.moderators.subheading} onChange={(e) => setC({ ...c, moderators: { ...c.moderators, subheading: e.target.value } })} /></label>
        </div>
        <Rows rows={c.moderators.people} setRows={(people) => setC({ ...c, moderators: { ...c.moderators, people } })} blank={blank} addLabel="Add a moderator" empty="No messages." max={6}
          render={(p, update) => <PersonFields p={p} update={update} />} />
      </fieldset>
      <fieldset className="min-w-0 space-y-2 rounded-lg border p-3">
        <legend className="px-1 text-sm font-semibold">GUCC in Numbers</legend>
        <Rows rows={c.stats} setRows={(stats) => setC({ ...c, stats })} blank={{ value: 0, suffix: "+", label: "" }} addLabel="Add a figure" empty="No figures." max={4}
          render={(st, update) => (
            <div className="grid grid-cols-[1fr_4.5rem] gap-2 sm:grid-cols-[1fr_5rem_2fr]">
              <label className="grid gap-1 text-xs font-medium">Number<input type="number" min={0} className={input} value={st.value} onChange={(e) => update({ value: Number(e.target.value) || 0 })} /></label>
              <label className="grid gap-1 text-xs font-medium">After<input className={input} value={st.suffix ?? ""} maxLength={3} onChange={(e) => update({ suffix: e.target.value })} /></label>
              <label className="col-span-2 grid gap-1 text-xs font-medium sm:col-span-1">Label<input className={input} value={st.label} onChange={(e) => update({ label: e.target.value })} /></label>
            </div>
          )} />
      </fieldset>
    </div>
  );
}

type Service = { label: string; href: string; description?: string; visible?: boolean };
export function ServicesEditor({ initial }: { initial: { items: Service[] } }) {
  const [items, setItems] = useState<Service[]>(initial.items ?? []);
  return (
    <div className="space-y-2">
      <input type="hidden" name="value" value={JSON.stringify({ items })} />
      <Rows rows={items} setRows={setItems} blank={{ label: "", href: "/", description: "", visible: true }} addLabel="Add a service" empty="The Services menu is hidden while it's empty." max={10}
        render={(x, update) => (
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="grid gap-1 text-xs font-medium">Label<input className={input} value={x.label} onChange={(e) => update({ label: e.target.value })} /></label>
            <label className="grid gap-1 text-xs font-medium">Link (a page on this site)<input className={input} value={x.href} onChange={(e) => update({ href: e.target.value })} placeholder="/lost-found" /></label>
            <label className="grid gap-1 text-xs font-medium sm:col-span-2">Short description<input className={input} value={x.description ?? ""} onChange={(e) => update({ description: e.target.value })} /></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={x.visible !== false} onChange={(e) => update({ visible: e.target.checked })} className="h-4 w-4" /> Show in the menu</label>
          </div>
        )} />
    </div>
  );
}

type Partner = { name: string; image: string; description: string } & Record<string, unknown>;
export function PartnersEditor({ initial }: { initial: { partners: Partner[] } & Record<string, unknown> }) {
  const [partners, setPartners] = useState<Partner[]>(initial.partners ?? []);
  return (
    <div className="space-y-2">
      <input type="hidden" name="value" value={JSON.stringify({ ...initial, partners })} />
      <Rows rows={partners} setRows={setPartners} blank={{ name: "", image: "", description: "" }} addLabel="Add a partner club" empty="No partner clubs." max={40}
        render={(x, update) => (
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="sm:col-span-2"><PhotoInput value={x.image} onChange={(image) => update({ image })} label="Logo" /></div>
            <label className="grid gap-1 text-xs font-medium">Name<input className={input} value={x.name} onChange={(e) => update({ name: e.target.value })} /></label>
            <label className="grid gap-1 text-xs font-medium">Description<input className={input} value={x.description} onChange={(e) => update({ description: e.target.value })} /></label>
          </div>
        )} />
    </div>
  );
}
