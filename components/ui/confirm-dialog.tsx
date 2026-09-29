"use client";

import { useCallback, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface ConfirmOptions {
  title: string;
  /** What will happen, in plain words (who is affected, whether it can be undone). */
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** Ask for a short text too (a reason for the activity log); confirming needs it filled in. */
  input?: { label: string; placeholder?: string; minLength?: number; defaultValue?: string; hint?: string };
}

type Answer = { ok: boolean; value: string };

/**
 * Accessible confirmations instead of the browser's `window.confirm` / `window.prompt` (which
 * in-app browsers and "block pop-ups" can silently suppress).
 *
 *   const [confirm, dialog, ask] = useConfirm();  // render `dialog`
 *   if (await confirm({ title: "Delete this?" })) …
 *   const reason = await ask({ title: "Reset?", input: { label: "Reason" } });  // string or null
 */
export function useConfirm() {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [value, setValue] = useState("");
  const resolver = useRef<((a: Answer) => void) | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();

  const open = useCallback((o: ConfirmOptions) => new Promise<Answer>((resolve) => {
    resolver.current?.({ ok: false, value: "" });
    resolver.current = resolve;
    setValue(o.input?.defaultValue ?? "");
    setOpts(o);
  }), []);

  const confirm = useCallback(async (o: ConfirmOptions) => (await open(o)).ok, [open]);
  const ask = useCallback(async (o: ConfirmOptions & { input: NonNullable<ConfirmOptions["input"]> }) => {
    const a = await open(o);
    return a.ok ? a.value.trim() : null;
  }, [open]);

  const close = (ok: boolean) => {
    resolver.current?.({ ok, value });
    resolver.current = null;
    setOpts(null);
  };

  const needs = opts?.input ? Math.max(1, opts.input.minLength ?? 1) : 0;
  const ready = !opts?.input || value.trim().length >= needs;

  const dialog = (
    <Dialog open={opts !== null} onOpenChange={(o) => { if (!o) close(false); }}>
      <DialogContent className="sm:max-w-md" onOpenAutoFocus={(e) => {
        // The text field when there is one; otherwise the safe choice first.
        e.preventDefault();
        (inputRef.current ?? cancelRef.current)?.focus();
      }}>
        {/* React passes events up through portals: stop the submit here so a dialog opened from
            inside another form (the post editor's image prompt) never submits that form too. */}
        <form onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); if (ready) close(true); }} onInput={(e) => e.stopPropagation()} onChange={(e) => e.stopPropagation()} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{opts?.title}</DialogTitle>
            {opts?.description ? <DialogDescription asChild><div className="space-y-2 text-sm text-muted-foreground">{opts.description}</div></DialogDescription> : null}
          </DialogHeader>
          {opts?.input && (
            <label htmlFor={`${id}-input`} className="grid gap-1.5 text-sm font-medium">
              {opts.input.label}
              <input ref={inputRef} id={`${id}-input`} value={value} onChange={(e) => setValue(e.target.value)} placeholder={opts.input.placeholder} maxLength={500}
                className="h-11 rounded-md border bg-background px-3 text-base font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-10 md:text-sm" />
              {opts.input.hint && <span className="text-xs font-normal text-muted-foreground">{opts.input.hint}</span>}
              {needs > 1 && <span className="text-xs font-normal text-muted-foreground">At least {needs} characters.</span>}
            </label>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button ref={cancelRef} type="button" variant="outline" data-cancel onClick={() => close(false)} className="min-h-11 sm:min-h-10">{opts?.cancelLabel ?? "Cancel"}</Button>
            <Button type="submit" data-confirm-accept={opts?.input ? undefined : ""} disabled={!ready} variant={opts?.destructive ? "destructive" : "default"} className="min-h-11 sm:min-h-10">{opts?.confirmLabel ?? "Continue"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );

  return [confirm, dialog, ask] as const;
}
