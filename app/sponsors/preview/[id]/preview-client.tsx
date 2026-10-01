"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eye, Pencil } from "lucide-react";
import type sponsorJson from "@/data/sponsors.json";
import { draftKey, type SponsorshipDraft } from "@/app/dashboard/sponsorships/draft";
import { SponsorsClient } from "../../sponsors-client";

/** The page with a bar saying it's a preview; follows the editor's unsaved edits (same browser). */
export function PreviewClient({ id, title, slug, status, saved, savedAt }: { id: string; title: string; slug: string; status: "ACTIVE" | "INACTIVE"; saved: Record<string, unknown>; savedAt: string }) {
  const [draft, setDraft] = useState<SponsorshipDraft | null>(null);
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    const read = () => {
      try {
        const raw = localStorage.getItem(draftKey(id));
        const d = raw ? (JSON.parse(raw) as SponsorshipDraft) : null;
        // A draft older than what's saved (another browser saved since) isn't worth showing.
        setDraft(d && d.content && typeof d.content === "object" && d.at >= Date.parse(savedAt) ? d : null);
      } catch {
        setDraft(null);
      }
    };
    read();
    const onStorage = (e: StorageEvent) => {
      if (e.key === draftKey(id)) read();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [id, savedAt]);

  const unsaved = Boolean(draft && !draft.saved) && !showSaved;
  const content = (draft && !showSaved ? draft.content : saved) as typeof sponsorJson;
  return (
    <>
      <div role="status" className="sticky top-16 z-40 border-b border-amber-500/30 bg-amber-50/95 text-amber-950 backdrop-blur dark:bg-amber-950/90 dark:text-amber-100">
        <div className="container flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 text-sm">
          <span className="inline-flex items-center gap-1.5 font-semibold"><Eye className="h-4 w-4" aria-hidden />Preview</span>
          <span className="min-w-0 flex-1">
            {title} · {status === "ACTIVE" ? <>public at /sponsors/{slug}</> : "hidden from the site"} · {unsaved ? <strong>showing unsaved edits</strong> : "showing the saved page"}
          </span>
          {draft && !draft.saved && (
            <button type="button" onClick={() => setShowSaved((v) => !v)} className="min-h-9 rounded-md border border-current/30 px-3 text-xs font-medium hover:bg-amber-100 dark:hover:bg-amber-900">
              {showSaved ? "Show unsaved edits" : "Show saved page"}
            </button>
          )}
          <Link href={`/dashboard/sponsorships/${id}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-amber-900 px-3 text-xs font-medium text-amber-50 hover:bg-amber-800 dark:bg-amber-200 dark:text-amber-950">
            <Pencil className="h-3.5 w-3.5" aria-hidden />Edit
          </Link>
        </div>
      </div>
      <SponsorsClient sponsorData={content} />
    </>
  );
}
