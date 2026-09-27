import Link from "next/link";
import { requireAdmin, view } from "@/lib/api/session";
import type { positionFormOptions } from "@/lib/server/views/governance";
import { ActionForm, Field, PageHeader, Section } from "@/components/admin/ui";
import { GOVERNANCE_LEVELS } from "@/lib/governance/levels";
import { createPositionAction } from "../../actions";

const CATEGORIES = ["LEADERSHIP", "SECRETARIAT", "COORDINATOR", "EXECUTIVE", "FACULTY", "OTHER"].map((c) => ({ value: c, label: c[0] + c.slice(1).toLowerCase() }));

export default async function NewPositionPage() {
  const session = await requireAdmin("/dashboard/positions/new");
  const opts = await view<Awaited<ReturnType<typeof positionFormOptions>>>("views.positionForm", {}, "/dashboard/positions/new");
  const levels = GOVERNANCE_LEVELS.filter((l) => session.isModerator || l.value < 90).map((l) => ({ value: String(l.value), label: l.label }));
  return (
    <>
      <PageHeader title="New position" actions={<Link prefetch={false} href="/dashboard/positions" className="rounded-md border px-3 py-2 text-sm hover:bg-muted">All positions</Link>} />
      <Section title="About the position" description="No code changes needed: it appears straight away in Add executive and in executive import.">
        <ActionForm action={createPositionAction} submitLabel="Create position" redirectTo="/dashboard/positions/{id}">
          <div className="grid gap-3 md:grid-cols-2">
            <Field name="name" label="Name" required placeholder="e.g. Web Development Secretary" className="md:col-span-2" />
            <Field name="governanceLevel" label="Level" type="select" defaultValue="60" options={levels} />
            <Field name="parentId" label="Reports to" type="select" options={[{ value: "", label: "No one (top level)" }, ...opts.parents.map((p) => ({ value: p.id, label: p.name }))]} />
            <Field name="maxHolders" label="Holders per committee" type="number" placeholder="No limit" />
            <Field name="category" label="Category" type="select" defaultValue="SECRETARIAT" options={CATEGORIES} />
          </div>
          <Field name="description" label="Responsibilities" type="textarea" rows={3} />
          <Field name="aliases" label="Other titles it appears under" type="textarea" rows={2} placeholder="One per line, e.g. Web Dev Secretary" />
          {session.caps["positions.permissions"] && (
            <Field name="copyFrom" label="Start with the access of" type="select" options={[{ value: "", label: "Nothing extra (executive baseline only)" }, ...opts.sources]} />
          )}
        </ActionForm>
      </Section>
    </>
  );
}
