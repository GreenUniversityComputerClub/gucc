"use client";

import { useEffect, useRef } from "react";
import { REACTIONS, REACTION_KEYS, type ReactionKey } from "@/lib/chat/reactions";
import { cn } from "@/lib/utils";

/**
 * The row of reactions that pops up over a message (hover or the smiley button on computers,
 * a long press on phones, R on the keyboard). Arrow keys move between them, Enter picks,
 * Escape closes. The one you already chose is highlighted; picking it again removes it.
 */
export function ReactionBar({ mine, onPick, onClose, align = "start" }: {
  mine: ReactionKey | null;
  onPick: (e: ReactionKey) => void;
  onClose: () => void;
  align?: "start" | "end";
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const first = ref.current?.querySelector<HTMLButtonElement>(mine ? `[data-key="${mine}"]` : "button");
    first?.focus({ preventScroll: true });
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    // After the press that opened it.
    const t = window.setTimeout(() => document.addEventListener("pointerdown", away), 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("pointerdown", away);
    };
  }, [mine, onClose]);

  return (
    <div ref={ref} role="toolbar" aria-label="React to this message"
      onKeyDown={(e) => {
        const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
        const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); buttons[(i + 1) % buttons.length]?.focus(); }
        else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); buttons[(i - 1 + buttons.length) % buttons.length]?.focus(); }
        else if (e.key === "Escape") { e.preventDefault(); onClose(); }
      }}
      className={cn("absolute bottom-full z-20 mb-1.5 flex items-center gap-0.5 rounded-full border bg-popover p-1 shadow-lg",
        "motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-90 motion-safe:slide-in-from-bottom-1 motion-safe:duration-150",
        align === "end" ? "right-0 origin-bottom-right" : "left-0 origin-bottom-left")}>
      {REACTION_KEYS.map((k, i) => (
        <button key={k} type="button" data-key={k} aria-label={REACTIONS[k].label} aria-pressed={mine === k} title={REACTIONS[k].label}
          onClick={() => onPick(k)}
          style={{ animationDelay: `${i * 25}ms` }}
          className={cn("flex h-10 w-10 items-center justify-center rounded-full text-2xl leading-none transition-transform duration-150",
            "hover:-translate-y-1 hover:scale-125 focus-visible:-translate-y-1 focus-visible:scale-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:fade-in",
            mine === k && "bg-primary/15")}>
          <span aria-hidden>{REACTIONS[k].emoji}</span>
        </button>
      ))}
    </div>
  );
}
