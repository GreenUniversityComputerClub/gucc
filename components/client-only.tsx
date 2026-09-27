"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

/*
 * Browser-only visuals, loaded with ssr:false so their libraries (three.js,
 * confetti) stay out of the server Worker bundle, which must fit Cloudflare's
 * size limit. They render nothing meaningful on the server anyway.
 */
const AnimatedBackgroundLazy = dynamic(() => import("./animated-background").then((m) => m.AnimatedBackground), { ssr: false });

/**
 * The hero's particle field starts once the page is idle, so its WebGL set-up (three.js) never
 * competes with the first paint and hydration. It looks the same; it just stops slowing the page
 * down while it loads.
 */
export function AnimatedBackgroundClient() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void });
    if (idle.requestIdleCallback) {
      const id = idle.requestIdleCallback(() => setReady(true), { timeout: 2000 });
      return () => idle.cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(() => setReady(true), 600);
    return () => window.clearTimeout(t);
  }, []);
  return ready ? <AnimatedBackgroundLazy /> : null;
}
export const PohelaBoishakhGreetingClient = dynamic(() => import("./PohelaBoishakhGreeting"), { ssr: false });
