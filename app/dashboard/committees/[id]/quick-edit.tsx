"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { reloadWith } from "@/lib/flash";
import { quickEditAction } from "../../actions";

type Row = { id: string; name: string; title: string; displayName: string; order: number; group: string; stamp?: string };
const cell = "h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm";

/** Edit displayed titles, names and order of many listings, then save once. */
export function QuickEdit({ committeeId, rows }: { committeeId: string; rows: Row[] }) {
  const [draft, setDraft] = useState<Row[]>(rows);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const changed = useMemo(() => draft.filter((d) => {
    const o = rows.find((r) => r.id === d.id)!;
    return o.title !== d.title || o.displayName !== d.displayName || o.order !== d.order;
  }), [draft, rows]);
  const set = (id: string, patch: Partial<Row>) => setDraft(draft.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  const save = () => start(async () => {
    setError(null);
    setErrors({});
    const r = await quickEditAction(committeeId, changed.map((d) => ({ id: d.id, title: d.title, displayName: d.displayName, order: d.order, stamp: d.stamp })));
    if (r.ok) return reloadWith(r.data?.message ?? "Saved.");
    setError(r.error);
    setErrors(r.fields ?? {});
  });
  let lastGroup = "";
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr><th className="pb-2 pr-2 font-medium">Person</th><th className="pb-2 pr-2 font-medium">Displayed title</th><th className="pb-2 pr-2 font-medium">Displayed name (optional)</th><th className="w-24 pb-2 font-medium">Order</th></tr>
          </thead>
          <tbody>
            {draft.map((d) => {
              const heading = d.group !== lastGroup ? (lastGroup = d.group) : null;
              return [
                heading && <tr key={`${d.id}-g`}><td colSpan={4} className="pb-1 pt-3 text-xs font-semibold text-muted-foreground">{heading}</td></tr>,
                <tr key={d.id} className="align-top">
                  <td className="py-1 pr-2"><span className="block pt-2">{d.name}</span>{errors[d.id] && <span role="alert" className="text-xs text-destructive">{errors[d.id]}</span>}</td>
                  <td className="py-1 pr-2"><input aria-label={`Title for ${d.name}`} className={cell} value={d.title} maxLength={120} onChange={(e) => set(d.id, { title: e.target.value })} /></td>
                  <td className="py-1 pr-2"><input aria-label={`Displayed name for ${d.name}`} className={cell} value={d.displayName} maxLength={120} placeholder={d.name} onChange={(e) => set(d.id, { displayName: e.target.value })} /></td>
                  <td className="py-1"><input aria-label={`Order for ${d.name}`} type="number" min={0} max={999} className={cell} value={d.order} onChange={(e) => set(d.id, { order: Number(e.target.value) })} /></td>
                </tr>,
              ];
            })}
          </tbody>
        </table>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={save} disabled={pending || changed.length === 0}>{pending ? "Saving…" : `Save ${changed.length} change${changed.length === 1 ? "" : "s"}`}</Button>
        {changed.length > 0 && <Button type="button" variant="ghost" onClick={() => setDraft(rows)}>Undo changes</Button>}
      </div>
    </div>
  );
}
