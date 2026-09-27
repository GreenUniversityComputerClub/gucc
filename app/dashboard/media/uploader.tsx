"use client";

import { useCallback, useState } from "react";
import { reloadWith } from "@/lib/flash";
import { uploadDocument, uploadImage } from "@/lib/media/client";
import { UploadQueue, type UploadHandlers } from "@/components/admin/upload-queue";

export function Uploader() {
  const [visibility, setVisibility] = useState<"PUBLIC" | "PRIVATE" | "RESTRICTED">("PUBLIC");
  const upload = useCallback((file: File, h: UploadHandlers) => file.type === "application/pdf"
    ? uploadDocument(file, { visibility: visibility === "PUBLIC" ? "PRIVATE" : visibility, onProgress: h.onProgress, signal: h.signal })
    : uploadImage(file, { visibility, onProgress: h.onProgress, onPrepared: h.onPrepared, signal: h.signal }), [visibility]);
  // Give people a moment to read the per-file results, then show the updated library.
  const onFinished = useCallback((ok: number) => {
    if (ok > 0) setTimeout(() => reloadWith(`Uploaded ${ok} file${ok === 1 ? "" : "s"}.`), 1500);
  }, []);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm" htmlFor="upload-visibility">New files are</label>
        <select id="upload-visibility" value={visibility} onChange={(e) => setVisibility(e.target.value as typeof visibility)} className="h-9 rounded-md border bg-background px-3 text-sm">
          <option value="PUBLIC">Public</option><option value="PRIVATE">Private</option><option value="RESTRICTED">Restricted</option>
        </select>
      </div>
      <UploadQueue accept="image/*,application/pdf" max={20} label="choose files" upload={upload} onFinished={onFinished}
        hint="Up to 20 at a time, two uploading at once. Photos up to 40 MB are resized in your browser (no visible loss, location data removed); PDFs up to 10 MB are stored privately unless you choose otherwise." />
    </div>
  );
}
