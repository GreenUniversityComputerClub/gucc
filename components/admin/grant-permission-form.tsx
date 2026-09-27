"use client";

import { useId, useState } from "react";
import { ActionForm, Field } from "@/components/admin/ui";
import { grantDirectAction } from "@/app/dashboard/actions";
import { areaOf, SCOPE_LABELS } from "@/lib/governance/permission-areas";
import type { ScopeOptions } from "@/lib/server/views/governance";

const input = "h-9 w-full min-w-0 rounded-md border bg-background px-2 text-sm";

/** Grant one permission to one account, optionally limited in scope and time. */
export function GrantPermissionForm({ userId, permissions, scopes }: {
  userId: string;
  permissions: Array<{ key: string; description: string | null; sensitive: boolean }>;
  scopes: ScopeOptions;
}) {
  const id = useId();
  const [permission, setPermission] = useState("");
  const [scope, setScope] = useState("ALL");
  const [values, setValues] = useState<string[]>([]);
  const choices = scope === "CATEGORY" ? scopes.categories : scope === "COMMITTEE" ? scopes.committees : scope === "POSITION" ? scopes.positions : scope === "EVENT" ? scopes.events : [];
  const chosen = permissions.find((p) => p.key === permission);
  const areas = [...new Set(permissions.map((p) => areaOf(p.key)))];

  return (
    <ActionForm action={grantDirectAction} submitLabel="Grant permission" resetOnSuccess onSuccess={() => { setPermission(""); setScope("ALL"); setValues([]); }}>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="scopeValue" value={scope === "OWN" || scope === "ALL" ? "" : values.join(",")} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5 sm:col-span-2">
          <label htmlFor={`${id}-p`} className="text-sm font-medium">Permission</label>
          <select id={`${id}-p`} name="permission" required value={permission} onChange={(e) => setPermission(e.target.value)} className={input}>
            <option value="">Choose…</option>
            {areas.map((a) => (
              <optgroup key={a} label={a}>
                {permissions.filter((p) => areaOf(p.key) === a).map((p) => (
                  <option key={p.key} value={p.key}>{p.description ?? p.key}{p.sensitive ? " (sensitive)" : ""}</option>
                ))}
              </optgroup>
            ))}
          </select>
          {chosen?.sensitive && <p className="text-xs text-amber-700 dark:text-amber-400">Sensitive: unless you&apos;re a Moderator, a Moderator approves this first.</p>}
        </div>
        <div className="grid gap-1.5">
          <label htmlFor={`${id}-s`} className="text-sm font-medium">Limited to</label>
          <select id={`${id}-s`} name="scope" value={scope} onChange={(e) => { setScope(e.target.value); setValues([]); }} className={input}>
            {Object.entries(SCOPE_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </div>
        {choices.length > 0 ? (
          <div className="grid gap-1.5">
            <label htmlFor={`${id}-v`} className="text-sm font-medium">Which</label>
            <select id={`${id}-v`} multiple={scope === "CATEGORY"} required value={scope === "CATEGORY" ? values : values[0] ?? ""}
              onChange={(e) => setValues(scope === "CATEGORY" ? [...e.target.selectedOptions].map((o) => o.value) : [e.target.value])}
              className={`${input} ${scope === "CATEGORY" ? "h-24" : ""}`}>
              {scope !== "CATEGORY" && <option value="">Choose…</option>}
              {choices.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        ) : <div />}
        <Field name="expiresAt" label="Until (optional)" type="date" />
        <Field name="reason" label="Reason" placeholder="e.g. Photographer for Tech Fest" />
      </div>
    </ActionForm>
  );
}
