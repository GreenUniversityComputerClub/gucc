"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Check, Download, Link2, MoreHorizontal, QrCode } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * More ways to pass a profile on: copy its link, or show a QR code to scan at an event (and save
 * it as a picture).
 */
export function ProfileTools({ name, path }: { name: string; path: string }) {
  const [qr, setQr] = useState(false);
  const [src, setSrc] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const url = () => new URL(path, window.location.origin).toString();

  useEffect(() => {
    if (!qr || src) return;
    QRCode.toDataURL(url(), { margin: 1, width: 480, errorCorrectionLevel: "M", color: { dark: "#065f46", light: "#ffffff" } }).then(setSrc, () => setSrc(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qr, src]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      /* no clipboard: the QR code still works */
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="icon" className="h-11 w-11 sm:h-10 sm:w-10" aria-label="More options">
            {copied ? <Check className="h-4 w-4" aria-hidden /> : <MoreHorizontal className="h-4 w-4" aria-hidden />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem className="min-h-11 gap-2" onSelect={() => void copy()}><Link2 className="h-4 w-4" aria-hidden />{copied ? "Link copied" : "Copy profile link"}</DropdownMenuItem>
          <DropdownMenuItem className="min-h-11 gap-2" onSelect={() => setQr(true)}><QrCode className="h-4 w-4" aria-hidden />Show QR code</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="sr-only" role="status">{copied ? "Profile link copied" : ""}</span>
      <Dialog open={qr} onOpenChange={setQr}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader>
            <DialogTitle>{name}</DialogTitle>
            <DialogDescription>Scan to open this profile.</DialogDescription>
          </DialogHeader>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {src ? <img src={src} alt={`QR code for ${name}'s profile`} width={480} height={480} className="mx-auto w-full max-w-[280px] rounded-xl bg-white p-3 shadow-sm" /> : <div className="mx-auto aspect-square w-full max-w-[280px] animate-pulse rounded-xl bg-muted" />}
          {src && (
            <Button asChild variant="outline" className="mx-auto min-h-11 gap-2">
              <a href={src} download={`${name.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase()}-gucc-profile.png`}><Download className="h-4 w-4" aria-hidden />Save QR code</a>
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
