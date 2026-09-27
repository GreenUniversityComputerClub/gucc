"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { reloadWith } from "@/lib/flash";
import { guessMapping, IMPORT_FIELDS, mapRows, MAX_APPLICATION_IMPORT, type ImportFieldKey } from "@/lib/recruitment/import-fields";
import { readSpreadsheet, type Sheet } from "@/lib/recruitment/spreadsheet";
import type { ImportOutcome } from "@/lib/server/services/recruitment";
import { importApplicationsAction } from "../../actions";

const control = "h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm";
const OUTCOME = { add: "text-emerald-700 dark:text-emerald-300", duplicate: "text-muted-foreground", error: "text-destructive" } as const;

/** Spreadsheet → choose which column is which → preview → import. */
export function ImportApplications({ campaignId, positions }: { campaignId: string; positions: string[] }) {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<Partial<Record<ImportFieldKey, number>>>({});
  const [preview, setPreview] = useState<{ rows: ImportOutcome[]; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const onFile = async (file: File | undefined) => {
    setError(null);
    setPreview(null);
    if (!file) return;
    try {
      const s = await readSpreadsheet(file);
      if (s.rows.length > MAX_APPLICATION_IMPORT) throw new Error(`The file has ${s.rows.length} rows; import at most ${MAX_APPLICATION_IMPORT} at a time.`);
      setSheet(s);
      setFileName(file.name);
      setMapping(guessMapping(s.headers));
    } catch (e) {
      setSheet(null);
      setError(e instanceof Error ? e.message : "Couldn't read that file.");
    }
  };
  const missing = IMPORT_FIELDS.filter((f) => f.required && (mapping[f.key] === undefined || mapping[f.key]! < 0));
  const run = (apply: boolean) => start(async () => {
    setError(null);
    const r = await importApplicationsAction(campaignId, mapRows(sheet!.rows, mapping), apply);
    if (!r.ok) return setError(r.error);
    if (apply) return reloadWith(r.data!.message);
    setPreview({ rows: r.data!.rows, message: r.data!.message });
  });

  return (
    <div className="space-y-4 text-sm">
      <p className="text-muted-foreground">
        CSV, JSON or Excel (.xlsx), for example a Google Forms export. Positions must match one offered here ({positions.join(", ")}). Imported applications have no documents attached.
      </p>
      <input type="file" accept=".csv,.json,.xlsx,text/csv,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => onFile(e.target.files?.[0])}
        className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm" aria-label="Spreadsheet file" />
      {sheet && (
        <>
          <p><strong>{fileName}</strong>: {sheet.rows.length} row{sheet.rows.length === 1 ? "" : "s"}, {sheet.headers.length} columns. Check which column holds each detail:</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {IMPORT_FIELDS.map((f) => (
              <label key={f.key} className="grid gap-1">
                <span className="text-xs font-medium">{f.label}{f.required ? <span className="text-destructive"> *</span> : null}</span>
                <select className={control} value={mapping[f.key] ?? -1} onChange={(e) => { setMapping({ ...mapping, [f.key]: Number(e.target.value) }); setPreview(null); }}>
                  <option value={-1}>{f.required ? "Choose a column…" : "Not in this file"}</option>
                  {sheet.headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                </select>
              </label>
            ))}
          </div>
          {missing.length > 0 && <p className="text-amber-700 dark:text-amber-300">Still needed: {missing.map((f) => f.label).join(", ")}.</p>}
          <Button type="button" variant="outline" onClick={() => run(false)} disabled={pending || missing.length > 0}>{pending && !preview ? "Checking…" : "Preview"}</Button>
        </>
      )}
      {preview && (
        <div className="space-y-3 border-t pt-3">
          <p className="font-medium">{preview.message}</p>
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {preview.rows.map((r) => (
              <li key={r.row} className="flex flex-wrap gap-x-2">
                <span className="text-muted-foreground">Row {r.row}</span><span className="font-medium">{r.name}</span>
                <span className={OUTCOME[r.outcome]}>{r.outcome === "add" ? "will be added" : r.message}</span>
              </li>
            ))}
          </ul>
          <Button type="button" onClick={() => run(true)} disabled={pending || !preview.rows.some((r) => r.outcome === "add")}>
            {pending ? "Importing…" : `Import ${preview.rows.filter((r) => r.outcome === "add").length} application(s)`}
          </Button>
        </div>
      )}
      {error && <p role="alert" className="text-destructive">{error}</p>}
    </div>
  );
}
