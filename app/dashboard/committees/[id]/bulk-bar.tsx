"use client";

import { ReauthPrompt } from "@/components/admin/ui";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { reloadWith } from "@/lib/flash";
import type { BulkPlan } from "@/lib/server/services/executive-bulk";
import { bulkApplyAction, bulkPreviewAction, type BulkPayload } from "../../actions";
import { useConfirm } from "@/components/ui/confirm-dialog";

type Op = BulkPayload["action"]["op"];
const control = "h-9 min-w-0 rounded-md border bg-background px-2 text-sm";

/**
 * Change several listings at once. Listings are picked with the checkboxes on each row
 * (data-bulk-id); every change is previewed first and applied only on confirmation.
 */
export function BulkBar({ committeeId, positions, committees, canAssign, canRemove }: {
  committeeId: string;
  positions: Array<{ id: string; name: string; isProtected: boolean }>;
  committees: Array<{ id: string; name: string; status: string }>;
  canAssign: boolean;
  canRemove: boolean;
}) {
  const [count, setCount] = useState(0);
  const [op, setOp] = useState<Op | "">("");
  const [positionId, setPositionId] = useState("");
  const [keepTitles, setKeepTitles] = useState(false);
  const [target, setTarget] = useState(committees.find((c) => c.status === "UPCOMING")?.id ?? "");
  const [plan, setPlan] = useState<BulkPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reauth, setReauth] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [confirmBulk, confirmDialog] = useConfirm();

  const selected = () => Array.from(document.querySelectorAll<HTMLInputElement>("input[data-bulk-id]:checked")).map((i) => i.value);
  useEffect(() => {
    const onChange = (e: Event) => {
      if (e.target instanceof HTMLInputElement && e.target.matches("input[data-bulk-id]")) {
        setCount(selected().length);
        setPlan(null);
      }
    };
    document.addEventListener("change", onChange);
    return () => document.removeEventListener("change", onChange);
  }, []);

  const toggleAll = (on: boolean) => {
    document.querySelectorAll<HTMLInputElement>("input[data-bulk-id]").forEach((i) => (i.checked = on));
    setCount(on ? selected().length : 0);
    setPlan(null);
  };
  const payload = (): BulkPayload => ({ committeeId, ids: selected(), action: { op: op as Op, positionId, keepTitles, targetCommitteeId: target } });
  const ready = op === "sort" || (count > 0 && op !== "" && (op !== "position" || positionId) && (op !== "copy" || target));

  const preview = () =>
    start(async () => {
      setError(null);
      try {
        const r = await bulkPreviewAction(payload());
        if (r.ok) setPlan(r.data ?? null);
        else setError(r.error);
      } catch {
        setError("Could not reach the server. Check your connection and try again.");
      }
    });
  const apply = async (confirmed = false) => {
    if (!plan || (!confirmed && !(await confirmBulk({ title: `${plan.title}: change ${plan.changes} listing${plan.changes === 1 ? "" : "s"}?`, description: "This is recorded in the audit log.", confirmLabel: "Apply" })))) return;
    start(async () => {
      try {
        const r = await bulkApplyAction(payload());
        if (r.ok) reloadWith(r.data?.message ?? "Done.");
        // Moving people into sensitive positions asks for the password first, then continues.
        else if (r.code === "REAUTH_REQUIRED") setReauth(r.error);
        else setError(r.error);
      } catch {
        setError("Could not reach the server. Check your connection and try again.");
      }
    });
  };

  const ops: Array<[Op, string, boolean]> = [
    ["end", "End assignments (kept in history)", canRemove],
    ["remove", "Remove (entered by mistake; restorable for 30 days)", canRemove],
    ["reactivate", "Reactivate ended assignments", canAssign],
    ["position", "Change position…", canAssign],
    ["copy", "Copy to another committee…", canAssign && committees.length > 0],
    ["sort", count ? "Sort selected groups by position rank" : "Sort whole committee by position rank", canAssign],
  ];

  return (
    <div className="mb-4 rounded-xl border bg-card p-3 sm:p-4">
      {confirmDialog}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{count ? `${count} selected` : "Bulk changes"}</span>
        <Button type="button" variant="ghost" size="sm" onClick={() => toggleAll(count === 0)}>{count ? "Clear selection" : "Select all"}</Button>
        <select aria-label="Bulk action" value={op} onChange={(e) => { setOp(e.target.value as Op | ""); setPlan(null); }} className={`${control} w-full sm:w-auto`}>
          <option value="">Choose an action…</option>
          {ops.filter(([, , ok]) => ok).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>
        {op === "position" && (
          <>
            <select aria-label="New position" value={positionId} onChange={(e) => { setPositionId(e.target.value); setPlan(null); }} className={`${control} w-full sm:w-56`}>
              <option value="">Choose a position…</option>
              {positions.map((p) => <option key={p.id} value={p.id}>{p.name}{p.isProtected ? " (Moderators, President, General Secretary)" : ""}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={keepTitles} onChange={(e) => { setKeepTitles(e.target.checked); setPlan(null); }} /> Keep displayed titles</label>
          </>
        )}
        {op === "copy" && (
          <select aria-label="Copy to committee" value={target} onChange={(e) => { setTarget(e.target.value); setPlan(null); }} className={`${control} w-full sm:w-64`}>
            <option value="">Choose a committee…</option>
            {committees.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.status.toLowerCase()})</option>)}
          </select>
        )}
        {op && <Button type="button" size="sm" onClick={preview} disabled={pending || !ready}>{pending && !plan ? "Checking…" : "Preview"}</Button>}
      </div>
      {!op && !count && <p className="mt-1 text-xs text-muted-foreground">Tick listings below to end, remove, reactivate, re-position or copy several at once. You&apos;ll see every change before it happens.</p>}
      {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
      {reauth && <ReauthPrompt message={reauth} onConfirmed={() => { setReauth(null); apply(true); }} onCancel={() => setReauth(null)} />}
      {plan && (
        <div className="mt-3 border-t pt-3">
          <p className="text-sm font-medium">{plan.title}</p>
          <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto text-sm">
            {plan.items.map((i) => (
              <li key={i.id} className="flex flex-wrap gap-x-2">
                <span className="font-medium">{i.name}</span>
                <span className="text-muted-foreground">{i.title}</span>
                {i.change ? <span className="text-emerald-700 dark:text-emerald-300">{i.change}</span> : <span className="text-amber-700 dark:text-amber-300">not changed: {i.blocked}</span>}
              </li>
            ))}
            {plan.items.length === 0 && <li className="text-muted-foreground">Nothing to change.</li>}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button type="button" onClick={() => apply()} disabled={pending || !plan.canApply}>{pending ? "Applying…" : `Apply to ${plan.changes} listing${plan.changes === 1 ? "" : "s"}`}</Button>
            {plan.blocked > 0 && <span className="text-xs text-muted-foreground">{plan.blocked} will be left as they are.</span>}
          </div>
        </div>
      )}
    </div>
  );
}
