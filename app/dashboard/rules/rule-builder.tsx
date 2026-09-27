"use client";

import { useState } from "react";
import { ActionForm, Field, type Result } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";

const FIELDS: Array<{ value: string; label: string; hint: string }> = [
  { value: "actor.position", label: "Actor's position", hint: "position key, e.g. photography-secretary" },
  { value: "actor.role", label: "Actor's role", hint: "moderator, administrator, executive, member" },
  { value: "actor.status", label: "Actor's account status", hint: "ACTIVE, …" },
  { value: "actor.committee", label: "Actor's committee", hint: "committee id" },
  { value: "resource.type", label: "Resource type", hint: "post, event, event_media, media, user" },
  { value: "resource.category", label: "Resource category", hint: "category slug, e.g. technical" },
  { value: "resource.status", label: "Resource status", hint: "DRAFT, PUBLISHED, …" },
  { value: "resource.event_type", label: "Event type", hint: "" },
  { value: "resource.committee", label: "Resource committee", hint: "committee id" },
  { value: "resource.owner", label: "Resource owner", hint: "self = the actor" },
  { value: "resource.creator", label: "Resource creator", hint: "self = the actor" },
  { value: "resource.assigned", label: "Actor is assigned to the resource", hint: "use is true / is false" },
  { value: "resource.event_assigned", label: "Actor is assigned to the resource's event", hint: "use is true / is false" },
];
const OPERATORS = [
  { value: "eq", label: "is" },
  { value: "neq", label: "is not" },
  { value: "in", label: "is one of" },
  { value: "not_in", label: "is none of" },
  { value: "is_true", label: "is true" },
  { value: "is_false", label: "is false" },
  { value: "exists", label: "is set" },
  { value: "not_exists", label: "is not set" },
];

export interface Condition {
  field: string;
  operator: string;
  value?: unknown;
  group: number;
}

export function RuleBuilder({
  action,
  permissions,
  policies,
  initial,
  canProtect,
  submitLabel,
  stamp,
}: {
  action: (fd: FormData) => Promise<Result>;
  /** The rule's updated_at when the page loaded (saving is refused if it changed since). */
  stamp?: string;
  permissions: string[];
  policies: Array<{ key: string; name: string }>;
  initial?: {
    name: string; description: string | null; effect: string; permission: string; resourceType: string | null; scope: string; scopeValue: string;
    priority: number; policyKey: string | null; isProtected: boolean; conditions: Condition[];
  };
  canProtect: boolean;
  submitLabel: string;
}) {
  const [conditions, setConditions] = useState<Condition[]>(initial?.conditions ?? [{ field: "actor.position", operator: "eq", value: "", group: 0 }]);
  const [effect, setEffect] = useState(initial?.effect ?? "ALLOW");

  const update = (i: number, patch: Partial<Condition>) => setConditions((c) => c.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const serialized = JSON.stringify(
    conditions.map((c) => ({
      ...c,
      value: ["in", "not_in"].includes(c.operator) ? String(c.value ?? "").split(",").map((v) => v.trim()).filter(Boolean) : ["is_true", "is_false", "exists", "not_exists"].includes(c.operator) ? undefined : c.value,
    })),
  );
  const groups = [...new Set(conditions.map((c) => c.group))].sort((a, b) => a - b);

  return (
    <ActionForm action={action} submitLabel={submitLabel} successMessage="Saved. New rules start as drafts; activate them when ready.">
      {stamp && <input type="hidden" name="expectedUpdatedAt" value={stamp} />}
      <div className="grid gap-4 md:grid-cols-2">
        <Field name="name" label="Rule name" defaultValue={initial?.name} required placeholder="Photography Event Media Access" />
        <Field name="description" label="Description" defaultValue={initial?.description} />
      </div>

      <fieldset className="min-w-0 rounded-lg border p-4">
        <legend className="px-1 text-sm font-semibold">When</legend>
        <p className="mb-3 text-xs text-muted-foreground">Conditions in the same group must all match; any matching group triggers the rule.</p>
        {groups.map((g, gi) => (
          <div key={g} className="mb-3 rounded-md bg-muted/40 p-3">
            {gi > 0 && <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">or</p>}
            {conditions.map((c, i) =>
              c.group !== g ? null : (
                <div key={i} className="mb-2 grid gap-2 sm:grid-cols-[1.4fr_1fr_1.4fr_auto]">
                  <select aria-label="Field" value={c.field} onChange={(e) => update(i, { field: e.target.value })} className="h-9 rounded-md border bg-background px-2 text-sm">
                    {FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                  <select aria-label="Operator" value={c.operator} onChange={(e) => update(i, { operator: e.target.value })} className="h-9 rounded-md border bg-background px-2 text-sm">
                    {OPERATORS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <input
                    aria-label="Value"
                    value={Array.isArray(c.value) ? c.value.join(", ") : String(c.value ?? "")}
                    onChange={(e) => update(i, { value: e.target.value })}
                    disabled={["is_true", "is_false", "exists", "not_exists"].includes(c.operator)}
                    placeholder={FIELDS.find((f) => f.value === c.field)?.hint}
                    className="h-9 rounded-md border bg-background px-2 text-sm disabled:opacity-50"
                  />
                  <Button type="button" variant="ghost" size="sm" onClick={() => setConditions((cs) => cs.filter((_, j) => j !== i))} aria-label="Remove condition">✕</Button>
                </div>
              ),
            )}
            <Button type="button" variant="outline" size="sm" onClick={() => setConditions((cs) => [...cs, { field: "resource.type", operator: "eq", value: "", group: g }])}>+ and</Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setConditions((cs) => [...cs, { field: "actor.position", operator: "eq", value: "", group: Math.max(-1, ...cs.map((c) => c.group)) + 1 }])}>+ or group</Button>
      </fieldset>
      <input type="hidden" name="conditions" value={serialized} />

      <fieldset className="min-w-0 grid gap-4 rounded-lg border p-4 md:grid-cols-3">
        <legend className="px-1 text-sm font-semibold">Then</legend>
        <div className="grid gap-1.5">
          <label htmlFor="effect" className="text-sm font-medium">Action</label>
          <select id="effect" name="effect" value={effect} onChange={(e) => setEffect(e.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm">
            <option value="ALLOW">Allow</option>
            <option value="DENY">Deny</option>
            <option value="REQUIRE_APPROVAL">Require approval</option>
          </select>
        </div>
        <Field name="permission" label="Permission" type="select" defaultValue={initial?.permission ?? "posts.publish"} options={permissions.map((p) => ({ value: p, label: p }))} />
        <Field name="resourceType" label="Only for resource type" type="select" defaultValue={initial?.resourceType ?? ""}
          options={[{ value: "", label: "Any" }, ...["post", "event", "event_media", "media", "user", "committee_member", "position", "rule"].map((t) => ({ value: t, label: t }))]} />
        {effect === "REQUIRE_APPROVAL" && (
          <Field name="approvalPolicyKey" label="Approvers" type="select" defaultValue={initial?.policyKey ?? policies[0]?.key} options={policies.map((p) => ({ value: p.key, label: p.name }))} />
        )}
      </fieldset>

      <fieldset className="min-w-0 grid gap-4 rounded-lg border p-4 md:grid-cols-3">
        <legend className="px-1 text-sm font-semibold">With</legend>
        <Field name="scope" label="Scope" type="select" defaultValue={initial?.scope ?? "ALL"}
          options={[["ALL", "Everything"], ["OWN", "Own items"], ["ASSIGNED", "Assigned items"], ["EVENT", "Event (value: ASSIGNED or an event id)"], ["CATEGORY", "Category (value: slug list)"], ["COMMITTEE", "Committee"], ["POSITION", "Position"]].map(([value, label]) => ({ value, label }))} />
        <Field name="scopeValue" label="Scope value" defaultValue={initial?.scopeValue} placeholder="e.g. ASSIGNED or technical" />
        <Field name="priority" label="Priority" type="number" defaultValue={initial?.priority ?? 100} hint="Higher runs first. Deny always beats allow." />
        {canProtect && <Field name="isProtected" label="Protected (Moderator-only; restricts even Moderators)" type="checkbox" defaultValue={initial?.isProtected} />}
      </fieldset>
    </ActionForm>
  );
}
