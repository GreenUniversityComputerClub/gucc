"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { detectFormat } from "@/lib/executive-import/parse";
import type { ImportPlan, ImportResult, PlanRow, RowAction } from "@/lib/server/services/executive-import";
import { applyImportAction, previewImportAction, type ImportPayload } from "../../actions";
import { ReauthPrompt } from "@/components/admin/ui";

type Choice = { skip?: boolean; profileId?: string };

const MODES: Array<[ImportPayload["mode"], string, string]> = [
  ["insert", "Add new only", "Adds new people and listings. Existing records stay exactly as they are."],
  ["upsert", "Add and update", "Adds new ones and updates the details of people already listed."],
  ["update", "Update existing only", "Only changes details of people already listed; adds no one."],
];

const ACTION_LABEL: Record<RowAction, [string, string]> = {
  create: ["New person", "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"],
  assign: ["New listing", "bg-sky-500/15 text-sky-800 dark:text-sky-300"],
  update: ["Update", "bg-violet-500/15 text-violet-800 dark:text-violet-300"],
  unchanged: ["No change", "bg-muted text-muted-foreground"],
  skip: ["Skipped", "bg-muted text-muted-foreground"],
  blocked: ["Needs attention", "bg-destructive/15 text-destructive"],
};

const input = "h-9 w-full min-w-0 rounded-md border bg-background px-2 text-sm";

export function ImportClient({ committees, defaultCommitteeId }: { committees: Array<{ id: string; name: string; status: string }>; defaultCommitteeId: string }) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [format, setFormat] = useState<"json" | "csv">("json");
  const [mode, setMode] = useState<ImportPayload["mode"]>("insert");
  const [committeeId, setCommitteeId] = useState(defaultCommitteeId);
  const [positionMap, setPositionMap] = useState<Record<string, string>>({});
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [stale, setStale] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reauth, setReauth] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "attention" | "changes">("all");
  const [pending, start] = useTransition();

  const payload = (): ImportPayload => ({ text, format, mode, defaultCommitteeId: committeeId || null, resolutions: { positions: positionMap, rows: choices } });
  const reset = () => {
    setPlan(null);
    setResult(null);
    setError(null);
    setChoices({});
    setPositionMap({});
    setStale(false);
  };
  const changed = () => plan && setStale(true);

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 600_000) {
      setError(`${file.name} is ${Math.round(file.size / 1024)} KB; import at most 600 KB at a time.`);
      return;
    }
    const content = await file.text();
    reset();
    setFileName(file.name);
    setText(content);
    setFormat(detectFormat(file.name, content));
  }

  const preview = () =>
    start(async () => {
      setError(null);
      setResult(null);
      try {
        const r = await previewImportAction(payload());
        if (r.ok) {
          setPlan(r.data ?? null);
          setStale(false);
        } else setError(r.error);
      } catch {
        setError("Could not reach the server. Check your connection and try again.");
      }
    });

  const doImport = (confirmed = false) => {
    if (!plan) return;
    const s = plan.summary;
    const what = [s.newPeople && `${s.newPeople} new ${s.newPeople === 1 ? "person" : "people"}`, s.create + s.assign && `${s.create + s.assign} new listing${s.create + s.assign === 1 ? "" : "s"}`, s.update && `${s.update} update${s.update === 1 ? "" : "s"}`].filter(Boolean).join(", ");
    if (!confirmed && !window.confirm(`Import ${what}? This is recorded in the audit log.`)) return;
    start(async () => {
      setError(null);
      try {
        const r = await applyImportAction({ ...payload(), planHash: plan.planHash });
        if (r.ok) {
          setResult(r.data ?? null);
          setPlan(null);
        } else if (r.code === "REAUTH_REQUIRED") setReauth(r.error);
        else setError(r.error);
      } catch {
        setError("Could not reach the server. Check your connection and try again.");
      }
    });
  };

  const rows = useMemo(() => {
    if (!plan) return [];
    if (filter === "attention") return plan.rows.filter((r) => r.issues.length > 0);
    if (filter === "changes") return plan.rows.filter((r) => ["create", "assign", "update"].includes(r.action));
    return plan.rows;
  }, [plan, filter]);

  if (result) {
    return (
      <div className="space-y-4">
        <div role="status" className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-5">
          <h2 className="text-lg font-semibold">Import complete</h2>
          <p className="mt-1 text-sm">
            {result.created.people} new {result.created.people === 1 ? "person" : "people"}, {result.created.listings} new listing{result.created.listings === 1 ? "" : "s"},{" "}
            {result.updated.listings + result.updated.people} update{result.updated.listings + result.updated.people === 1 ? "" : "s"}; {result.unchanged} unchanged, {result.skipped} skipped.
          </p>
          <p className={`mt-2 text-sm ${result.verify.ok ? "text-emerald-700 dark:text-emerald-300" : "text-destructive"}`}>
            {result.verify.ok
              ? `Verified: all ${result.verify.listings.expected} new listings and ${result.verify.people.expected} new people are in the database.`
              : `Verification found ${result.verify.listings.found} of ${result.verify.listings.expected} listings and ${result.verify.people.found} of ${result.verify.people.expected} people. Check the committee pages and the audit log.`}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {result.committees.map((c) => (
              <Link prefetch={false} key={c.id} href={`/dashboard/committees/${c.id}`} className="rounded-md border bg-background px-3 py-1.5 text-sm hover:bg-muted">Open {c.name}</Link>
            ))}
            <Button variant="outline" size="sm" onClick={() => { reset(); setText(""); setFileName(null); }}>Import another file</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-card p-4 sm:p-5" aria-labelledby="step-file">
        <h2 id="step-file" className="font-semibold">1. Choose the file</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="inline-flex cursor-pointer items-center rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground focus-within:ring-2 focus-within:ring-ring">
              {fileName ? "Choose another file" : "Choose JSON or CSV file"}
              <input type="file" accept=".json,.csv,application/json,text/csv" className="sr-only" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
            {fileName && <p className="text-sm">{fileName} <span className="text-muted-foreground">({format.toUpperCase()}, {Math.round(text.length / 1024) || 1} KB)</span></p>}
            <p className="text-xs text-muted-foreground">
              Examples: <a className="underline" href="/examples/executives-import.json" download>JSON</a> · <a className="underline" href="/examples/executives-import.csv" download>CSV</a>. GUCC&apos;s
              executives.json format (years, campuses, wings) works as is.
            </p>
          </div>
          <details className="text-sm" open={!fileName && !text}>
            <summary className="cursor-pointer text-muted-foreground">…or paste the content</summary>
            <textarea
              aria-label="File content"
              value={text}
              onChange={(e) => { setText(e.target.value); setFileName(null); setFormat(detectFormat(null, e.target.value)); if (plan) setStale(true); }}
              rows={6}
              placeholder='[{ "name": "…", "studentId": "…", "position": "General Secretary", "committee": "2026" }]'
              className="mt-2 w-full rounded-md border bg-background p-2 font-mono text-xs"
            />
          </details>
        </div>
        <FieldReference />
      </section>

      <section className="rounded-xl border bg-card p-4 sm:p-5" aria-labelledby="step-options">
        <h2 id="step-options" className="font-semibold">2. Options</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Committee for rows without one</span>
            <select value={committeeId} onChange={(e) => { setCommitteeId(e.target.value); changed(); }} className={input}>
              <option value="">None: every row must name its committee</option>
              {committees.map((c) => <option key={c.id} value={c.id}>{c.name}{c.status === "CURRENT" ? " (current)" : ""}</option>)}
            </select>
          </label>
          <fieldset className="min-w-0 grid gap-1 text-sm">
            <legend className="font-medium">What to do with people already listed</legend>
            {MODES.map(([value, label, hint]) => (
              <label key={value} className="flex items-start gap-2">
                <input type="radio" name="mode" value={value} checked={mode === value} onChange={() => { setMode(value); changed(); }} className="mt-1" />
                <span><span className="font-medium">{label}</span> <span className="text-muted-foreground">: {hint}</span></span>
              </label>
            ))}
          </fieldset>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={preview} disabled={pending || !text.trim()}>{pending && !plan ? "Checking…" : plan ? "Preview again" : "Preview import"}</Button>
          <span className="text-xs text-muted-foreground">Nothing is saved until you confirm the import.</span>
        </div>
      </section>

      {error && <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
      {reauth && <ReauthPrompt message={reauth} onConfirmed={() => { setReauth(null); doImport(true); }} onCancel={() => setReauth(null)} />}

      {plan && (
        <section className="space-y-4" aria-labelledby="step-review">
          <h2 id="step-review" className="font-semibold">3. Review</h2>
          {plan.fileErrors.length > 0 ? (
            <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{plan.fileErrors.map((e) => <p key={e}>{e}</p>)}</div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">Read as: {plan.shape} · {plan.summary.total} rows.</p>
              <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
                {([
                  ["New people", plan.summary.newPeople],
                  ["New listings", plan.summary.create + plan.summary.assign],
                  ["Updates", plan.summary.update],
                  ["No change", plan.summary.unchanged],
                  ["Skipped", plan.summary.skip],
                  ["Duplicates", plan.summary.duplicates],
                  ["Warnings", plan.summary.warnings],
                  ["Need attention", plan.summary.blocked],
                ] as const).map(([label, n]) => (
                  <div key={label} className={`rounded-lg border p-3 ${label === "Need attention" && n > 0 ? "border-destructive/50 bg-destructive/5" : "bg-card"}`}>
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="text-xl font-semibold">{n}</dd>
                  </div>
                ))}
              </dl>

              {plan.unknownPositions.length > 0 && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
                  <h3 className="text-sm font-semibold">Positions GUCC doesn&apos;t have yet</h3>
                  <p className="text-xs text-muted-foreground">Map each to an existing position (the file&apos;s title is still what the page shows), or create it under Positions first.</p>
                  <ul className="mt-3 space-y-2">
                    {plan.unknownPositions.map((u) => (
                      <li key={u.key} className="grid gap-2 sm:grid-cols-[1fr_16rem] sm:items-center">
                        <span className="text-sm">&ldquo;{u.title}&rdquo; <span className="text-muted-foreground">(row{u.rows.length > 1 ? "s" : ""} {u.rows.join(", ")})</span></span>
                        <select aria-label={`Position for ${u.title}`} value={positionMap[u.key] ?? ""} onChange={(e) => { setPositionMap({ ...positionMap, [u.key]: e.target.value }); changed(); }} className={input}>
                          <option value="">Choose a position…</option>
                          {plan.positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {plan.newUnits.length > 0 && (
                <p className="rounded-md bg-muted/50 p-3 text-sm">New campus/wing tabs will be added: {plan.newUnits.map((u) => `${u.unit} (${u.committee})`).join(", ")}.</p>
              )}

              <div className="flex flex-wrap gap-2 text-sm" role="tablist" aria-label="Filter rows">
                {([["all", `All rows (${plan.rows.length})`], ["attention", `With notes (${plan.rows.filter((r) => r.issues.length).length})`], ["changes", "Changes only"]] as const).map(([k, label]) => (
                  <button key={k} type="button" role="tab" aria-selected={filter === k} onClick={() => setFilter(k)} className={`rounded-full border px-3 py-1 ${filter === k ? "bg-primary text-primary-foreground" : ""}`}>{label}</button>
                ))}
              </div>

              <ul className="space-y-2">
                {rows.map((r) => (
                  <PreviewRow key={r.row} r={r} choice={choices[String(r.row)]} onChoice={(c) => { setChoices({ ...choices, [String(r.row)]: c }); changed(); }} />
                ))}
              </ul>
            </>
          )}

          <div className="sticky bottom-0 z-10 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
            {stale ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm">You changed something since this preview.</span>
                <Button onClick={preview} disabled={pending}>{pending ? "Checking…" : "Preview again"}</Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={() => doImport()} disabled={pending || !plan.canImport}>{pending ? "Importing…" : "Import"}</Button>
                <span className="text-sm text-muted-foreground">
                  {plan.canImport
                    ? "Everything above is applied in one step, or nothing is."
                    : plan.summary.blocked
                      ? `Resolve or skip the ${plan.summary.blocked} row${plan.summary.blocked === 1 ? "" : "s"} that need attention, then preview again.`
                      : "Nothing to import: everything is already up to date."}
                </span>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function PreviewRow({ r, choice, onChoice }: { r: PlanRow; choice: Choice | undefined; onChoice: (c: Choice) => void }) {
  const [label, cls] = ACTION_LABEL[r.action];
  const errors = r.issues.filter((i) => i.level === "error");
  const warnings = r.issues.filter((i) => i.level === "warning");
  const showPicker = r.candidates.length > 0 && (r.person?.kind === "existing" && r.person.via === "name" || errors.some((e) => e.code === "AMBIGUOUS_PERSON") || choice?.profileId);
  return (
    <li className={`rounded-lg border bg-card p-3 ${r.action === "blocked" ? "border-destructive/50" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">
            <span className="mr-2 text-xs text-muted-foreground">Row {r.row}</span>
            {r.name ?? <em className="text-muted-foreground">no name</em>}
            {r.studentId && <span className="ml-2 text-xs text-muted-foreground">{r.studentId}</span>}
          </p>
          <p className="text-sm text-muted-foreground">
            {r.positionTitle ?? "no position"}
            {r.position && r.positionTitle && r.position.name !== r.positionTitle ? ` → ${r.position.name}` : ""}
            {r.committee ? ` · ${r.committee.name}` : ""}
            {r.unit ? ` · ${r.unit}` : ""}
            {r.section === "FACULTY" ? " · faculty" : ""}
          </p>
          {r.person?.kind === "existing" && <p className="text-xs">Existing person: {r.person.name} <span className="text-muted-foreground">(matched by {r.person.via})</span></p>}
          {r.changes.length > 0 && r.action !== "create" && <p className="text-xs">Changes: {r.changes.join(", ")}</p>}
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
      </div>
      {r.issues.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs">
          {errors.map((i, n) => <li key={`e${n}`} className="text-destructive">✕ {i.message}</li>)}
          {warnings.map((i, n) => <li key={`w${n}`} className="text-amber-700 dark:text-amber-300">! {i.message}</li>)}
        </ul>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
        {showPicker && (
          <label className="flex min-w-0 items-center gap-2">
            <span className="text-xs text-muted-foreground">Who is this?</span>
            <select
              value={choice?.profileId ?? (r.person?.kind === "existing" ? r.person.profileId : "")}
              onChange={(e) => onChoice({ ...choice, profileId: e.target.value || undefined })}
              className="h-8 min-w-0 max-w-full rounded-md border bg-background px-2 text-sm"
            >
              {r.person?.kind !== "existing" && <option value="">Choose…</option>}
              {r.candidates.map((c) => <option key={c.profileId} value={c.profileId}>{c.name}{c.studentId ? ` (${c.studentId})` : ""}{c.holds ? ` · ${c.holds.slice(0, 60)}` : ""}</option>)}
              <option value="new">A new person</option>
            </select>
          </label>
        )}
        <label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={Boolean(choice?.skip)} onChange={(e) => onChoice({ ...choice, skip: e.target.checked })} /> Skip this row
        </label>
      </div>
    </li>
  );
}

function FieldReference() {
  return (
    <details className="mt-4 text-sm">
      <summary className="cursor-pointer text-muted-foreground">Accepted fields</summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[32rem] text-left text-xs">
          <thead><tr className="border-b"><th className="py-1 pr-3">Field</th><th className="py-1 pr-3">Also accepted as</th><th className="py-1">Notes</th></tr></thead>
          <tbody className="align-top">
            {[
              ["name", "full name", "Required."],
              ["position", "title, role", "Required. Matched to GUCC's positions, including older titles; unknown ones can be mapped in the preview."],
              ["studentId", "student ID, id", "Nine digits. Matches people already on record, so nobody is duplicated."],
              ["committee", "year, term", 'e.g. "2026". Or choose a default committee above.'],
              ["unit", "campus, wing", 'e.g. "gucc", "css", "vgs". Required in committees organised by campus or wing.'],
              ["section", "type", '"faculty" or "student" (default: from the position).'],
              ["email", "mail", "Only used to match an existing account; never shown publicly."],
              ["photo", "avatarUrl, image", "A photo already in the media library (e.g. /executives/232002184.png)."],
              ["bio, designation", "", "Designation is the faculty title, e.g. Lecturer."],
              ["linkedin, github, facebook, twitter, website", "profileUrl", "Full web addresses."],
              ["order, startDate, endDate", "", "Display order; dates as YYYY-MM-DD."],
            ].map(([f, a, n]) => <tr key={f} className="border-b last:border-0"><td className="py-1 pr-3 font-mono">{f}</td><td className="py-1 pr-3">{a}</td><td className="py-1">{n}</td></tr>)}
          </tbody>
        </table>
      </div>
    </details>
  );
}
