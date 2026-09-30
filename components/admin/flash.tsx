"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import { takeFlash } from "@/lib/flash";

const LINK = /https?:\/\/\S+/;

/**
 * Shows the message left by the last action before its page reload. A message carrying a
 * link (an invitation to pass on, for example) stays until dismissed and can be copied.
 */
export function FlashMessage() {
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const m = takeFlash();
    if (m) setMessage(m);
    // Messages from saves that update the page in place (no reload).
    const on = (e: Event) => { setCopied(false); setMessage(String((e as CustomEvent<string>).detail)); };
    window.addEventListener("gucc:flash", on);
    return () => window.removeEventListener("gucc:flash", on);
  }, []);
  // Long enough to read (about a third of a second per word, at least 6 s); paused while pointed at or focused.
  const [hold, setHold] = useState(false);
  useEffect(() => {
    if (!message || hold || LINK.test(message)) return;
    const t = setTimeout(() => setMessage(null), Math.max(6000, message.split(/\s+/).length * 350));
    return () => clearTimeout(t);
  }, [message, hold]);
  if (!message) return null;
  const link = message.match(LINK)?.[0] ?? null;
  const text = link ? message.replace(link, "").replace(/:\s*$/, ":").trim() : message;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link!);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div role="status" aria-live="polite" onMouseEnter={() => setHold(true)} onMouseLeave={() => setHold(false)} onFocus={() => setHold(true)} onBlur={() => setHold(false)} className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-start gap-3 rounded-lg border border-emerald-500/40 bg-card p-3 text-sm shadow-lg sm:inset-x-auto sm:right-6">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
      <div className="min-w-0 flex-1">
        <p>{text}</p>
        {link && (
          <div className="mt-2 flex items-start gap-2">
            <code className="min-w-0 flex-1 break-all rounded bg-muted px-2 py-1 text-xs">{link}</code>
            <button type="button" onClick={copy} className="inline-flex min-h-9 shrink-0 items-center rounded-md border px-3 text-xs hover:bg-muted">{copied ? "Copied" : "Copy"}</button>
          </div>
        )}
      </div>
      <button type="button" onClick={() => setMessage(null)} aria-label="Dismiss" className="-m-1.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md hover:bg-muted"><X className="h-4 w-4" /></button>
    </div>
  );
}
