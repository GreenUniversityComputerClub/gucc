"use client";

/**
 * A certificate's look and words: the design (seven templates, each shown as a small preview),
 * the wording with placeholders, the signatories (with an uploaded signature or the name in a
 * script hand), the logos in the corners, and the QR code. Used when issuing and when saving a
 * design for later.
 */
import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, ImagePlus, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadImage } from "@/lib/media/client";
import { cn } from "@/lib/utils";
import { CertificateSvg } from "@/lib/certificates/render";
import { TEMPLATE_INFO, TEMPLATES, type CertificateData, type DesignConfig, type Signatory, type TemplateKey } from "@/lib/certificates/config";

const input = "h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base md:h-9 md:text-sm";
const label = "grid gap-1 text-xs font-medium";

export const SAMPLE: CertificateData = {
  name: "Nusrat Jahan Mim", role: "General Secretary", event: "CSE Carnival 2026", title: "CSE Carnival 2026", rank: "1st place", team: "Null Pointers",
  date: "12 October 2026", code: "GUCC-7K3M-Q9TB-X2HD-PV4E", verifyUrl: "https://gucc.green.edu.bd/c/7K3MQ9TBX2HDPV4E",
};

/** Upload a picture (logo or signature) to the media library. */
function PictureButton({ onPicked, label: text, alt }: { onPicked: (url: string) => void; label: string; alt: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-grid gap-1">
      <label className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-sm hover:bg-muted md:min-h-9">
        <ImagePlus className="h-4 w-4" aria-hidden />{busy ? "Uploading…" : text}
        <input type="file" accept="image/png,image/webp,image/jpeg" className="sr-only" disabled={busy} onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setBusy(true);
          setError(null);
          const r = await uploadImage(f, { alt });
          setBusy(false);
          if (!r.ok || !r.url) return setError(r.ok ? "No address came back." : r.error);
          onPicked(r.url);
        }} />
      </label>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}

function LogoSelect({ value, onChange, side }: { value: string | null; onChange: (v: string | null) => void; side: string }) {
  const custom = value && value !== "gucc" && value !== "gub";
  return (
    <div className={label}>
      {side} logo
      <div className="flex flex-wrap items-center gap-2">
        <select className={cn(input, "w-auto")} value={custom ? "custom" : value ?? ""} onChange={(e) => onChange(e.target.value === "custom" ? value : e.target.value || null)} aria-label={`${side} logo`}>
          <option value="gucc">GUCC seal</option>
          <option value="gub">Green University</option>
          <option value="">None</option>
          {custom && <option value="custom">Your picture</option>}
        </select>
        <PictureButton label="Upload" alt={`${side} certificate logo`} onPicked={onChange} />
      </div>
    </div>
  );
}

export function TemplatePicker({ value, onChange, config }: { value: TemplateKey; onChange: (t: TemplateKey) => void; config: DesignConfig }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold">Design</legend>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {TEMPLATES.map((t) => (
          <button key={t} type="button" onClick={() => onChange(t)} aria-pressed={value === t}
            className={cn("group overflow-hidden rounded-xl border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", value === t ? "border-primary ring-2 ring-primary/40" : "hover:border-primary/50")}>
            <span className="block bg-muted/40">
              <CertificateSvg template={t} config={config} data={SAMPLE} id={`pick-${t}`} className="block h-auto w-full" />
            </span>
            <span className="flex items-center justify-between gap-2 px-2.5 py-2 text-sm font-medium">
              {TEMPLATE_INFO[t].name}{value === t && <Check className="h-4 w-4 text-primary" aria-hidden />}
            </span>
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{TEMPLATE_INFO[value].hint}</p>
    </fieldset>
  );
}

/** The wording, signatories, logos and options. */
export function DesignFields({ config, setConfig }: { config: DesignConfig; setConfig: (c: DesignConfig) => void }) {
  const set = <K extends keyof DesignConfig>(k: K, v: DesignConfig[K]) => setConfig({ ...config, [k]: v });
  const setSig = (i: number, patch: Partial<Signatory>) => set("signatories", config.signatories.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>Heading<input className={input} maxLength={40} value={config.heading} onChange={(e) => set("heading", e.target.value)} /></label>
        <label className={label}>Under it<input className={input} maxLength={60} value={config.subheading} onChange={(e) => set("subheading", e.target.value)} /></label>
        <label className={cn(label, "sm:col-span-2")}>Before the name<input className={input} maxLength={120} value={config.intro} onChange={(e) => set("intro", e.target.value)} /></label>
        <label className={cn(label, "sm:col-span-2")}>
          After the name
          <textarea className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-base md:text-sm" maxLength={400} value={config.body} onChange={(e) => set("body", e.target.value)} />
          <span className="font-normal text-muted-foreground">Fills in: {"{role} {event} {date} {rank} {team} {name}"}. Each person&apos;s own sentence (if you add one) replaces it.</span>
        </label>
        <label className={cn(label, "sm:col-span-2")}>Organisation line<input className={input} maxLength={80} value={config.org} onChange={(e) => set("org", e.target.value)} /></label>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Signatories</legend>
        {config.signatories.map((s, i) => (
          <div key={i} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-3">
            <label className={label}>Name<input className={input} value={s.name} maxLength={60} onChange={(e) => setSig(i, { name: e.target.value })} /></label>
            <label className={label}>Title<input className={input} value={s.title} maxLength={80} onChange={(e) => setSig(i, { title: e.target.value })} /></label>
            <label className={label}>Organisation<input className={input} value={s.org ?? ""} maxLength={80} onChange={(e) => setSig(i, { org: e.target.value || undefined })} /></label>
            <div className="flex flex-wrap items-center gap-2 sm:col-span-3">
              {s.signature
                // eslint-disable-next-line @next/next/no-img-element -- an uploaded signature preview
                ? <img src={s.signature} alt={`${s.name}'s signature`} className="h-10 max-w-40 rounded border bg-white object-contain p-1" />
                : <span className="text-xs text-muted-foreground">No signature picture: the name is written in a script hand.</span>}
              <PictureButton label={s.signature ? "Replace signature" : "Upload signature"} alt={`${s.name} signature`} onPicked={(url) => setSig(i, { signature: url })} />
              {s.signature && <Button type="button" variant="ghost" size="sm" className="min-h-10" onClick={() => setSig(i, { signature: null })}>Remove picture</Button>}
              <Button type="button" variant="ghost" size="sm" className="ml-auto min-h-10 gap-1 text-destructive" disabled={config.signatories.length <= 1}
                onClick={() => set("signatories", config.signatories.filter((_, k) => k !== i))}><Trash2 className="h-4 w-4" aria-hidden />Remove</Button>
            </div>
          </div>
        ))}
        {config.signatories.length < 3 && (
          <Button type="button" variant="outline" size="sm" className="min-h-10 gap-1" onClick={() => set("signatories", [...config.signatories, { name: "", title: "" }])}>
            <Plus className="h-4 w-4" aria-hidden />Add a signatory
          </Button>
        )}
        <p className="text-xs text-muted-foreground">A transparent PNG of the signature looks best. Two signatories leave room for the medal in some designs.</p>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">Logos</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <LogoSelect side="Left" value={config.logos.left} onChange={(v) => set("logos", { ...config.logos, left: v })} />
          <LogoSelect side="Right" value={config.logos.right} onChange={(v) => set("logos", { ...config.logos, right: v })} />
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
          <span className="min-w-0 flex-1 text-sm">
            <span className="block font-medium">Club seal</span>
            <span className="block text-xs text-muted-foreground">Used in the crest, medal, band and background mark. Replace it with another seal or logo.</span>
          </span>
          {config.seal && (
            // eslint-disable-next-line @next/next/no-img-element -- an uploaded seal preview
            <img src={config.seal} alt="Your seal" className="h-12 w-12 rounded border bg-white object-contain p-1" />
          )}
          <PictureButton label={config.seal ? "Replace" : "Use another seal"} alt="Certificate seal" onPicked={(url) => set("seal", url)} />
          {config.seal && <Button type="button" variant="ghost" size="sm" className="min-h-10 gap-1" onClick={() => set("seal", null)}><RotateCcw className="h-4 w-4" aria-hidden />GUCC seal</Button>}
        </div>
        <div className="space-y-2 rounded-lg border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm">
              <span className="block font-medium">More logos ({config.extraLogos.length}/6)</span>
              <span className="block text-xs text-muted-foreground">Partners, sponsors or co-organisers, in a row above the signatures.</span>
            </span>
            {config.extraLogos.length < 6 && <PictureButton label="Add a logo" alt="Partner logo" onPicked={(url) => set("extraLogos", [...config.extraLogos, url])} />}
          </div>
          {config.extraLogos.length > 0 && (
            <>
              <ul className="flex flex-wrap gap-2">
                {config.extraLogos.map((href, i) => (
                  <li key={`${href}-${i}`} className="flex items-center gap-1 rounded-lg border bg-white p-1.5">
                    {/* eslint-disable-next-line @next/next/no-img-element -- an uploaded logo preview */}
                    <img src={href} alt={`Logo ${i + 1}`} className="h-10 w-20 object-contain" />
                    <span className="flex flex-col">
                      <button type="button" className="rounded p-1 text-slate-600 hover:bg-slate-100 disabled:opacity-30" disabled={i === 0} aria-label="Move left"
                        onClick={() => { const l = [...config.extraLogos]; [l[i - 1], l[i]] = [l[i]!, l[i - 1]!]; set("extraLogos", l); }}><ArrowLeft className="h-3.5 w-3.5" /></button>
                      <button type="button" className="rounded p-1 text-slate-600 hover:bg-slate-100 disabled:opacity-30" disabled={i === config.extraLogos.length - 1} aria-label="Move right"
                        onClick={() => { const l = [...config.extraLogos]; [l[i + 1], l[i]] = [l[i]!, l[i + 1]!]; set("extraLogos", l); }}><ArrowRight className="h-3.5 w-3.5" /></button>
                    </span>
                    <button type="button" className="rounded p-1 text-red-600 hover:bg-red-50" aria-label={`Remove logo ${i + 1}`} onClick={() => set("extraLogos", config.extraLogos.filter((_, k) => k !== i))}><X className="h-4 w-4" /></button>
                  </li>
                ))}
              </ul>
              <label className={label}>Line above them<input className={input} maxLength={60} value={config.extraLogosLabel} onChange={(e) => set("extraLogosLabel", e.target.value)} placeholder="In collaboration with" /></label>
            </>
          )}
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">Background and colours</legend>
        <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
          <span className="min-w-0 flex-1 text-sm">
            <span className="block font-medium">Background picture</span>
            <span className="block text-xs text-muted-foreground">Fills the page behind the frame and text (A4 landscape, 3508 × 2480 is ideal). Lower its strength to keep the text easy to read.</span>
          </span>
          {config.background.image && (
            // eslint-disable-next-line @next/next/no-img-element -- an uploaded background preview
            <img src={config.background.image} alt="Background" className="h-12 w-16 rounded border object-cover" />
          )}
          <PictureButton label={config.background.image ? "Replace" : "Upload"} alt="Certificate background" onPicked={(url) => set("background", { image: url, opacity: config.background.image ? config.background.opacity : 0.25 })} />
          {config.background.image && <Button type="button" variant="ghost" size="sm" className="min-h-10" onClick={() => set("background", { image: null, opacity: 1 })}>Remove</Button>}
          {config.background.image && (
            <label className="flex w-full items-center gap-3 text-xs font-medium">Strength
              <input type="range" min={10} max={100} step={5} value={Math.round(config.background.opacity * 100)} className="flex-1"
                onChange={(e) => set("background", { ...config.background, opacity: Number(e.target.value) / 100 })} />
              <span className="w-10 text-right tabular-nums">{Math.round(config.background.opacity * 100)}%</span>
            </label>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {([["paper", "Paper"], ["primary", "Headings and lines"], ["accent", "Accent"], ["ink", "Text"]] as const).map(([k, l]) => (
            <label key={k} className="flex min-h-10 items-center gap-2 text-sm">
              <input type="color" className="h-9 w-12 cursor-pointer rounded border bg-background p-0.5" value={config.palette?.[k] ?? (k === "paper" ? "#ffffff" : k === "ink" ? "#1f2937" : "#16a34a")}
                onChange={(e) => set("palette", { ...config.palette, [k]: e.target.value })} aria-label={`${l} colour`} />
              {l}
            </label>
          ))}
          {config.palette && Object.keys(config.palette).length > 0 && (
            <Button type="button" variant="ghost" size="sm" className="min-h-10 gap-1" onClick={() => set("palette", {})}><RotateCcw className="h-4 w-4" aria-hidden />The design&apos;s colours</Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
          <span className="min-w-0 flex-1 text-sm">
            <span className="block font-medium">Background mark</span>
            <span className="block text-xs text-muted-foreground">The faint picture behind the name.</span>
          </span>
          <select className={cn(input, "w-auto")} value={config.watermark === "none" ? "none" : config.watermarkImage ? "custom" : "seal"} aria-label="Background mark"
            onChange={(e) => { const v = e.target.value; setConfig({ ...config, watermark: v === "none" ? "none" : "seal", watermarkImage: v === "seal" ? null : config.watermarkImage }); }}>
            <option value="seal">The seal</option>
            {config.watermarkImage && <option value="custom">Your picture</option>}
            <option value="none">None</option>
          </select>
          <PictureButton label="Upload a mark" alt="Certificate background mark" onPicked={(url) => setConfig({ ...config, watermark: "seal", watermarkImage: url })} />
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <label className="flex min-h-10 items-center gap-2"><input type="checkbox" className="h-4 w-4" checked={config.showQr} onChange={(e) => set("showQr", e.target.checked)} />QR code</label>
        <label className="flex min-h-10 items-center gap-2"><input type="checkbox" className="h-4 w-4" checked={config.showCode} onChange={(e) => set("showCode", e.target.checked)} />Code under it</label>
      </div>
    </div>
  );
}
