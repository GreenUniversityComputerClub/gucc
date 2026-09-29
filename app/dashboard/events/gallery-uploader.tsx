"use client";

import { useCallback, useState } from "react";
import { reloadWith } from "@/lib/flash";
import { uploadDocument, uploadImage } from "@/lib/media/client";
import { UploadQueue, type UploadHandlers } from "@/components/admin/upload-queue";

/**
 * Upload event photos (resized in the browser, validated by the API against the event's
 * scopes) and PDF documents (shown on the event page under Documents).
 */
export function GalleryUploader({ eventId }: { eventId: string }) {
  const upload = useCallback((file: File, h: UploadHandlers) => file.type === "application/pdf"
    ? uploadDocument(file, { visibility: "PUBLIC", eventId, onProgress: h.onProgress, signal: h.signal })
    : uploadImage(file, { purpose: "event", eventId, onProgress: h.onProgress, onPrepared: h.onPrepared, signal: h.signal }), [eventId]);
  const [note, setNote] = useState<string | null>(null);
  // Reload to show the new photos only when nothing failed; otherwise the failed files stay listed to retry.
  const onFinished = useCallback((ok: number, failed: number) => {
    if (ok > 0 && failed === 0) setTimeout(() => reloadWith(`${ok} added to the event.`), 1200);
    else if (ok > 0) setNote(`${ok} added. ${failed} didn't upload: retry them below, then reload the page to see the gallery.`);
  }, []);
  return (
    <>
    {note && <p role="status" className="mb-2 text-sm text-amber-700 dark:text-amber-300">{note} <button type="button" className="underline" onClick={() => reloadWith()}>Reload now</button></p>}
    <UploadQueue accept="image/*,application/pdf" max={30} label="choose photos or PDFs" upload={upload} onFinished={onFinished}
      hint="Up to 30 at a time. Photos are resized and converted to WebP in your browser, with location data removed; PDFs (schedules, rules) are listed on the event page." />
    </>
  );
}
