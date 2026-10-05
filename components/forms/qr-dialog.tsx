"use client";

import { useEffect, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";

const fileName = (title: string, ext: string) => `${title.replace(/[^\w-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "form"}-qr.${ext}`;

function save(href: string, name: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  a.click();
}

/**
 * A QR code of a page, to put on a poster or a slide: SVG (sharp at any size) or a 1024 px PNG.
 * The QR library loads only when the dialog opens.
 */
export function QrDialog({ open, onOpenChange, url, title, heading = "Scan to open the form" }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** The address the code leads to (absolute). */
  url: string;
  title: string;
  heading?: string;
}) {
  const [svg, setSvg] = useState<{ url: string; markup: string } | null>(null);
  useEffect(() => {
    if (!open || !url || svg?.url === url) return;
    let live = true;
    void import("qrcode")
      .then((q) => q.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" }))
      .then((markup) => live && setSvg({ url, markup }))
      .catch(() => live && setSvg(null));
    return () => {
      live = false;
    };
  }, [open, url, svg?.url]);
  const markup = svg?.url === url ? svg.markup : null;

  const downloadSvg = () => {
    if (!markup) return;
    const href = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" }));
    save(href, fileName(title, "svg"));
    window.setTimeout(() => URL.revokeObjectURL(href), 1000);
  };
  const downloadPng = () => {
    if (!markup) return;
    const img = new Image();
    const href = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" }));
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1024;
      const c = canvas.getContext("2d");
      if (!c) return;
      c.fillStyle = "#fff";
      c.fillRect(0, 0, 1024, 1024);
      c.imageSmoothingEnabled = false;
      c.drawImage(img, 0, 0, 1024, 1024);
      URL.revokeObjectURL(href);
      save(canvas.toDataURL("image/png"), fileName(title, "png"));
    };
    img.src = href;
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-black/60" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[70] w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-popover p-5 text-popover-foreground shadow-xl focus:outline-none">
          <DialogPrimitive.Title className="text-base font-semibold">{heading}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-1 break-words text-sm text-muted-foreground">{title}</DialogPrimitive.Description>
          <div className="mx-auto mt-4 aspect-square w-56 rounded-xl bg-white p-3 [&_svg]:h-full [&_svg]:w-full" role="img" aria-label={`QR code for ${title}`}
            dangerouslySetInnerHTML={markup ? { __html: markup } : undefined} />
          <p className="mt-2 break-all text-center text-xs text-muted-foreground">{url.replace(/^https?:\/\//, "")}</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button onClick={downloadPng} disabled={!markup}>PNG</Button>
            <Button variant="outline" onClick={downloadSvg} disabled={!markup}>SVG</Button>
          </div>
          <DialogPrimitive.Close asChild><Button variant="ghost" className="mt-2 w-full">Close</Button></DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
