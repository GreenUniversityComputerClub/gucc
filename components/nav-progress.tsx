"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/** Gives up if a navigation never lands (it failed, or was cancelled). */
const GIVE_UP_MS = 15000;

/**
 * A thin bar across the top of the window, from the moment a link to another page is clicked until
 * that page arrives, so a click always answers at once. Decoration only.
 */
export function NavProgress() {
  const pathname = usePathname();
  const [state, setState] = useState<"idle" | "going" | "done">("idle");

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      // Left alone: a click opening a new tab or a download.
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element | null)?.closest?.("a");
      if (!link || !link.href || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
      const url = new URL(link.href);
      if (url.origin === location.origin && url.pathname !== location.pathname) setState("going");
    };
    // On the way down: by the time a click bubbles up here, next/link has already taken it.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // The new page is here: run to the end and fade.
  useEffect(() => {
    setState((s) => (s === "going" ? "done" : s));
  }, [pathname]);

  useEffect(() => {
    if (state === "idle") return;
    const t = setTimeout(() => setState("idle"), state === "done" ? 350 : GIVE_UP_MS);
    return () => clearTimeout(t);
  }, [state]);

  if (state === "idle") return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 print:hidden">
      <div
        className="h-full origin-left bg-gradient-to-r from-primary via-bright to-secondary shadow-[0_0_10px] shadow-bright/60"
        style={state === "going" ? { animation: "nav-progress 8s cubic-bezier(0.1, 0.8, 0.2, 1) forwards" } : { transform: "scaleX(1)", opacity: 0, transition: "transform 0.2s, opacity 0.3s 0.1s" }}
      />
    </div>
  );
}
