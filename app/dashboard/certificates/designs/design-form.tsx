"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { showFlash } from "@/lib/flash";
import { CertificateSvg } from "@/lib/certificates/render";
import { defaultConfig, type DesignConfig, type TemplateKey } from "@/lib/certificates/config";
import { DesignFields, SAMPLE, TemplatePicker } from "../design-editor";
import { saveDesignAction } from "../actions";

/** A saved design: its name, template, wording, signatories and logos, with a live preview. */
export function DesignForm({ design }: { design: { id: string; name: string; template: TemplateKey; config: DesignConfig; isDefault: boolean } | null }) {
  const router = useRouter();
  const [name, setName] = useState(design?.name ?? "");
  const [template, setTemplate] = useState<TemplateKey>(design?.template ?? "heritage");
  const [config, setConfig] = useState<DesignConfig>(design?.config ?? defaultConfig("PARTICIPATION"));
  const [isDefault, setDefault] = useState(design?.isDefault ?? false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = () => start(async () => {
    setError(null);
    const r = await saveDesignAction(design?.id ?? null, { name, template, config, isDefault }).catch(() => null);
    if (!r?.ok) return setError(r && !r.ok ? r.error : "Couldn't save. Check your connection.");
    showFlash("Design saved.");
    router.push("/dashboard/certificates?tab=designs");
  });
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_30rem]">
      <div className="min-w-0 space-y-5 rounded-xl border bg-card p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="grid gap-1 text-xs font-medium">Name<input className="h-10 w-full rounded-md border bg-background px-3 text-base md:text-sm" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Club certificates 2026" /></label>
          <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={isDefault} onChange={(e) => setDefault(e.target.checked)} />Use by default</label>
        </div>
        <TemplatePicker value={template} onChange={setTemplate} config={config} />
        <DesignFields config={config} setConfig={setConfig} />
        <div className="flex flex-wrap items-center gap-3 border-t pt-4">
          <Button type="button" onClick={save} disabled={pending || !name.trim()} className="min-h-11 gap-2">{pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}Save design</Button>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
      </div>
      <aside className="min-w-0 xl:sticky xl:top-20 xl:self-start">
        <div className="overflow-hidden rounded-xl border bg-card">
          <h2 className="border-b px-4 py-2 text-sm font-semibold">Preview</h2>
          <div className="bg-muted/40 p-3"><CertificateSvg template={template} config={config} data={SAMPLE} id="design-preview" className="block h-auto w-full rounded shadow" /></div>
        </div>
      </aside>
    </div>
  );
}
