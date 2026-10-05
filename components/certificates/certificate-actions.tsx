"use client";

import { useState } from "react";
import { Check, Copy, Download, FileImage, Linkedin, Loader2, Printer, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CertificateData, DesignConfig, TemplateKey } from "@/lib/certificates/config";

/**
 * What the holder (or anyone checking) can do: download the PDF or a picture, print, copy or share
 * the link, and add it to LinkedIn. Downloads are made in the browser, from the same design.
 */
export function CertificateActions({ template, config, data, fileName, linkedin }: {
  template: TemplateKey;
  config: DesignConfig;
  data: CertificateData;
  fileName: string;
  /** "Add to profile" on LinkedIn (organisation, month and year issued, the code and this page). */
  linkedin: string;
}) {
  const [busy, setBusy] = useState<"pdf" | "png" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const run = (kind: "pdf" | "png") => async () => {
    setBusy(kind);
    setError(null);
    try {
      const m = await import("@/lib/certificates/export");
      if (kind === "pdf") await m.downloadPdf([{ template, config, data }], `${fileName}.pdf`);
      else await m.downloadPng({ template, config, data }, `${fileName}.png`);
    } catch (e) {
      console.error(e);
      setError("The download couldn't be made in this browser. Try Print → Save as PDF instead.");
    } finally {
      setBusy(null);
    }
  };
  const copy = () => void navigator.clipboard?.writeText(data.verifyUrl).then(() => {
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  });
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: `Certificate: ${data.name}`, url: data.verifyUrl });
        return;
      } catch {
        // dismissed: copying works everywhere
      }
    }
    copy();
  };
  return (
    <div className="print:hidden">
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <Button onClick={run("pdf")} disabled={busy !== null} className="min-h-11 gap-2">
          {busy === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}PDF
        </Button>
        <Button variant="outline" onClick={run("png")} disabled={busy !== null} className="min-h-11 gap-2">
          {busy === "png" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FileImage className="h-4 w-4" aria-hidden />}Picture
        </Button>
        <Button variant="outline" onClick={() => window.print()} className="min-h-11 gap-2"><Printer className="h-4 w-4" aria-hidden />Print</Button>
        <Button variant="outline" onClick={() => void share()} className="min-h-11 gap-2">{copied ? <Check className="h-4 w-4" aria-hidden /> : <Share2 className="h-4 w-4" aria-hidden />}{copied ? "Link copied" : "Share"}</Button>
        <Button asChild variant="outline" className="col-span-2 min-h-11 gap-2 sm:col-span-1">
          <a href={linkedin} target="_blank" rel="noopener noreferrer"><Linkedin className="h-4 w-4" aria-hidden />Add to LinkedIn</a>
        </Button>
        <Button variant="ghost" onClick={copy} className="hidden min-h-11 gap-2 sm:inline-flex"><Copy className="h-4 w-4" aria-hidden />Copy link</Button>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
