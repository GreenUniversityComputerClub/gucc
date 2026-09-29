"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Plus, Search, X } from "lucide-react";
import { setGrantAction } from "@/app/dashboard/actions";
import { AREA_ORDER, areaOf, describeScope, SCOPE_LABELS } from "@/lib/governance/permission-areas";
import type { ScopeOptions } from "@/lib/server/views/governance";
import { cn } from "@/lib/utils";
import { ReauthPrompt } from "./ui";

type Perm = { key: string; description: string | null; is_sensitive: number };
type Grant = { permission: string; scope: string; scope_value: string };

const input = "h-9 w-full min-w-0 rounded-md border bg-background px-2 text-sm";
const SCOPED = ["OWN", "ASSIGNED", "CATEGORY", "COMMITTEE", "POSITION", "EVENT"] as const;

/**
 * Permissions of one role or position, grouped by area. A tick means "everything"; narrower
 * grants (their own, a category, an event…) are listed under the permission. Changes save at
 * once; sensitive ones added by a non-Moderator wait for a Moderator's approval.
 */
export function PermissionMatrix({
  kind,
  holderId,
  holderName,
  permissions,
  grants,
  canEdit,
  options,
}: {
  kind: "role" | "position";
  holderId: string;
  holderName: string;
  permissions: Perm[];
  grants: Grant[];
  canEdit: boolean;
  options: ScopeOptions;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [local, setLocal] = useState<Grant[]>(grants);
  // After a save the page refreshes: show what the server now holds, not the optimistic guess.
  useEffect(() => setLocal(grants), [grants]);
  const [q, setQ] = useState("");
  const [onlyGranted, setOnlyGranted] = useState(false);
  // Plain language by default; permission codes and narrower scopes only on request.
  const [advanced, setAdvanced] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [reauth, setReauth] = useState<{ message: string; retry: () => void } | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [scope, setScope] = useState<string>("OWN");
  const [values, setValues] = useState<string[]>([]);

  const names = useMemo(() => {
    const m: Record<string, string> = {};
    for (const list of [options.categories, options.committees, options.positions, options.events]) for (const o of list) m[o.value] = o.label;
    return m;
  }, [options]);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const shown = permissions.filter((p) => {
      if (onlyGranted && !local.some((g) => g.permission === p.key)) return false;
      return !needle || p.key.toLowerCase().includes(needle) || (p.description ?? "").toLowerCase().includes(needle);
    });
    const byArea = new Map<string, Perm[]>();
    for (const p of shown) byArea.set(areaOf(p.key), [...(byArea.get(areaOf(p.key)) ?? []), p]);
    return AREA_ORDER.filter((a) => byArea.has(a)).map((a) => ({ area: a, perms: byArea.get(a)! }));
  }, [permissions, local, q, onlyGranted]);

  function change(grant: Grant, add: boolean, confirmed = false) {
    const perm = permissions.find((p) => p.key === grant.permission);
    if (add && !confirmed && perm?.is_sensitive && !window.confirm(`"${perm.description ?? perm.key}" is a sensitive permission. Give it to everyone who holds ${holderName}? Unless you're a Moderator, the President or the General Secretary, one of them approves it first.`)) return;
    const before = local;
    const same = (g: Grant) => g.permission === grant.permission && g.scope === grant.scope && g.scope_value === grant.scope_value;
    setLocal(add ? [...local, grant] : local.filter((g) => !same(g)));
    setNotice(null);
    start(async () => {
      const r = await setGrantAction(kind, holderId, { permission: grant.permission, scope: grant.scope, scopeValue: grant.scope_value }, add);
      if (!r.ok) {
        setLocal(before);
        if (r.code === "REAUTH_REQUIRED") setReauth({ message: r.error, retry: () => change(grant, add, true) });
        else setNotice({ ok: false, text: r.error });
        return;
      }
      const data = r.data as { message?: string } | undefined;
      const waiting = typeof data?.message === "string" && data.message.includes("Moderator");
      if (waiting) setLocal(before);
      setNotice({ ok: true, text: data?.message ?? "Saved." });
      router.refresh();
    });
  }

  const scopeChoices = scope === "CATEGORY" ? options.categories : scope === "COMMITTEE" ? options.committees : scope === "POSITION" ? options.positions : scope === "EVENT" ? options.events : [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search permissions</span>
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search permissions" className={cn(input, "pl-8")} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyGranted} onChange={(e) => setOnlyGranted(e.target.checked)} className="h-4 w-4" /> Only what {holderName} has
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} className="h-4 w-4" /> Advanced
        </label>
      </div>
      {notice && (
        <p role="status" className={cn("rounded-md border p-2 text-sm", notice.ok ? "border-emerald-500/40 bg-emerald-500/5" : "border-destructive/50 bg-destructive/5 text-destructive")}>{notice.text}</p>
      )}
      {reauth && <ReauthPrompt message={reauth.message} onConfirmed={() => { const retry = reauth.retry; setReauth(null); retry(); }} onCancel={() => setReauth(null)} />}
      {groups.length === 0 && <p className="text-sm text-muted-foreground">No permissions match.</p>}
      {groups.map(({ area, perms }) => (
        <fieldset key={area} className="rounded-lg border">
          <legend className="ml-3 px-1 text-sm font-semibold">{area}</legend>
          <ul className="divide-y">
            {perms.map((p) => {
              const mine = local.filter((g) => g.permission === p.key);
              const everything = mine.find((g) => g.scope === "ALL");
              const narrower = mine.filter((g) => g.scope !== "ALL");
              const id = `pm-${kind}-${p.key}`;
              return (
                <li key={p.key} className="px-3 py-2.5">
                  <div className="flex items-start gap-3">
                    <input
                      id={id}
                      type="checkbox"
                      className="mt-1 h-4 w-4 shrink-0"
                      checked={Boolean(everything)}
                      disabled={!canEdit || pending}
                      onChange={(e) => change({ permission: p.key, scope: "ALL", scope_value: "" }, e.target.checked)}
                    />
                    <div className="min-w-0 flex-1">
                      <label htmlFor={id} className="text-sm font-medium leading-snug">
                        {p.description ?? p.key}
                        {p.is_sensitive ? (
                          <span className="ml-2 inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400" title="Needs approval by a Moderator, the President or the General Secretary when granted by anyone else">
                            <AlertTriangle className="h-3 w-3" aria-hidden /> sensitive
                          </span>
                        ) : null}
                      </label>
                      {advanced && <p className="font-mono text-[11px] text-muted-foreground">{p.key}</p>}
                      {narrower.length > 0 && (
                        <ul className="mt-1.5 flex flex-wrap gap-1.5">
                          {narrower.map((g) => (
                            <li key={`${g.scope}:${g.scope_value}`} className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2 py-0.5 text-xs">
                              {describeScope(g.scope, g.scope_value, names)}
                              {canEdit && (
                                <button type="button" onClick={() => change(g, false)} disabled={pending} className="-my-1 -mr-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full hover:bg-muted" aria-label={`Remove ${p.key} for ${describeScope(g.scope, g.scope_value, names)}`}>
                                  <X className="h-3 w-3" />
                                </button>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                      {advanced && canEdit && !everything && adding !== p.key && (
                        <button type="button" onClick={() => { setAdding(p.key); setScope("OWN"); setValues([]); }} className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                          <Plus className="h-3 w-3" aria-hidden /> Only part of it
                        </button>
                      )}
                      {adding === p.key && (
                        <div className="mt-2 grid gap-2 rounded-md border bg-muted/30 p-2 sm:grid-cols-[180px_1fr_auto]">
                          <select aria-label="Limit to" value={scope} onChange={(e) => { setScope(e.target.value); setValues([]); }} className={input}>
                            {SCOPED.map((sc) => <option key={sc} value={sc}>{SCOPE_LABELS[sc]}</option>)}
                          </select>
                          {scopeChoices.length > 0 ? (
                            <select aria-label="Which" multiple={scope === "CATEGORY"} value={scope === "CATEGORY" ? values : values[0] ?? ""}
                              onChange={(e) => setValues(scope === "CATEGORY" ? [...e.target.selectedOptions].map((o) => o.value) : [e.target.value])}
                              className={cn(input, scope === "CATEGORY" && "h-24")}>
                              {scope !== "CATEGORY" && <option value="">Choose…</option>}
                              {scopeChoices.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                          ) : (
                            <p className="self-center text-xs text-muted-foreground">{scope === "OWN" ? "Items they created." : "Items they're assigned to."}</p>
                          )}
                          <div className="flex gap-2">
                            <button type="button" disabled={pending || (scopeChoices.length > 0 && values.filter(Boolean).length === 0)}
                              onClick={() => { change({ permission: p.key, scope, scope_value: scope === "OWN" ? "" : scope === "ASSIGNED" ? "" : values.join(",") }, true); setAdding(null); }}
                              className="h-9 rounded-md bg-primary px-3 text-sm text-primary-foreground disabled:opacity-50">Add</button>
                            <button type="button" onClick={() => setAdding(null)} className="h-9 rounded-md border px-3 text-sm">Cancel</button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </fieldset>
      ))}
    </div>
  );
}
