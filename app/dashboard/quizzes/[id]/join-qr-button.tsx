"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Check, Copy, QrCode } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function JoinQrButton({ joinCode, title }: { joinCode: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [src, setSrc] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const joinPath = `/q/${joinCode}`;
  const fullUrl = typeof window !== "undefined" ? `${window.location.origin}${joinPath}` : joinPath;

  useEffect(() => {
    if (!open) return;
    QRCode.toDataURL(fullUrl, { margin: 2, width: 360, errorCorrectionLevel: "M" }).then(setSrc, () => setSrc(null));
  }, [open, fullUrl]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium hover:bg-muted"
      >
        <QrCode className="h-4 w-4" aria-hidden />Join QR
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>Scan with a phone camera or enter code <strong className="font-mono text-foreground">{joinCode}</strong>.</DialogDescription>
          </DialogHeader>
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={`Join QR for ${joinCode}`} width={320} height={320} className="mx-auto w-full max-w-[280px] rounded-lg bg-white p-2" />
          ) : (
            <div className="mx-auto aspect-square w-full max-w-[280px] animate-pulse rounded-lg bg-muted" />
          )}
          <div className="rounded-md bg-muted px-3 py-2 font-mono text-2xl font-bold tracking-widest">{joinCode}</div>
          <button
            type="button"
            onClick={copy}
            className="mx-auto inline-flex min-h-9 items-center gap-1.5 rounded-md border px-3 text-xs hover:bg-muted"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Link copied" : `Copy ${joinPath}`}
          </button>
        </DialogContent>
      </Dialog>
    </>
  );
}
