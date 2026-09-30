"use client";

import { useId, useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AvatarCropper } from "@/components/profile/avatar-cropper";
import { vetPhoto } from "@/components/profile/photo-guard";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { uploadImage } from "@/lib/media/client";
import { cn } from "@/lib/utils";

/**
 * Image picker for admin forms: choose, drop or paste a picture; it's resized in the browser,
 * converted to WebP without location data, uploaded with progress, and its media id goes in a
 * hidden field. `shape="portrait"` (a person's photo) frames it as a square and refuses blank or
 * placeholder pictures. (Background removal is only for a member's own profile photo.)
 */
export function MediaField({ name, label, defaultId, defaultUrl, eventId, shape = "wide" }: {
  name: string;
  label: string;
  defaultId?: string | null;
  defaultUrl?: string | null;
  eventId?: string;
  shape?: "wide" | "portrait";
}) {
  const [id, setId] = useState(defaultId ?? "");
  const [url, setUrl] = useState(defaultUrl ?? "");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [picked, setPicked] = useState<File | null>(null);
  const [confirm, dialog] = useConfirm();
  const input = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const portrait = shape === "portrait";
  const busy = progress !== null;

  async function upload(file: File) {
    setError(null);
    setProgress(0);
    const res = await uploadImage(file, { purpose: eventId ? "event" : "library", eventId, onProgress: (p: number) => setProgress(Math.round(p * 100)) });
    setProgress(null);
    if (res.ok) {
      setId(res.id);
      setUrl(res.url ?? URL.createObjectURL(file));
    } else setError(res.error);
  }

  async function take(file: File | undefined) {
    if (!file || busy) return;
    if (!file.type.startsWith("image/")) return setError("Choose a picture (JPEG, PNG or WebP).");
    if (!portrait) return upload(file);
    const v = await vetPhoto(file, { kind: "profile", stage: "picked", confirm });
    if (!v.ok) return setError(v.error);
    setError(null);
    setPicked(file);
  }

  async function framed(file: File) {
    setPicked(null);
    const v = await vetPhoto(file, { kind: "profile", stage: "framed" });
    if (!v.ok) return setError(v.error);
    await upload(file);
  }

  return (
    <div className="grid gap-1.5"
      onPaste={(e) => { const f = [...e.clipboardData.files].find((x) => x.type.startsWith("image/")); if (f) { e.preventDefault(); void take(f); } }}>
      {dialog}
      <label htmlFor={inputId} className="text-sm font-medium">{label}</label>
      <input type="hidden" name={name} value={id} />
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); void take(e.dataTransfer.files[0]); }}
        className={cn("relative overflow-hidden border bg-muted/40 transition-colors",
          portrait ? "h-32 w-32 rounded-full" : "aspect-video w-full max-w-sm rounded-lg",
          over && "border-primary bg-primary/5 ring-2 ring-primary/30")}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="h-full w-full object-cover" />
        ) : (
          <button type="button" onClick={() => input.current?.click()} disabled={busy}
            className="flex h-full w-full flex-col items-center justify-center gap-1 p-3 text-center text-xs text-muted-foreground hover:text-foreground">
            <UploadCloud className="h-6 w-6" aria-hidden />
            {portrait ? "Add a photo" : "Drop an image here, paste one, or choose a file"}
          </button>
        )}
        {busy && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/80 text-xs font-medium" role="status">
            <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden />
            Uploading{progress ? ` ${progress}%` : "…"}
            {!portrait && <span className="h-1 w-2/3 overflow-hidden rounded-full bg-muted"><span className="block h-full bg-primary transition-all" style={{ width: `${progress ?? 0}%` }} /></span>}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()} disabled={busy} className="min-h-9">
          <ImagePlus className="mr-1.5 h-4 w-4" aria-hidden />{url ? "Change" : "Choose image"}
        </Button>
        {id && (
          <Button type="button" variant="ghost" size="sm" className="min-h-9 text-muted-foreground hover:text-destructive" disabled={busy} onClick={() => { setId(""); setUrl(""); }}>
            <Trash2 className="mr-1.5 h-4 w-4" aria-hidden />Remove
          </Button>
        )}
        <input id={inputId} ref={input} type="file" accept="image/*" className="sr-only" disabled={busy}
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void take(f); }} />
      </div>
      <p className="text-xs text-muted-foreground">
        {portrait ? "Framed as a square. " : ""}Resized in your browser and converted to WebP; location data is removed.
      </p>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      {picked && <AvatarCropper file={picked} onCancel={() => setPicked(null)} onCropped={framed} title="Frame the photo" hint="Drag to move, and zoom until the face fills the circle." />}
    </div>
  );
}
