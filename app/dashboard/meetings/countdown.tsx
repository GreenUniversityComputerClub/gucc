"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { startsIn } from "./[id]/meeting-live";

/** "Starts in 25 min", "Happening now"… kept current while the page is open. */
export function Countdown({ starts, ends }: { starts: string; ends: string | null }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  if (now === null) return null;
  const label = startsIn(starts, ends, now);
  if (!label) return null;
  const live = label === "Happening now";
  const soon = label.startsWith("Starts in") && label.endsWith("min");
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", live ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : soon ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "bg-muted text-muted-foreground")}>
      {live && <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500 align-middle" aria-hidden />}{label}
    </span>
  );
}
