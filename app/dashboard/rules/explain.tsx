"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { PersonPicker } from "@/components/admin/person-picker";
import { explainAction } from "../actions";

type Out = Awaited<ReturnType<typeof explainAction>>;

/** "Why can (or can't) they?" — the engine's decision with its reasoning. Pass `userId` to fix the person. */
export function ExplainTool({ permissions, userId }: { permissions: string[]; userId?: string }) {
  const [state, setState] = useState<Out | null>(null);
  const [pending, start] = useTransition();
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => setState(await explainAction(fd)));
  };
  const data = state?.ok ? (state.data as { decision: { outcome: string; summary: string; trace: string[] }; subject: { roles: string[]; positions: string[]; status: string } }) : null;
  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="grid gap-2 sm:grid-cols-4">
        {userId ? <input type="hidden" name="userId" value={userId} /> : <div className="sm:col-span-4"><PersonPicker name="userId" label="Member" valueKind="user" required /></div>}
        <select name="permission" aria-label="Permission" className="h-9 rounded-md border bg-background px-2 text-sm">
          {permissions.map((p) => <option key={p}>{p}</option>)}
        </select>
        <input name="resourceType" placeholder="Resource type (optional)" aria-label="Resource type" className="h-9 rounded-md border bg-background px-3 text-sm" />
        <input name="category" placeholder="Category (optional)" aria-label="Category" className="h-9 rounded-md border bg-background px-3 text-sm" />
        <Button type="submit" disabled={pending} className="sm:w-fit">{pending ? "Checking…" : "Explain"}</Button>
      </form>
      {state && !state.ok && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
      {data && (
        <div className="rounded-md border p-4 text-sm">
          <p className="font-semibold">{data.decision.outcome === "ALLOW" ? "ALLOWED" : data.decision.outcome === "DENY" ? "ACCESS DENIED" : "NEEDS APPROVAL"}</p>
          <p className="mt-1">{data.decision.summary}</p>
          <p className="mt-2 text-xs text-muted-foreground">Status {data.subject.status} · roles: {data.subject.roles.join(", ") || "none"} · positions: {data.subject.positions.join(", ") || "none"}</p>
          <ol className="mt-2 list-decimal pl-5 text-xs text-muted-foreground">{data.decision.trace.map((t, i) => <li key={i}>{t}</li>)}</ol>
        </div>
      )}
    </div>
  );
}
