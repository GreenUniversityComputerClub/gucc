"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ReauthPrompt } from "@/components/admin/ui";
import { reloadWith } from "@/lib/flash";
import { grantRoleBulkAction } from "../actions";

type Plan = { title: string; items: Array<{ id: string; name: string; change: string | null; blocked: string | null }>; changes: number; blocked: number; canApply: boolean };
const control = "h-9 min-w-0 rounded-md border bg-background px-2 text-sm";

/** Tick members in the list (data-member-id), choose a role, preview, then give it to all of them. */
export function GrantRoleBar({ roles }: { roles: Array<{ key: string; name: string }> }) {
  const [count, setCount] = useState(0);
  const [roleKey, setRoleKey] = useState("");
  const [reason, setReason] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reauth, setReauth] = useState<{ message: string; apply: boolean } | null>(null);
  const [pending, start] = useTransition();
  const selected = () => Array.from(document.querySelectorAll<HTMLInputElement>("input[data-member-id]:checked")).map((i) => i.value);
  useEffect(() => {
    const onChange = (e: Event) => {
      if (e.target instanceof HTMLInputElement && e.target.matches("input[data-member-id]")) {
        setCount(selected().length);
        setPlan(null);
      }
    };
    document.addEventListener("change", onChange);
    return () => document.removeEventListener("change", onChange);
  }, []);
  const payload = (apply: boolean) => ({ userIds: selected(), roleKey, reason, expiresAt: expiresAt || undefined, apply });
  const run = (apply: boolean) => start(async () => {
    setError(null);
    const r = await grantRoleBulkAction(payload(apply));
    if (!r.ok) {
      // Remember what was asked: confirming the password repeats that, never more (a preview stays a preview).
      if (r.code === "REAUTH_REQUIRED") return setReauth({ message: r.error, apply });
      return setError(r.error);
    }
    if (apply) return reloadWith(r.data?.message ?? "Done.");
    setPlan(r.data?.plan ?? null);
  });
  if (!count && !plan) return <p className="mb-3 text-xs text-muted-foreground">Tick members below to give several of them a role at once.</p>;
  return (
    <div className="mb-4 rounded-xl border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{count} selected</span>
        <select aria-label="Role" value={roleKey} onChange={(e) => { setRoleKey(e.target.value); setPlan(null); }} className={control}>
          <option value="">Give a role…</option>
          {roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
        </select>
        <input aria-label="Reason" placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} className={`${control} w-48`} />
        <label className="flex items-center gap-1 text-xs">Until <input type="date" aria-label="Until" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className={control} /></label>
        <Button type="button" size="sm" variant="outline" disabled={pending || !roleKey || !count} onClick={() => run(false)}>Preview</Button>
      </div>
      {error && <p role="alert" className="mt-2 text-destructive">{error}</p>}
      {reauth && <ReauthPrompt message={reauth.message} onConfirmed={() => { const apply = reauth.apply; setReauth(null); run(apply); }} onCancel={() => setReauth(null)} />}
      {plan && (
        <div className="mt-3 border-t pt-3">
          <p className="font-medium">{plan.title}</p>
          <ul className="mt-2 max-h-60 space-y-1 overflow-y-auto">
            {plan.items.map((i) => (
              <li key={i.id}><span className="font-medium">{i.name}</span> {i.change ? <span className="text-emerald-700 dark:text-emerald-300">{i.change}</span> : <span className="text-amber-700 dark:text-amber-300">not changed: {i.blocked}</span>}</li>
            ))}
          </ul>
          <Button type="button" className="mt-3" disabled={pending || !plan.canApply} onClick={() => run(true)}>{pending ? "Working…" : `Give it to ${plan.changes} member${plan.changes === 1 ? "" : "s"}`}</Button>
        </div>
      )}
    </div>
  );
}
