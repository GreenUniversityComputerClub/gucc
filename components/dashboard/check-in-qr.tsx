"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { QrCode } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** "Check-in code": a QR code the organisers scan at the door, with the code written under it. */
export function CheckInQr({ code, title }: { code: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!open || src) return;
    QRCode.toDataURL(code, { margin: 1, width: 320, errorCorrectionLevel: "M" }).then(setSrc, () => setSrc(null));
  }, [open, code, src]);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-9 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium hover:bg-muted">
        <QrCode className="h-4 w-4" aria-hidden />Check-in code
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>Show this at the door. Turn your screen brightness up.</DialogDescription>
          </DialogHeader>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {src ? <img src={src} alt={`Check-in QR code for ${title}`} width={320} height={320} className="mx-auto w-full max-w-[280px] rounded-lg bg-white p-2" /> : <div className="mx-auto aspect-square w-full max-w-[280px] animate-pulse rounded-lg bg-muted" />}
          <p className="break-all font-mono text-xs text-muted-foreground">{code}</p>
        </DialogContent>
      </Dialog>
    </>
  );
}
