import { view } from "@/lib/api/session";
import type { listForms } from "@/lib/server/services/community";
import { ActionForm, Field, PageHeader, Section } from "@/components/admin/ui";
import { archiveFormAction, saveFormAction } from "../actions";

export default async function FormsAdmin() {
  const forms = await view<Awaited<ReturnType<typeof listForms>>>("forms.list", {}, "/dashboard/forms");
  return (
    <>
      <PageHeader title="Forms" description="External forms embedded at /forms/<slug>. Only Google, Microsoft, Tally and Airtable forms are accepted." />
      <div className="space-y-3">
        {forms.map((f) => (
          <details key={f.id} className="rounded-xl border bg-card p-4">
            <summary className="flex cursor-pointer flex-wrap justify-between gap-2"><span className="font-medium">{f.title}</span><span className="text-xs text-muted-foreground">/forms/{f.slug}</span></summary>
            <div className="mt-3 grid gap-4 md:grid-cols-[1fr_auto]">
              <ActionForm action={saveFormAction.bind(null, f.id)}>
                <div className="grid gap-3 md:grid-cols-3">
                  <Field name="title" label="Title" defaultValue={f.title} required />
                  <Field name="slug" label="Slug" defaultValue={f.slug} required />
                  <Field name="url" label="Form URL" type="url" defaultValue={f.url} required />
                </div>
              </ActionForm>
              <ActionForm action={archiveFormAction.bind(null, f.id)} submitLabel="Archive" variant="outline" confirm="Archive this form? Its page stops working." />
            </div>
          </details>
        ))}
      </div>
      <Section title="Add a form" className="mt-6">
        <ActionForm action={saveFormAction.bind(null, null)} submitLabel="Add form" resetOnSuccess>
          <div className="grid gap-3 md:grid-cols-3">
            <Field name="title" label="Title" required />
            <Field name="slug" label="Slug" hint="Leave empty to derive from the title" />
            <Field name="url" label="Form URL" type="url" required />
          </div>
        </ActionForm>
      </Section>
    </>
  );
}
