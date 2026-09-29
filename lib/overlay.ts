"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * One navigation surface at a time: the site's phone menu, the dashboard menu and the assistant.
 * Opening one closes the others, so two menus (or a menu and the chat) are never open together.
 */
export type OverlayId = "site-menu" | "dashboard-menu" | "chatbot";

let openId: OverlayId | null = null;
const listeners = new Set<(id: OverlayId | null) => void>();

function set(id: OverlayId | null) {
  if (openId === id) return;
  openId = id;
  listeners.forEach((l) => l(id));
}

/** `[open, setOpen]` for one overlay; `setOpen(true)` closes whichever other one is open. */
export function useExclusiveOverlay(id: OverlayId): [boolean, (open: boolean) => void] {
  const [open, setOpenState] = useState(openId === id);
  useEffect(() => {
    const l = (current: OverlayId | null) => setOpenState(current === id);
    listeners.add(l);
    return () => {
      listeners.delete(l);
      if (openId === id) openId = null;
    };
  }, [id]);
  const setOpen = useCallback((o: boolean) => {
    if (o) set(id);
    else if (openId === id) set(null);
  }, [id]);
  return [open, setOpen];
}

/** Close when the viewport grows past a breakpoint where the overlay isn't used (e.g. the phone menu on desktop). */
export function useCloseAbove(minWidthPx: number, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const mq = window.matchMedia(`(min-width: ${minWidthPx}px)`);
    const onChange = () => { if (mq.matches) close(); };
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [minWidthPx, open, close]);
}
