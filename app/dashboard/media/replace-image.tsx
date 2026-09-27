"use client";

import { useState } from "react";
import { reloadWith } from "@/lib/flash";
import { uploadImage } from "@/lib/media/client";

/** Upload a new version of an image; everything that uses it shows the new one. */
export function ReplaceImage({ mediaId }: { mediaId: string }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (!window.confirm("Replace this image everywhere it is used? The old version is deleted.")) return;
    setBusy(true);
    setError(null);
    const res = await uploadImage(file, { replaceId: mediaId, onProgress: setProgress });
    setBusy(false);
    if (res.ok) reloadWith("Image replaced. Pages using it show the new version.");
    else setError(res.error);
  }

  return (
    <div className="mt-3">
      <label className="inline-flex cursor-pointer items-center rounded-md border px-3 py-1.5 text-sm hover:bg-muted focus-within:ring-2 focus-within:ring-ring">
        {busy ? `Uploading… ${Math.round(progress * 100)}%` : "Replace image"}
        <input type="file" accept="image/*" className="sr-only" disabled={busy} onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
      </label>
      {error && <p role="alert" className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
