"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: {
        sitekey: string; callback: (token: string) => void; "expired-callback"?: () => void; "error-callback"?: () => void;
        "timeout-callback"?: () => void; theme?: string; size?: "normal" | "flexible" | "compact";
      }) => string;
      reset: (id?: string) => void;
      remove: (id: string) => void;
    };
  }
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/**
 * Cloudflare Turnstile challenge. Renders nothing when no site key is
 * configured (local development); the server then skips verification too.
 *
 * A token works once: change `resetKey` after every answer from the server (success or error)
 * and the widget issues a fresh one, so a second attempt on the same page works. It fills the
 * width it's given, so it never overflows a phone-sized card.
 */
export function Turnstile({ onToken, resetKey }: { onToken: (token: string | null) => void; resetKey?: unknown }) {
  const ref = useRef<HTMLDivElement>(null);
  const widget = useRef<string | undefined>(undefined);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (!siteKey || !ref.current) return;
    const mount = () => {
      if (!window.turnstile || !ref.current || widget.current) return;
      widget.current = window.turnstile.render(ref.current, {
        sitekey: siteKey, theme: "auto", size: "flexible",
        callback: (t) => onToken(t),
        "expired-callback": () => onToken(null),
        "error-callback": () => onToken(null),
        "timeout-callback": () => onToken(null),
      });
    };
    if (window.turnstile) mount();
    else {
      let s = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT}"]`);
      if (!s) {
        s = document.createElement("script");
        s.src = SCRIPT;
        s.async = true;
        document.head.appendChild(s);
      }
      s.addEventListener("load", mount);
    }
    return () => {
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = undefined;
    };
  }, [siteKey, onToken]);

  // After each server answer: a fresh token for the next try.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    onToken(null);
    if (widget.current && window.turnstile) window.turnstile.reset(widget.current);
  }, [resetKey, onToken]);

  if (!siteKey) return null;
  return <div ref={ref} className="min-h-[65px] w-full" />;
}
