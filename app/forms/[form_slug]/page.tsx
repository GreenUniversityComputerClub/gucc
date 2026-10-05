import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { getFormSource, getPublicForm } from "@/lib/public/data";
import { buildMetadata, truncate } from "@/lib/seo/metadata";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema, graph, webPageSchema } from "@/lib/seo/schema";
import { resolveForm } from "@/lib/forms/resolve";
import { formState, PROVIDER_LABEL, type FormState } from "@/lib/forms/providers";
import type { PublicForm } from "@/lib/forms/types";
import { FormShell, type FormView } from "./form-shell";

export const revalidate = 21600;

/** Rendered on the first visit, then cached (edits refresh it through the forms tag). */
export async function generateStaticParams() {
  return [];
}

const dateLabel = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/**
 * Everything the page shows about a form: what the dashboard stored and, where it hasn't been
 * checked yet (forms saved before checking existed), what a look at the form itself says. The
 * form's own address is never part of this: the page's script asks the frame route for it.
 */
async function viewOf(form: PublicForm): Promise<FormView> {
  const provider = form.provider ?? null;
  let requiresSignIn = Boolean(form.requiresSignIn);
  let description = form.description ?? null;
  let questionCount = form.questionCount ?? null;
  let providerClosed = false;
  if (!form.inspectedAt) {
    const source = await getFormSource(form.slug).catch(() => null);
    const seen = source ? await resolveForm(source).catch(() => null) : null;
    if (seen) {
      requiresSignIn = seen.requiresSignIn;
      description ??= seen.description;
      questionCount ??= seen.questionCount;
      providerClosed = seen.closed;
    }
  }
  const state: FormState = providerClosed ? "closed" : formState({ opensAt: form.opensAt, closesAt: form.closesAt, accepting: form.accepting });
  return {
    slug: form.slug,
    title: form.title,
    description,
    provider,
    providerLabel: provider ? PROVIDER_LABEL[provider] : "Form",
    requiresSignIn,
    state,
    opensAt: form.opensAt ?? null,
    closesAt: form.closesAt ?? null,
    closedMessage: form.closedMessage ?? null,
    questionCount,
    event: form.event ?? null,
  };
}

function summary(v: FormView): string {
  if (v.description) return v.description;
  const when = v.state === "closed" ? "This form is closed." : v.closesAt ? `Open until ${dateLabel(v.closesAt)}.` : "";
  return `${v.title}: a form from the Green University Computer Club (GUCC), Green University of Bangladesh. ${when}`.trim();
}

export async function generateMetadata({ params }: { params: Promise<{ form_slug: string }> }): Promise<Metadata> {
  const { form_slug } = await params;
  const form = await getPublicForm(form_slug);
  if (!form) return buildMetadata({ title: "Form not found", description: "This GUCC form doesn't exist or was removed.", path: `/forms/${form_slug}`, noIndex: true });
  const v = await viewOf(form);
  const status = v.state === "closed" ? "Closed" : v.state === "scheduled" && v.opensAt ? `Opens ${dateLabel(v.opensAt)}` : v.closesAt ? `Open until ${dateLabel(v.closesAt)}` : "Open now";
  return buildMetadata({
    title: form.title,
    description: summary(v),
    path: `/forms/${form.slug}`,
    keywords: [form.title, "GUCC form", "Green University Computer Club"],
    image: form.coverUrl ? form.coverUrl : { eyebrow: "GUCC form", title: form.title, subtitle: status },
    // Listed, open forms are found in search; the rest are shared by link only.
    noIndex: !form.listed || v.state !== "open",
  });
}

/**
 * A form page: a slim header (the title, its state, share actions) and the form itself, always
 * inside this page: the form's own address is never shown or linked (the script fetches it once the
 * form is open). On phones the form fills the screen under a 48 px bar, so the provider's own
 * pickers (a long "Batch" list) always fit; when Google asks for a sign-in the page says what to do.
 */
export default async function FormPage({ params }: { params: Promise<{ form_slug: string }> }) {
  const { form_slug } = await params;
  const form = await getPublicForm(form_slug);
  if (!form) notFound();
  // Old links with another spelling (/forms/CR → /forms/cr) land on the form's own address.
  if (form.slug !== decodeURIComponent(form_slug)) permanentRedirect(`/forms/${encodeURIComponent(form.slug)}`);
  const v = await viewOf(form);
  return (
    <>
      <JsonLd id={`form-${form.slug}`} data={graph(
        breadcrumbSchema([{ name: "Home", path: "/" }, { name: "Forms", path: "/forms" }, { name: form.title, path: `/forms/${form.slug}` }]),
        webPageSchema({ name: form.title, description: truncate(summary(v), 300), path: `/forms/${form.slug}` }),
      )} />
      <FormShell form={v} />
    </>
  );
}
