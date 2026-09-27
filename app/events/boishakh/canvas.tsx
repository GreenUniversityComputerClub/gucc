"use client";

import { useEffect, useRef } from "react";

export default function BoishakhCanvas({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    import("./scene").then(({ mountScene }) => {
      if (!cancelled && ref.current) cleanup = mountScene(ref.current);
    });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);
  return <canvas ref={ref} className={className} />;
}
