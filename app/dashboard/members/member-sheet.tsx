"use client";

import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { MoreHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Everything you can do with one member, in a side sheet (a bottom sheet on phones), opened from
 * the row's Actions button: the list itself stays light and easy to scan.
 */
export function MemberSheet({ name, subtitle, children, label = "Actions", className }: { name: string; subtitle?: string; children: React.ReactNode; label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <button type="button" aria-label={`${label} for ${name}`}
          className={cn("inline-flex min-h-10 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}>
          <MoreHorizontal className="h-4 w-4" aria-hidden />{label}
        </button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <DialogPrimitive.Content aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[90dvh] flex-col rounded-t-2xl border bg-background shadow-2xl focus:outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[28rem] sm:rounded-none sm:border-l sm:data-[state=open]:slide-in-from-right sm:data-[state=closed]:slide-out-to-right">
          <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
            <div className="min-w-0">
              <DialogPrimitive.Title className="truncate text-base font-semibold">{name}</DialogPrimitive.Title>
              {subtitle && <p className="truncate text-sm text-muted-foreground">{subtitle}</p>}
            </div>
            <DialogPrimitive.Close className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Close"><X className="h-5 w-5" /></DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
