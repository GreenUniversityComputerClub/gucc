"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { uploadImage } from "@/lib/media/client";

/**
 * Image picker for admin forms: uploads through the media pipeline (resize,
 * WebP, metadata stripped, validated server-side) and stores the media id in
 * a hidden field.
 */
export function MediaField({ name, label, defaultId, defaultUrl, eventId }: { name: string; label: string; defaultId?: string | null; defaultUrl?: string | null; eventId?: string }) {
  const [id, setId] = useState(defaultId ?? "");
  const [url, setUrl] = useState(defaultUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    const res = await uploadImage(file, { purpose: eventId ? "event" : "library", eventId });
    setBusy(false);
    if (res.ok) {
      setId(res.id);
      setUrl(res.url ?? "");
    } else setError(res.error);
    e.target.value = "";
  }

  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <input type="hidden" name={name} value={id} />
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-32 w-full max-w-sm rounded-md border object-cover" />
      ) : (
        <div className="flex h-32 w-full max-w-sm items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">No image</div>
      )}
      <div className="flex items-center gap-2">
        <label className="inline-flex cursor-pointer items-center rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
          {busy ? "Uploading…" : "Upload image"}
          <input type="file" accept="image/*" className="sr-only" onChange={onFile} disabled={busy} />
        </label>
        {id && <Button type="button" variant="ghost" size="sm" onClick={() => { setId(""); setUrl(""); }}>Remove</Button>}
      </div>
      <p className="text-xs text-muted-foreground">Resized in your browser and converted to WebP; location data is removed.</p>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
