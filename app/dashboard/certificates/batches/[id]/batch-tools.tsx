"use client";

import { useRef, useState, useTransition } from "react";
import { Download, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { showFlash } from "@/lib/flash";
import { useSoftRefresh } from "@/lib/soft-refresh";
import type { CertificateData, DesignConfig, TemplateKey } from "@/lib/certificates/config";
import { addRecipientsAction } from "../../actions";

/** Every certificate on this page as one PDF (a page each), made in the browser with progress. */
export function DownloadAll({ template, config, items, fileName }: { template: TemplateKey; config: DesignConfig; items: CertificateData[]; fileName: string }) {
  const [done, setDone] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const run = async () => {
    setError(null);
    setDone(0);
    abort.current = new AbortController();
    try {
      const { downloadPdf } = await import("@/lib/certificates/export");
      await downloadPdf(items.map((data) => ({ template, config, data })), fileName, { onProgress: setDone, signal: abort.current.signal });
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError("The PDF couldn't be made in this browser. Try a smaller page of people, or another browser.");
    } finally {
      setDone(null);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {done === null ? (
        <Button type="button" variant="outline" onClick={() => void run()} disabled={!items.length} className="min-h-10 gap-1.5"><Download className="h-4 w-4" aria-hidden />PDF of these {items.length}</Button>
      ) : (
        <>
          <span className="inline-flex min-h-10 items-center gap-2 text-sm" aria-live="polite"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Making the PDF: {done} of {items.length}</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => abort.current?.abort()} className="min-h-10 gap-1"><X className="h-4 w-4" aria-hidden />Cancel</Button>
        </>
      )}
      {error && <p role="alert" className="basis-full text-sm text-destructive">{error}</p>}
    </div>
  );
}

/** Someone was missed: add them to this issue (same design, their own code). */
export function AddPeople({ batchId }: { batchId: string }) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const refresh = useSoftRefresh();
  const submit = () => start(async () => {
    setError(null);
    const people = text.split("\n").map((l) => l.split(/[,\t]/).map((x) => x.trim())).filter((p) => p[0])
      .map(([name, email, role]) => ({ name: name!, email: email && email.includes("@") ? email : null, role: (email && !email.includes("@") ? email : role) || null }));
    const r = await addRecipientsAction(batchId, people).catch(() => null);
    if (!r?.ok) return setError(r && !r.ok ? r.error : "Couldn't add them. Check your connection.");
    showFlash(`Added ${r.data.added}.`);
    setText("");
    setOpen(false);
    refresh();
  });
  if (!open) return <Button type="button" variant="outline" className="min-h-10 gap-1.5" onClick={() => setOpen(true)}><Plus className="h-4 w-4" aria-hidden />Add people</Button>;
  return (
    <div className="w-full space-y-2 rounded-xl border bg-card p-3">
      <label htmlFor="add-people" className="text-sm font-medium">One person per line: Name, email, role</label>
      <textarea id="add-people" className="min-h-24 w-full rounded-md border bg-background px-3 py-2 font-mono text-sm" value={text} onChange={(e) => setText(e.target.value)} placeholder="Rafi Ahmed, rafi@example.com, Volunteer" />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" onClick={submit} disabled={pending || !text.trim()} className="min-h-10">{pending ? "Adding…" : "Add"}</Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)} className="min-h-10">Cancel</Button>
      </div>
    </div>
  );
}
