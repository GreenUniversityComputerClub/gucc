"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { Reply } from "lucide-react";
import { REACTIONS, REACTION_KEYS, type ReactionKey } from "@/lib/chat/reactions";
import { dhakaDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";

export interface SheetAction {
  key: string;
  label: string;
  icon: typeof Reply;
  danger?: boolean;
  run: () => void;
}

/**
 * Phones: everything you can do with a message in one sheet from the bottom of the screen, opened
 * with a long press (as messaging apps do): the message itself, a large row of reactions, and
 * Reply, Copy, Edit, Message privately, Report or Delete. One tap does it and closes the sheet;
 * swipe down, tap outside or press Back to close.
 */
export function MessageSheet({ open, onOpenChange, preview, at, mine, actions, onReact }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  preview: string;
  at: string;
  mine: ReactionKey | null;
  actions: SheetAction[];
  onReact: (e: ReactionKey) => void;
}) {
  const close = () => onOpenChange(false);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <DialogPrimitive.Content
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto overscroll-contain rounded-t-3xl border-t bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 shadow-2xl focus:outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:duration-200"
        >
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted-foreground/30" aria-hidden />
          <DialogPrimitive.Title className="sr-only">Message options</DialogPrimitive.Title>
          <DialogPrimitive.Description asChild>
            <div className="mb-3 rounded-2xl bg-muted/60 px-3 py-2">
              <p className="line-clamp-3 whitespace-pre-wrap break-words text-sm">{preview}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{dhakaDateTime(at)}</p>
            </div>
          </DialogPrimitive.Description>
          <div className="mb-3 flex justify-between gap-1 rounded-2xl border bg-card p-1.5" role="group" aria-label="React">
            {REACTION_KEYS.map((k) => (
              <button key={k} type="button" aria-label={REACTIONS[k].label} aria-pressed={mine === k}
                onClick={() => { onReact(k); close(); }}
                className={cn("flex h-12 flex-1 items-center justify-center rounded-xl text-2xl transition-transform active:scale-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  mine === k ? "bg-primary/15 ring-1 ring-primary/40" : "hover:bg-muted")}>
                {REACTIONS[k].emoji}
              </button>
            ))}
          </div>
          <ul className="overflow-hidden rounded-2xl border bg-card">
            {actions.map((a) => (
              <li key={a.key} className="border-b last:border-b-0">
                <button type="button" onClick={() => { close(); window.setTimeout(a.run, 120); }}
                  className={cn("flex min-h-12 w-full items-center gap-3 px-4 text-left text-[15px] active:bg-muted focus-visible:bg-muted focus-visible:outline-none", a.danger && "text-destructive")}>
                  <a.icon className="h-5 w-5 shrink-0" aria-hidden />{a.label}
                </button>
              </li>
            ))}
          </ul>
          <DialogPrimitive.Close className="mt-3 flex min-h-12 w-full items-center justify-center rounded-2xl border bg-card text-[15px] font-medium active:bg-muted">Cancel</DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

