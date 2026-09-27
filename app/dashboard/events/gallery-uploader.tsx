"use client";

import { useCallback } from "react";
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
  const onFinished = useCallback((ok: number) => {
    if (ok > 0) setTimeout(() => reloadWith("Added to the event."), 1200);
  }, []);
  return (
    <UploadQueue accept="image/*,application/pdf" max={30} label="choose photos or PDFs" upload={upload} onFinished={onFinished}
      hint="Up to 30 at a time. Photos are resized and converted to WebP in your browser, with location data removed; PDFs (schedules, rules) are listed on the event page." />
  );
}
