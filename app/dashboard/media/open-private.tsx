"use client";

import { useState } from "react";
import { signedUrlAction } from "./signed-url-action";

/** Opens a private file through a short-lived signed link (issued only if you may read it). */
export function OpenPrivate({ id, label = "Open" }: { id: string; label?: string }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        className="underline"
        onClick={async () => {
          setError(null);
          // Open synchronously (popup blockers), then point it at the signed link.
          const w = window.open("", "_blank");
          if (w) w.opener = null;
          const r = await signedUrlAction(id);
          if (r.ok && r.url) {
            if (w) w.location.href = r.url;
            else window.location.href = r.url;
          } else {
            w?.close();
            setError(r.ok ? "Not available." : r.error);
          }
        }}
      >
        {label}
      </button>
      {error && <span className="text-destructive">{error}</span>}
    </span>
  );
}
