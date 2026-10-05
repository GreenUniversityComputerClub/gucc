import { requireAdmin, view } from "@/lib/api/session";
import type { FormAdminRow, formOptions } from "@/lib/server/services/forms";
import { PageHeader } from "@/components/admin/ui";
import { FormEditor } from "../form-editor";

export default async function NewForm() {
  await requireAdmin("/dashboard/forms/new");
  const [options, forms] = await Promise.all([
    view<Awaited<ReturnType<typeof formOptions>>>("forms.options", {}, "/dashboard/forms/new"),
    view<FormAdminRow[]>("forms.list", {}, "/dashboard/forms/new"),
  ]);
  const categories = [...new Set(forms.map((f) => f.category).filter((c): c is string => Boolean(c)))].sort();
  return (
    <>
      <PageHeader title="New form" back={{ href: "/dashboard/forms", label: "Forms" }}
        description="Paste a Google Form link: GUCC checks it, then gives it a page at /forms/<address> with a schedule, a QR code and a link preview." />
      <FormEditor form={null} events={options.events} categories={categories} />
    </>
  );
}
