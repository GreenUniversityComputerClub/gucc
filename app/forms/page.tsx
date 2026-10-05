import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { ArrowRight, CalendarClock, ClipboardList, ListChecks, Lock } from "lucide-react";
import { getPublicForms } from "@/lib/public/data";
import { buildMetadata } from "@/lib/seo/metadata";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema, collectionPageSchema, graph, itemListSchema } from "@/lib/seo/schema";
import { formState, PROVIDER_LABEL, type FormState } from "@/lib/forms/providers";
import type { PublicForm } from "@/lib/forms/types";
import { cn } from "@/lib/utils";

// Forms open and close on a schedule: the hourly job refreshes the "forms" tag when one does.
export const revalidate = 3600;

const DESCRIPTION = "Registrations, applications and surveys from the Green University Computer Club (GUCC): what's open now, what opens soon, and what just closed.";
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export async function generateMetadata(): Promise<Metadata> {
  const forms = await getPublicForms();
  const open = forms.filter((f) => formState(f) === "open").length;
  return buildMetadata({
    title: "Forms",
    description: open ? `${open} GUCC form${open === 1 ? " is" : "s are"} open now. ${DESCRIPTION}` : DESCRIPTION,
    path: "/forms",
    keywords: ["GUCC forms", "GUCC registration", "Green University Computer Club", "Green University of Bangladesh"],
    image: { eyebrow: "GUCC", title: "Forms", subtitle: open ? `${open} open now` : "Registrations, applications and surveys" },
    // Nothing to find while nothing is listed.
    noIndex: forms.length === 0,
  });
}

function FormCard({ form, state }: { form: PublicForm; state: FormState }) {
  const provider = form.provider ?? null;
  const status = state === "open"
    ? form.closesAt ? `Open until ${when(form.closesAt)}` : "Open now"
    : state === "scheduled" ? form.opensAt ? `Opens ${when(form.opensAt)}` : "Opens soon"
    : "Closed";
  return (
    <li className="min-w-0">
      <Link href={`/forms/${encodeURIComponent(form.slug)}`}
        className={cn("group flex h-full flex-col overflow-hidden rounded-2xl border bg-card transition hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", state === "closed" && "opacity-80")}>
        {form.coverUrl && (
          <div className="relative aspect-[1.91/1] bg-muted">
            <Image src={form.coverUrl} alt="" fill sizes="(min-width: 1024px) 20rem, (min-width: 640px) 45vw, 100vw" className="object-cover" />
          </div>
        )}
        <div className="flex flex-1 flex-col p-5">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium",
              state === "open" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : state === "scheduled" ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : "bg-muted text-muted-foreground")}>
              <span className={cn("h-1.5 w-1.5 rounded-full", state === "open" ? "bg-emerald-500" : state === "scheduled" ? "bg-amber-500" : "bg-muted-foreground")} aria-hidden />
              {status}
            </span>
            {form.category && <span className="rounded-full border px-2 py-0.5 text-muted-foreground">{form.category}</span>}
          </div>
          <h3 className="mt-3 text-lg font-semibold leading-snug group-hover:text-primary">{form.title}</h3>
          {form.description && <p className="mt-1.5 line-clamp-3 text-sm text-muted-foreground">{form.description}</p>}
          <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-4 text-xs text-muted-foreground">
            {provider && <span>{PROVIDER_LABEL[provider]}</span>}
            {form.questionCount ? <span className="inline-flex items-center gap-1"><ListChecks className="h-3.5 w-3.5" aria-hidden />{form.questionCount} questions</span> : null}
            {form.requiresSignIn && <span className="inline-flex items-center gap-1"><Lock className="h-3.5 w-3.5" aria-hidden />Google account</span>}
            {form.event && <span className="truncate">{form.event.title}</span>}
            <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-primary transition group-hover:translate-x-0.5" aria-hidden />
          </div>
        </div>
      </Link>
    </li>
  );
}

function Group({ id, title, icon, forms, state }: { id: string; title: string; icon: React.ReactNode; forms: PublicForm[]; state: FormState }) {
  if (forms.length === 0) return null;
  return (
    <section aria-labelledby={id} className="mt-10 first:mt-0">
      <h2 id={id} className="flex items-center gap-2 text-xl font-semibold">{icon}{title}<span className="text-sm font-normal text-muted-foreground">({forms.length})</span></h2>
      <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {forms.map((f) => <FormCard key={f.slug} form={f} state={state} />)}
      </ul>
    </section>
  );
}

/** Every form the club lists: open now, opening soon, and closed in the last 30 days. */
export default async function FormsIndex() {
  const forms = await getPublicForms();
  const now = Date.now();
  const by = (s: FormState) => forms.filter((f) => formState(f, now) === s);
  const open = by("open");
  const scheduled = by("scheduled").sort((a, b) => Date.parse(a.opensAt ?? "") - Date.parse(b.opensAt ?? ""));
  const closed = by("closed");
  return (
    <div className="container mx-auto max-w-6xl px-4 py-10 sm:py-14">
      <JsonLd id="forms-schema" data={graph(
        breadcrumbSchema([{ name: "Home", path: "/" }, { name: "Forms", path: "/forms" }]),
        collectionPageSchema({ name: "GUCC forms", description: DESCRIPTION, path: "/forms", list: itemListSchema("Open GUCC forms", open.map((f) => ({ name: f.title, path: `/forms/${f.slug}` }))) }),
      )} />
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <ol className="flex items-center gap-1.5">
          <li><Link href="/" className="-my-2.5 inline-block py-2.5 hover:text-foreground">Home</Link></li>
          <li aria-hidden>/</li>
          <li aria-current="page" className="text-foreground">Forms</li>
        </ol>
      </nav>
      <header className="mt-3 max-w-3xl">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Forms</h1>
        <p className="mt-2 text-muted-foreground">{DESCRIPTION}</p>
      </header>
      <div className="mt-8">
        {forms.length === 0 || (open.length === 0 && scheduled.length === 0 && closed.length === 0) ? (
          <div className="rounded-2xl border border-dashed p-10 text-center">
            <ClipboardList className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden />
            <p className="mt-3 font-medium">No forms are open right now.</p>
            <p className="mt-1 text-sm text-muted-foreground">Registrations open with each event. See what&apos;s coming up.</p>
            <Link href="/events" className="mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">Upcoming events<ArrowRight className="h-4 w-4" aria-hidden /></Link>
          </div>
        ) : (
          <>
            <Group id="open" title="Open now" icon={<span className="h-2.5 w-2.5 rounded-full bg-emerald-500" aria-hidden />} forms={open} state="open" />
            <Group id="soon" title="Opening soon" icon={<CalendarClock className="h-5 w-5 text-amber-600" aria-hidden />} forms={scheduled} state="scheduled" />
            <Group id="closed" title="Recently closed" icon={<span className="h-2.5 w-2.5 rounded-full bg-muted-foreground" aria-hidden />} forms={closed} state="closed" />
          </>
        )}
      </div>
    </div>
  );
}
