"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { CheckCircle2, ExternalLink, Info, Loader2, Lock, SearchCheck, TriangleAlert, Unlock } from "lucide-react";
import { ActionForm, Field, FormSection, useFieldError } from "@/components/admin/ui";
import { MediaField } from "@/components/admin/media-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { extractFormUrl, formState, PROVIDER_LABEL, providerOf } from "@/lib/forms/providers";
import type { FormInspection } from "@/lib/forms/inspect";
import { slugify } from "@/lib/governance/positions";
import { cn } from "@/lib/utils";
import { inspectFormAction, saveFormAction } from "./actions";

export interface EditableForm {
  id: string;
  slug: string;
  title: string;
  url: string;
  description: string | null;
  listed: boolean;
  accepting: boolean;
  opensAt: string | null;
  closesAt: string | null;
  closedMessage: string | null;
  responsesUrl: string | null;
  category: string | null;
  eventId: string | null;
  coverMediaId: string | null;
  coverUrl: string | null;
  sortOrder: number;
  requiresSignIn: boolean;
  questionCount: number | null;
  inspectedAt: string | null;
}

type Seen = Extract<FormInspection, { ok: true }> & { url: string };

/** What the API said about a box built without <Field>. */
function FieldError({ name }: { name: string }) {
  const error = useFieldError(name);
  return error ? <p className="text-xs text-destructive">{error}</p> : null;
}

/** An ISO time as the value of a datetime-local box, in Dhaka time (the API reads it back as +06:00). */
const toLocal = (iso: string | null) => (iso ? new Date(Date.parse(iso) + 6 * 3600_000).toISOString().slice(0, 16) : "");
const fromLocal = (v: string) => (v ? Date.parse(`${v}:00+06:00`) : NaN);
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function StatePreview({ opensAt, closesAt, accepting }: { opensAt: string; closesAt: string; accepting: boolean }) {
  const o = fromLocal(opensAt);
  const c = fromLocal(closesAt);
  const state = formState({ opensAt: Number.isFinite(o) ? new Date(o).toISOString() : null, closesAt: Number.isFinite(c) ? new Date(c).toISOString() : null, accepting });
  const [text, cls] = state === "open" ? ["Open now", "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"] : state === "scheduled" ? ["Scheduled: not open yet", "bg-sky-500/15 text-sky-700 dark:text-sky-300"] : ["Closed", "bg-slate-500/15 text-slate-700 dark:text-slate-300"];
  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-medium", cls)} aria-live="polite">{text}</span>;
}

/**
 * Add or edit a form, in steps: the link (checked: where it leads, whether it needs a Google
 * account), its title and address, the schedule, how it's shown, and where it's listed.
 */
export function FormEditor({ form, events, categories }: {
  form: EditableForm | null;
  events: Array<{ id: string; title: string; status: string; startAt: string | null }>;
  categories: string[];
}) {
  const [url, setUrl] = useState(form?.url ?? "");
  const [title, setTitle] = useState(form?.title ?? "");
  const [slug, setSlug] = useState(form?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(form));
  const [description, setDescription] = useState(form?.description ?? "");
  const [opensAt, setOpensAt] = useState(toLocal(form?.opensAt ?? null));
  const [closesAt, setClosesAt] = useState(toLocal(form?.closesAt ?? null));
  const [accepting, setAccepting] = useState(form?.accepting ?? true);
  const [listed, setListed] = useState(form?.listed ?? false);
  const [seen, setSeen] = useState<Seen | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [checking, startCheck] = useTransition();
  const [origin, setOrigin] = useState("");
  const lastChecked = useRef<string | null>(null);
  useEffect(() => setOrigin(window.location.origin), []);

  const provider = url ? providerOf(extractFormUrl(url)) : null;
  // Only a check of the link now in the box is sent with the save.
  const fresh = seen && seen.url === url ? seen : null;
  const legacy = Boolean(form && form.slug !== form.slug.toLowerCase());
  const slugOk = !slug || slug === form?.slug || SLUG_RE.test(slug);
  const derived = slugify(title).slice(0, 80).replace(/-+$/, "");
  const shownSlug = slug || derived;

  const check = (value = url) => {
    const link = extractFormUrl(value);
    if (!providerOf(link)) {
      setCheckError("Paste a Google, Microsoft, Tally or Airtable form link (https://…), or Google's embed code.");
      return;
    }
    setCheckError(null);
    lastChecked.current = link;
    startCheck(async () => {
      const r = await inspectFormAction(link);
      if (lastChecked.current !== link) return;
      if (!r.ok) {
        setSeen(null);
        setCheckError(r.error);
        return;
      }
      setSeen({ ...r, url: link });
      // Empty boxes take what the form says about itself.
      if (!title.trim() && r.title) setTitle(r.title.slice(0, 120));
      if (!description.trim() && r.description) setDescription(r.description.slice(0, 1000));
      if (r.closed) setCheckError(null);
    });
  };

  const onUrl = (value: string) => {
    // Google's "Send → <>" embed code works too: keep only its address.
    const link = /<iframe/i.test(value) ? extractFormUrl(value) : value;
    setUrl(link);
    setCheckError(null);
  };

  const signIn = fresh ? fresh.requiresSignIn : form && form.url === url ? form.requiresSignIn : null;

  return (
    <ActionForm action={saveFormAction.bind(null, form?.id ?? null)} submitLabel={form ? "Save form" : "Create form"} successMessage="Saved." redirectTo={form ? undefined : "/dashboard/forms/{id}"} sticky>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          <FormSection title="The form" description="Paste the form's link (Send → link) or its embed code (Send → <>), then check it.">
            <div className="grid gap-1.5">
              <Label htmlFor="form-url">Form link <span className="text-destructive">*</span></Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input id="form-url" name="url" type="url" inputMode="url" required value={url} placeholder="https://forms.gle/… or https://docs.google.com/forms/…"
                  onChange={(e) => onUrl(e.target.value)}
                  onPaste={(e) => {
                    const text = e.clipboardData.getData("text");
                    if (!text) return;
                    e.preventDefault();
                    const link = extractFormUrl(text);
                    setUrl(link);
                    check(link);
                  }}
                  className="min-w-0 flex-1" />
                <Button type="button" variant="outline" onClick={() => check()} disabled={checking || !url} className="min-h-10 shrink-0">
                  {checking ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : <SearchCheck className="mr-1.5 h-4 w-4" aria-hidden />}
                  {checking ? "Checking…" : "Check"}
                </Button>
              </div>
              <FieldError name="url" />
              <p className="text-xs text-muted-foreground">{provider ? PROVIDER_LABEL[provider] : "Google Forms, Microsoft Forms, Tally and Airtable work."} Answers stay in the form&apos;s own sheet.</p>
            </div>
            {checkError && <p role="alert" className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{checkError}</p>}
            {fresh && (
              <div className="rounded-lg border bg-muted/30 p-3 text-sm" aria-live="polite">
                <p className="flex items-center gap-1.5 font-medium"><CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />Checked: {PROVIDER_LABEL[fresh.provider]}</p>
                <ul className="mt-2 space-y-1 text-muted-foreground">
                  <li className="flex items-center gap-1.5">{fresh.requiresSignIn ? <><Lock className="h-3.5 w-3.5" aria-hidden />Needs a Google account to answer</> : <><Unlock className="h-3.5 w-3.5" aria-hidden />Anyone can answer</>}</li>
                  {fresh.title && <li>Title at Google: <span className="text-foreground">{fresh.title}</span></li>}
                  {fresh.questionCount != null && <li>{fresh.questionCount} questions</li>}
                  {!fresh.embedUrl && <li className="font-medium text-amber-700 dark:text-amber-300">Can&apos;t be shown inside the page: this link can&apos;t be framed. Use the form&apos;s normal link (Send → link), or its embed code.</li>}
                  {fresh.closed && <li className="font-medium text-amber-700 dark:text-amber-300">The form says it no longer accepts responses. Turn on “Accepting responses” in Google Forms, or untick “Taking answers” below.</li>}
                </ul>
              </div>
            )}
            {!fresh && form && form.url === url && (
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                {form.inspectedAt ? `Last checked ${new Date(form.inspectedAt).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}: ${form.requiresSignIn ? "needs a Google account" : "anyone can answer"}${form.questionCount != null ? `, ${form.questionCount} questions` : ""}.` : "Not checked yet: press Check so the page knows whether it needs a Google account."}
              </p>
            )}
            {fresh && (
              <>
                <input type="hidden" name="inspected" value="1" />
                <input type="hidden" name="openUrl" value={fresh.openUrl} />
                <input type="hidden" name="requiresSignIn" value={fresh.requiresSignIn ? "1" : "0"} />
                <input type="hidden" name="questionCount" value={fresh.questionCount ?? ""} />
              </>
            )}
          </FormSection>

          <FormSection title="Title and address" description="What the page and link previews show.">
            <div className="grid gap-1.5">
              <Label htmlFor="form-title">Title <span className="text-destructive">*</span></Label>
              <Input id="form-title" name="title" required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="CR Information Form, Fall 2026" />
              <FieldError name="title" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="form-slug">Address</Label>
              <div className="flex min-w-0 items-center rounded-md border bg-background focus-within:ring-2 focus-within:ring-ring">
                <span className="shrink-0 select-none pl-3 text-sm text-muted-foreground">/forms/</span>
                <input id="form-slug" name="slug" value={slug} maxLength={80} placeholder={derived || "cr-fall-2026"} aria-invalid={!slugOk}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setSlug(e.target.value.replace(/\s+/g, "-"));
                  }}
                  className="h-10 min-w-0 flex-1 bg-transparent pr-3 text-base outline-none md:text-sm" />
              </div>
              <p className={cn("text-xs", slugOk ? "text-muted-foreground" : "text-destructive")}>
                {!slugOk ? "Use lowercase letters, digits and single hyphens."
                  : legacy && slug === form?.slug ? "An older address with capitals: it keeps working. A new one replaces it, and the old one still leads here."
                  : <>Link: <span className="break-all font-medium text-foreground">{origin}/forms/{shownSlug || "…"}</span>{!slugTouched && !slug ? " (from the title)" : ""}{form && slug && slug !== form.slug ? ". The old address keeps leading here." : ""}</>}
              </p>
              <FieldError name="slug" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="form-desc">Description</Label>
              <Textarea id="form-desc" name="description" rows={3} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Who should fill it in, and what happens next." />
              <p className="text-right text-xs text-muted-foreground">{description.length}/1000</p>
            </div>
          </FormSection>

          <FormSection title="Schedule" description="Dhaka time. Before it opens and after it closes, the page says so instead of showing the form."
            aside={<StatePreview opensAt={opensAt} closesAt={closesAt} accepting={accepting} />}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="form-opens">Opens</Label>
                <Input id="form-opens" name="opensAt" type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="form-closes">Closes</Label>
                <Input id="form-closes" name="closesAt" type="datetime-local" value={closesAt} min={opensAt || undefined} onChange={(e) => setClosesAt(e.target.value)} />
                <FieldError name="closesAt" />
              </div>
            </div>
            <label className="flex min-h-11 items-center gap-2 text-sm md:min-h-9">
              <input type="checkbox" checked={accepting} onChange={(e) => setAccepting(e.target.checked)} className="h-4 w-4" />
              Taking answers
              <input type="hidden" name="accepting" value={accepting ? "1" : "0"} />
            </label>
            <Field name="closedMessage" label="Message when closed" type="textarea" rows={2} defaultValue={form?.closedMessage ?? ""} placeholder="Thanks! The CR list is out on the notice board." hint="Shown instead of the form once it closes." />
          </FormSection>

          <FormSection title="How it's shown">
            <p className="text-sm text-muted-foreground">The form always appears inside its GUCC page: the original Google, Microsoft, Tally or Airtable address is never shown, linked or put in the page. Visitors see only the page link, so they can&apos;t pass around the original, and a closed or not-yet-open form is not handed out at all.</p>
            {signIn && (
              <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>This form needs a Google account. The page tells visitors to sign in to Google and shows what to change in their browser if the form stays blank (iPhone/Safari users usually must turn off “Prevent Cross-Site Tracking”). For the widest reach, turn off “Restrict to users in…”, “Limit to 1 response” and file uploads in Google Forms, so anyone can answer.</span>
              </p>
            )}
          </FormSection>

          <FormSection title="Listing and links">
            <label className="flex min-h-11 items-start gap-2 text-sm md:min-h-9">
              <input type="checkbox" checked={listed} onChange={(e) => setListed(e.target.checked)} className="mt-0.5 h-4 w-4" />
              <span>List it at /forms and let search engines find it while it&apos;s open<span className="block text-xs text-muted-foreground">Unlisted forms are reached only by their link or QR code.</span></span>
              <input type="hidden" name="listed" value={listed ? "1" : "0"} />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field name="category" label="Category" defaultValue={form?.category ?? ""} placeholder="Registration, Survey, Election…" list="form-categories" />
              <Field name="eventId" label="Event" type="select" defaultValue={form?.eventId ?? ""}
                options={[{ value: "", label: "None" }, ...events.map((e) => ({ value: e.id, label: `${e.title}${e.status === "DRAFT" ? " (draft)" : ""}` }))]} />
            </div>
            <datalist id="form-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
            <Field name="responsesUrl" label="Responses sheet (leaders only)" type="url" defaultValue={form?.responsesUrl ?? ""} placeholder="https://docs.google.com/spreadsheets/…" hint="Never shown publicly; it appears in this dashboard's menu." />
            <Field name="sortOrder" label="Order on /forms" type="number" defaultValue={form?.sortOrder ?? 0} hint="Lower comes first; equal ones by closing date." />
            <MediaField name="coverMediaId" label="Cover picture (for link previews)" defaultId={form?.coverMediaId} defaultUrl={form?.coverUrl} />
          </FormSection>
        </div>

        <aside className="min-w-0 space-y-4 lg:sticky lg:top-20 lg:self-start">
          <section className="rounded-xl border bg-card p-4">
            <h2 className="text-sm font-semibold">On the website</h2>
            <div className="mt-3 rounded-lg border bg-background p-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">GUCC form</p>
              <p className="mt-1 break-words font-semibold leading-snug">{title || "Untitled form"}</p>
              {description && <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{description}</p>}
              <div className="mt-2"><StatePreview opensAt={opensAt} closesAt={closesAt} accepting={accepting} /></div>
            </div>
            <ul className="mt-3 space-y-1.5 text-xs text-muted-foreground">
              <li>{signIn ? "Shown inside the page. Visitors are asked to sign in to Google, with help if the form stays blank." : "Shown inside the page. The original address is never shown."}</li>
              <li>{listed ? "Listed at /forms while open." : "Link only (not listed, not in search engines)."}</li>
            </ul>
            {form && (
              <a href={`/forms/${encodeURIComponent(form.slug)}`} target="_blank" rel="noopener" className="mt-3 inline-flex min-h-9 items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline">
                View the page<ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            )}
          </section>
        </aside>
      </div>
    </ActionForm>
  );
}
