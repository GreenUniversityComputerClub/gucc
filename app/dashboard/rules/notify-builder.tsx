"use client";

import { useState } from "react";
import { ActionForm, Field, type Result } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";

type Target = { kind: "position" | "role" | "permission"; key: string };
type Condition = { field: string; operator: string; value?: string; group: number };

const input = "h-9 w-full min-w-0 rounded-md border bg-background px-2 text-sm";
const FIELDS: Array<[string, string]> = [
  ["resource.category", "Category is"],
  ["resource.status", "Status is"],
  ["actor.position", "Done by position"],
  ["actor.role", "Done by role"],
];

/** WHEN something happens (and these conditions hold) THEN notify these people. */
export function NotifyRuleBuilder({ action, events, positions, roles, permissions }: {
  action: (fd: FormData) => Promise<Result>;
  events: Array<[string, string]>;
  positions: Array<{ key: string; name: string }>;
  roles: Array<{ key: string; name: string }>;
  permissions: string[];
}) {
  const [targets, setTargets] = useState<Target[]>([{ kind: "position", key: "" }]);
  const [conditions, setConditions] = useState<Condition[]>([]);
  const options = (kind: Target["kind"]) =>
    kind === "position" ? positions.map((p) => [p.key, p.name]) : kind === "role" ? roles.map((r) => [r.key, r.name]) : permissions.map((p) => [p, p]);

  return (
    <ActionForm action={action} submitLabel="Create draft notification rule" resetOnSuccess>
      <div className="grid gap-4 md:grid-cols-2">
        <Field name="name" label="Name" placeholder="Tell the sports secretary about sports events" required />
        <Field name="event" label="When" type="select" options={events.map(([value, label]) => ({ value, label }))} required />
      </div>
      <input type="hidden" name="targets" value={JSON.stringify(targets.filter((t) => t.key))} />
      <input type="hidden" name="conditions" value={JSON.stringify(conditions.filter((c) => c.value?.trim()).map((c) => ({ ...c, value: c.operator === "in" ? c.value!.split(",").map((v) => v.trim()).filter(Boolean) : c.value!.trim() })))} />
      <fieldset className="min-w-0 space-y-2">
        <legend className="text-sm font-medium">Notify</legend>
        {targets.map((t, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[10rem_1fr_auto]">
            <select aria-label="Who" value={t.kind} onChange={(e) => setTargets(targets.map((x, k) => (k === i ? { kind: e.target.value as Target["kind"], key: "" } : x)))} className={input}>
              <option value="position">Holders of a position</option>
              <option value="role">Holders of a role</option>
              <option value="permission">Anyone who can…</option>
            </select>
            <select aria-label="Which" value={t.key} onChange={(e) => setTargets(targets.map((x, k) => (k === i ? { ...x, key: e.target.value } : x)))} className={input}>
              <option value="">Choose…</option>
              {options(t.kind).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <Button type="button" variant="ghost" size="sm" onClick={() => setTargets(targets.filter((_, k) => k !== i))} disabled={targets.length === 1}>Remove</Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setTargets([...targets, { kind: "position", key: "" }])}>Add someone</Button>
      </fieldset>
      <fieldset className="min-w-0 space-y-2">
        <legend className="text-sm font-medium">Only when (optional)</legend>
        {conditions.map((c, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[12rem_8rem_1fr_auto]">
            <select aria-label="Condition" value={c.field} onChange={(e) => setConditions(conditions.map((x, k) => (k === i ? { ...x, field: e.target.value } : x)))} className={input}>
              {FIELDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select aria-label="Operator" value={c.operator} onChange={(e) => setConditions(conditions.map((x, k) => (k === i ? { ...x, operator: e.target.value } : x)))} className={input}>
              <option value="eq">exactly</option>
              <option value="in">one of</option>
              <option value="neq">not</option>
            </select>
            <input aria-label="Value" value={c.value ?? ""} placeholder={c.field === "resource.category" ? "sports" : c.field === "actor.position" ? "executive-member" : "value"} onChange={(e) => setConditions(conditions.map((x, k) => (k === i ? { ...x, value: e.target.value } : x)))} className={input} />
            <Button type="button" variant="ghost" size="sm" onClick={() => setConditions(conditions.filter((_, k) => k !== i))}>Remove</Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setConditions([...conditions, { field: "resource.category", operator: "eq", value: "", group: 0 }])}>Add a condition</Button>
      </fieldset>
      <Field name="message" label="Message (optional)" type="textarea" rows={2} placeholder="Please assign a photographer." />
    </ActionForm>
  );
}
