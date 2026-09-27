"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Circle, Clock, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PersonPicker } from "@/components/admin/person-picker";
import type { simulatorOptions, SimulationStep } from "@/lib/server/services/access";
import { simulateAccessAction } from "../../actions";
import { cn } from "@/lib/utils";

type Options = Awaited<ReturnType<typeof simulatorOptions>>;
type Result = Awaited<ReturnType<typeof simulateAccessAction>>;

const control = "h-9 w-full min-w-0 rounded-md border bg-background px-2 text-sm";
const ICON: Record<SimulationStep["status"], React.ReactNode> = {
  pass: <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label="passes" />,
  fail: <XCircle className="h-4 w-4 text-rose-600" aria-label="stops here" />,
  wait: <Clock className="h-4 w-4 text-amber-600" aria-label="waits" />,
  info: <Circle className="h-4 w-4 text-muted-foreground" aria-label="note" />,
};

export function Simulator({ options }: { options: Options }) {
  const [type, setType] = useState("none");
  const [result, setResult] = useState<Result | null>(null);
  const [pending, start] = useTransition();
  const items = type === "post" ? options.posts.map((p) => ({ id: p.id, label: `${p.title} (${p.type.toLowerCase()}, ${p.status.toLowerCase()})` }))
    : type === "event" ? options.events.map((e) => ({ id: e.id, label: `${e.title} (${e.status.toLowerCase()})` }))
    : type === "committee" ? options.committees.map((c) => ({ id: c.id, label: `${c.name} (${c.status.toLowerCase()})` }))
    : [];
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => setResult(await simulateAccessAction(fd)));
  };
  const data = result?.ok ? result.data : null;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <form onSubmit={submit} className="space-y-3 rounded-xl border bg-card p-4">
        <PersonPicker name="userId" label="Person" valueKind="user" withAccount required />
        <label className="grid gap-1.5 text-sm font-medium">Action
          <select name="permission" required className={control} defaultValue="">
            <option value="" disabled>Choose…</option>
            {options.permissions.map((p) => <option key={p.key} value={p.key}>{p.key}{p.is_sensitive ? " (sensitive)" : ""}{p.description ? ` — ${p.description}` : ""}</option>)}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-medium">On
          <select name="resourceType" className={control} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="none">Anything (no particular item)</option>
            <option value="post">A post</option>
            <option value="event">An event</option>
            <option value="committee">A committee</option>
          </select>
        </label>
        {type !== "none" && (
          <label className="grid gap-1.5 text-sm font-medium">Item
            <select name="resourceId" required className={control} defaultValue="">
              <option value="" disabled>Choose…</option>
              {items.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
            </select>
          </label>
        )}
        <Button type="submit" disabled={pending}>{pending ? "Checking…" : "Check access"}</Button>
      </form>
      <div aria-live="polite">
        {result && !result.ok && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{result.error}</p>}
        {data && (
          <section className="rounded-xl border bg-card p-4">
            <p className={cn("inline-flex rounded-full px-3 py-1 text-sm font-semibold",
              data.outcome === "ALLOW" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : data.outcome === "DENY" ? "bg-rose-500/15 text-rose-700 dark:text-rose-300" : "bg-amber-500/15 text-amber-700 dark:text-amber-300")}>
              {data.outcome === "ALLOW" ? "Allowed" : data.outcome === "DENY" ? "Not allowed" : "Needs approval"}
            </p>
            <p className="mt-2 text-sm">{data.summary}</p>
            <p className="mt-1 text-xs text-muted-foreground">{data.permission.key}{data.permission.sensitive ? " (sensitive)" : ""} on {data.resource}</p>
            <ol className="mt-4 space-y-3">
              {data.steps.map((s, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="mt-0.5 shrink-0">{ICON[s.status]}</span>
                  <span><span className="font-medium">{s.label}.</span> <span className="text-muted-foreground">{s.detail}</span></span>
                </li>
              ))}
            </ol>
            <details className="mt-4 text-xs text-muted-foreground">
              <summary className="cursor-pointer">Engine trace</summary>
              <ol className="mt-1 list-decimal pl-5">{data.trace.map((t, i) => <li key={i}>{t}</li>)}</ol>
            </details>
          </section>
        )}
        {!result && <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">The answer and each step appear here.</p>}
      </div>
    </div>
  );
}
