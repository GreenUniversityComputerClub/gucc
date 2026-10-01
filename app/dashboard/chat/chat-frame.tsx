"use client";

import { useEffect, useRef } from "react";

/**
 * On computers the messages area fills the window below whatever sits above it (a notice about
 * two-factor sign-in, say), so the message box is never pushed below the screen. Phones size the
 * open conversation themselves (it fills the screen).
 */
export function ChatFrame({ className, children }: { className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const wide = window.matchMedia("(min-width: 1024px)");
    const fit = () => {
      if (!wide.matches) {
        el.style.height = "";
        return;
      }
      const top = el.getBoundingClientRect().top + window.scrollY;
      el.style.height = `${Math.max(420, Math.round(window.innerHeight - top - 24))}px`;
    };
    fit();
    window.addEventListener("resize", fit);
    wide.addEventListener("change", fit);
    return () => {
      window.removeEventListener("resize", fit);
      wide.removeEventListener("change", fit);
    };
  }, []);
  return <div ref={ref} className={className}>{children}</div>;
}
