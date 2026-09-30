"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, Users } from "lucide-react";
import { AvatarCropper } from "@/components/profile/avatar-cropper";
import { vetPhoto } from "@/components/profile/photo-guard";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { uploadImage } from "@/lib/media/client";
import { mediaHref } from "@/lib/api/config";

/**
 * A group's photo: pick, frame as a square, check it isn't blank, upload. Reports the uploaded
 * file's id (or null when removed); the group is changed only when its form is saved.
 */
export function GroupPhotoField({ url, onChange, disabled }: { url: string | null; onChange: (v: { mediaId: string | null; url: string | null }) => void; disabled?: boolean }) {
  const [picked, setPicked] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, dialog] = useConfirm();
  const input = useRef<HTMLInputElement>(null);

  async function pick(file: File) {
    setError(null);
    const v = await vetPhoto(file, { kind: "group", stage: "picked", confirm });
    if (!v.ok) return setError(v.error);
    setPicked(file);
  }

  async function framed(file: File) {
    setPicked(null);
    setBusy(true);
    const v = await vetPhoto(file, { kind: "group", stage: "framed" });
    if (!v.ok) {
      setBusy(false);
      return setError(v.error);
    }
    const up = await uploadImage(file, { purpose: "group" });
    setBusy(false);
    if (!up.ok) return setError(up.error);
    onChange({ mediaId: up.id, url: up.url ? mediaHref(up.url) : URL.createObjectURL(file) });
  }

  return (
    <div className="flex items-center gap-3">
      {dialog}
      <span className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-primary/10 text-primary">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="h-full w-full object-cover" />
        ) : (
          <Users className="h-7 w-7" aria-hidden />
        )}
        {busy && <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-white" role="status"><Loader2 className="h-5 w-5 animate-spin" aria-label="Uploading" /></span>}
      </span>
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap gap-1.5">
          <button type="button" disabled={disabled || busy} onClick={() => input.current?.click()}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
            <Camera className="h-4 w-4" aria-hidden />{url ? "Change photo" : "Add a photo"}
          </button>
          {url && (
            <button type="button" disabled={disabled || busy} onClick={() => onChange({ mediaId: null, url: null })}
              className="inline-flex min-h-10 items-center rounded-md px-2 text-sm text-muted-foreground hover:bg-muted hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Remove
            </button>
          )}
        </div>
        {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : <p className="text-xs text-muted-foreground">Optional. Everyone in the group sees it.</p>}
      </div>
      <input ref={input} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (f) void pick(f);
      }} />
      {picked && <AvatarCropper file={picked} onCancel={() => setPicked(null)} onCropped={framed} title="Frame the group photo" hint="Drag to move and zoom until it fills the circle." />}
    </div>
  );
}
