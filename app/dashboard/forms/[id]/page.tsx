import { requireAdmin, view } from "@/lib/api/session";
import type { FormAdminRow, formOptions, getForm } from "@/lib/server/services/forms";
import { ActionForm, PageHeader } from "@/components/admin/ui";
import { FormEditor } from "../form-editor";
import { FormRowMenu } from "../form-row-menu";
import { archiveFormAction, restoreFormAction } from "../actions";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short", year: "numeric" });

export default async function EditForm({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const from = `/dashboard/forms/${id}`;
  await requireAdmin(from);
  const [{ form, slugs }, options, forms] = await Promise.all([
    view<Awaited<ReturnType<typeof getForm>>>("forms.get", { id }, from),
    view<Awaited<ReturnType<typeof formOptions>>>("forms.options", {}, from),
    view<FormAdminRow[]>("forms.list", {}, from),
  ]);
  const categories = [...new Set(forms.map((f) => f.category).filter((c): c is string => Boolean(c)))].sort();
  const archived = form.status === "ARCHIVED";
  return (
    <>
      <PageHeader title={form.title} back={{ href: "/dashboard/forms", label: "Forms" }}
        description={archived ? "Archived: its page is offline until you restore it." : `/forms/${form.slug} · created ${day(form.createdAt)}${form.updatedBy ? ` · last edited by ${form.updatedBy}` : ""}`}
        actions={<FormRowMenu form={form} />} />
      {archived && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <p>This form is archived. Restore it to bring its page back.</p>
          <ActionForm action={restoreFormAction.bind(null, form.id)} submitLabel="Restore" inline />
        </div>
      )}
      <FormEditor key={form.id} form={form} events={options.events} categories={categories} />
      {slugs.length > 0 && (
        <section className="mt-6 rounded-xl border bg-card p-4 sm:p-5">
          <h2 className="text-base font-semibold">Older addresses</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">These still lead to this form, so links on old posters keep working.</p>
          <ul className="mt-3 flex flex-wrap gap-2 text-sm">
            {slugs.map((s) => <li key={s.slug} className="rounded-full border px-3 py-1">/forms/{s.slug}</li>)}
          </ul>
        </section>
      )}
      {!archived && (
        <section className="mt-6 rounded-xl border p-4 sm:p-5">
          <h2 className="text-base font-semibold">Archive</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Take the page offline at the end of the round. Answers stay in the form&apos;s sheet, and you can restore it or duplicate it for the next round.</p>
          <ActionForm action={archiveFormAction.bind(null, form.id)} submitLabel="Archive form" variant="outline" confirm={`Archive “${form.title}”? Its page goes offline.`} className="mt-3" />
        </section>
      )}
    </>
  );
}
