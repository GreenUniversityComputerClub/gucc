"use client";

import { createContext, useContext, useEffect, useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { reloadWith } from "@/lib/flash";
import { reauthAction } from "@/app/dashboard/reauth-actions";
import { fieldClass } from "./field-class";
import { useConfirm } from "@/components/ui/confirm-dialog";

export type Result = { ok: true; data?: unknown; message?: string } | { ok: false; error: string; code: string; fields?: Record<string, string>; trace?: string[] };
type ServerAction = (fd: FormData) => Promise<Result>;

const FieldErrors = createContext<Record<string, string>>({});

/**
 * Forms with unsaved changes on this page. Leaving the page (or submitting another form, such
 * as "Publish" next to an edited post) warns first, so typed work is never lost silently.
 */
const unsaved = new Map<symbol, string>();
let leaveGuard = false;
function guardLeaving() {
  if (leaveGuard || typeof window === "undefined") return;
  leaveGuard = true;
  window.addEventListener("beforeunload", (e) => {
    if (unsaved.size === 0) return;
    e.preventDefault();
    e.returnValue = "";
  });
}

/**
 * A form bound to a server action. Shows success, validation errors next to
 * their fields, authorization denials with the engine's explanation, and
 * keeps the button disabled while the action runs. `confirm` asks in an
 * accessible dialog (never the browser's pop-up, which some browsers block).
 */
export function ActionForm({
  action,
  children,
  submitLabel = "Save",
  successMessage = "Saved.",
  redirectTo,
  className,
  confirm,
  variant = "default",
  resetOnSuccess = false,
  inline = false,
  onSuccess,
  submitAriaLabel,
}: {
  action: ServerAction;
  children?: React.ReactNode;
  submitLabel?: string;
  successMessage?: string;
  /** Where to go on success. "{id}" is replaced with the id the action returned. */
  redirectTo?: string;
  className?: string;
  confirm?: string;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost";
  resetOnSuccess?: boolean;
  inline?: boolean;
  /** Called after a successful submit (e.g. to close a dialog or reset client state). */
  onSuccess?: (data: unknown) => void;
  /** A fuller name for the button when several on a page share a label ("Sign out: Chrome on Android"). */
  submitAriaLabel?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const lastData = useRef<FormData | null>(null);
  const [state, setState] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();
  const [ask, askDialog] = useConfirm();
  const me = useRef(Symbol("form"));

  useEffect(() => {
    guardLeaving();
    const id = me.current;
    return () => void unsaved.delete(id);
  }, []);
  const markDirty = () => {
    if (!unsaved.has(me.current)) unsaved.set(me.current, submitLabel);
  };

  // After a refused submit, take the reader to the problem: the first field marked invalid, else the message.
  useEffect(() => {
    if (!state || state.ok || state.code === "REAUTH_REQUIRED") return;
    const form = formRef.current;
    const first = form?.querySelector<HTMLElement>('[aria-invalid="true"]');
    if (first) first.focus();
    else form?.querySelector<HTMLElement>("[data-form-error]")?.focus();
  }, [state]);

  useEffect(() => {
    if (!state?.ok) return;
    unsaved.delete(me.current);
    const data = state.data as { id?: string; message?: string } | undefined;
    const msg = typeof data?.message === "string" ? data.message : state.message ?? successMessage;
    if (onSuccess) {
      // The caller handles what happens next (e.g. a dialog closing), then the page reloads.
      onSuccess(state.data);
    }
    if (resetOnSuccess) formRef.current?.reset();
    // Reload for a fresh server render: dependable on every device, and admin
    // pages are rendered per request anyway. The message survives the reload.
    reloadWith(msg || undefined, redirectTo ? redirectTo.replace("{id}", encodeURIComponent(String(data?.id ?? ""))) : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per result
  }, [state]);

  /**
   * Submitted by hand (not <form action>): React 19 resets a form after an
   * action finishes, which would wipe what the user typed when the server
   * answers with a validation error.
   */
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;
    const fd = new FormData(e.currentTarget);
    // Another form on this page has changes that this action would throw away (it reloads the page).
    const others = [...unsaved.entries()].filter(([id]) => id !== me.current).map(([, label]) => label);
    if (others.length > 0) {
      const go = await ask({
        title: "You have unsaved changes",
        description: <p>Changes in the form with “{others[0]}” aren&apos;t saved yet. Save them first, or continue and lose them.</p>,
        confirmLabel: "Continue without saving", cancelLabel: "Go back and save", destructive: true,
      });
      if (!go) return;
      unsaved.clear();
    }
    if (confirm && !(await ask({ title: confirm, confirmLabel: submitLabel, destructive: variant === "destructive" }))) return;
    run(fd);
  };

  const run = (fd: FormData) => {
    lastData.current = fd;
    startTransition(async () => {
      try {
        setState(await action(fd));
      } catch (err) {
        // Redirects thrown by the action (e.g. session expired) must propagate.
        if (err && typeof err === "object" && "digest" in err && String((err as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) throw err;
        setState({ ok: false, error: "Could not reach the server. Check your connection and try again.", code: "NETWORK" });
      }
    });
  };

  const message = state?.ok ? (typeof (state.data as { message?: string } | undefined)?.message === "string" ? (state.data as { message: string }).message : successMessage) : null;

  return (
    <FieldErrors.Provider value={state && !state.ok ? state.fields ?? {} : {}}>
      {askDialog}
      <form
        ref={formRef}
        onSubmit={submit}
        onInput={markDirty}
        onChange={markDirty}
        className={cn(inline ? "inline-flex flex-wrap items-center gap-2" : "space-y-4", className)}
        noValidate
      >
        {children}
        <div className={cn("flex flex-wrap items-center gap-3", inline && "contents")}>
          <Button type="submit" size={inline ? "sm" : "default"} variant={variant} disabled={pending} aria-label={submitAriaLabel} className="min-h-11 md:min-h-10">
            {pending ? "Working…" : submitLabel}
          </Button>
          {message && !inline && <span role="status" className="text-sm text-green-600 dark:text-green-400">{message}</span>}
        </div>
        {state && !state.ok && state.code !== "REAUTH_REQUIRED" && (
          <div role="alert" tabIndex={-1} data-form-error className={cn("rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive focus:outline-none", inline && "basis-full")}>
            <p>{state.error}</p>
            {state.trace && state.trace.length > 0 && (
              <details className="mt-2 text-xs text-muted-foreground">
                <summary className="cursor-pointer">Why?</summary>
                <ol className="mt-1 list-decimal pl-5">{state.trace.map((t, i) => <li key={i}>{t}</li>)}</ol>
              </details>
            )}
          </div>
        )}
      </form>
      {state && !state.ok && state.code === "REAUTH_REQUIRED" && (
        <ReauthPrompt message={state.error} onConfirmed={() => lastData.current && run(lastData.current)} onCancel={() => setState(null)} />
      )}
    </FieldErrors.Provider>
  );
}

/**
 * Asks for the password (or a two-factor code) when a sensitive action needs a fresh
 * confirmation, then repeats the action. Not a <form>: it sits next to the form it confirms.
 */
export function ReauthPrompt({ message, onConfirmed, onCancel }: { message: string; onConfirmed: () => void; onCancel?: () => void }) {
  const id = useId();
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const confirm = () => {
    if (!secret || pending) return;
    setError(null);
    start(async () => {
      const r = await reauthAction(secret);
      if (!r.ok) return setError(r.error);
      setSecret("");
      onConfirmed();
    });
  };
  return (
    <div role="alertdialog" aria-labelledby={`${id}-t`} className="mt-3 space-y-2 rounded-md border border-amber-400/60 bg-amber-500/5 p-3 text-sm">
      <p id={`${id}-t`} className="font-medium">{message}</p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid min-w-48 flex-1 gap-1">
          <Label htmlFor={id}>Password or two-factor code</Label>
          <PasswordInput id={id} autoComplete="current-password" value={secret} autoFocus onChange={(e) => setSecret(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); confirm(); } }} />
        </div>
        <Button type="button" size="sm" onClick={confirm} disabled={pending || !secret}>{pending ? "Checking…" : "Confirm and continue"}</Button>
        {onCancel && <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>}
      </div>
      {error && <p role="alert" className="text-destructive">{error}</p>}
    </div>
  );
}

export function Field({
  name,
  label,
  type = "text",
  defaultValue,
  required,
  hint,
  placeholder,
  options,
  rows,
  className,
  disabled,
  list,
  autoComplete,
}: {
  name: string;
  label: string;
  type?: "text" | "email" | "number" | "url" | "date" | "datetime-local" | "textarea" | "select" | "checkbox" | "password";
  defaultValue?: string | number | boolean | null;
  required?: boolean;
  hint?: string;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  rows?: number;
  className?: string;
  disabled?: boolean;
  /** id of a <datalist> with suggestions */
  list?: string;
  autoComplete?: string;
}) {
  const errors = useContext(FieldErrors);
  const error = errors[name];
  // Unique per field: pages often hold several forms with the same field names, and each label
  // must point at its own input.
  const id = `f-${name}-${useId().replace(/:/g, "")}`;
  const describedBy = error || hint ? `${id}-help` : undefined;
  if (type === "checkbox") {
    return (
      <div className={cn("grid gap-1", className)}>
        <label className="flex min-h-11 items-center gap-2 text-sm md:min-h-9">
          <input type="checkbox" name={name} defaultChecked={Boolean(defaultValue)} disabled={disabled} aria-invalid={Boolean(error)} aria-describedby={describedBy} className="h-4 w-4" /> {label}
        </label>
        {hint && !error && <p id={`${id}-help`} className="text-xs text-muted-foreground">{hint}</p>}
        {error && <p id={`${id}-help`} className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      {type === "textarea" ? (
        <Textarea id={id} name={name} defaultValue={defaultValue == null ? "" : String(defaultValue)} rows={rows ?? 4} placeholder={placeholder} aria-invalid={Boolean(error)} aria-describedby={describedBy} disabled={disabled} required={required} />
      ) : type === "select" ? (
        <select id={id} name={name} defaultValue={defaultValue == null ? "" : String(defaultValue)} aria-invalid={Boolean(error)} aria-describedby={describedBy} disabled={disabled} required={required}
          className={cn(fieldClass, "w-full")}>
          {(options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : type === "password" ? (
        <PasswordInput id={id} name={name} placeholder={placeholder} aria-invalid={Boolean(error)} aria-describedby={describedBy} disabled={disabled} autoComplete={autoComplete ?? "current-password"} required={required} />
      ) : (
        <Input id={id} name={name} type={type} defaultValue={defaultValue == null ? "" : String(defaultValue)} placeholder={placeholder} aria-invalid={Boolean(error)} aria-describedby={describedBy} disabled={disabled} list={list} autoComplete={autoComplete} required={required} />
      )}
      {hint && !error && <p id={`${id}-help`} className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p id={`${id}-help`} className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function Hidden({ name, value }: { name: string; value: string }) {
  return <input type="hidden" name={name} value={value} />;
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  PUBLISHED: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  APPROVED: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  CURRENT: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  READY: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  PENDING: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  PENDING_APPROVAL: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  UPCOMING: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  DRAFT: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  INACTIVE: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  ARCHIVED: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
  REJECTED: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  SUSPENDED: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  CANCELLED: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  OPEN: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  SCHEDULED: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  IN_PROGRESS: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  DONE: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  CHANGES_REQUESTED: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  ONGOING: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  COMPLETED: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  NEW: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  HANDLED: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  SUBMITTED: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  REGISTERED: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  ATTENDED: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  WAITLISTED: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  POSTPONED: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  DISMISSED: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  RESOLVED: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
};

/** Words for statuses whose code name reads badly. */
const STATUS_WORDS: Record<string, string> = { PENDING_APPROVAL: "waiting for approval", CHANGES_REQUESTED: "changes requested", WAITLISTED: "waitlist" };

/**
 * A status as a coloured chip. `content` is for posts and events, where a reviewer's REJECTED
 * means "changes requested" (the author edits and sends it again), the same words as the banner.
 */
export function StatusBadge({ status, content }: { status: string; content?: boolean }) {
  const key = status.replace(/\s+/g, "_").toUpperCase();
  const word = content && key === "REJECTED" ? "changes requested" : STATUS_WORDS[key] ?? status.replace(/_/g, " ").toLowerCase();
  return <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", STATUS_COLORS[content && key === "REJECTED" ? "CHANGES_REQUESTED" : key] ?? "bg-muted text-muted-foreground")}>{word}</span>;
}

/** `back` is the list this page belongs to ("Blog posts"), shown above the title on detail pages. */
export function PageHeader({ title, description, actions, back }: { title: string; description?: string; actions?: React.ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back && (
          <Link prefetch={false} href={back.href} className="mb-1 inline-flex min-h-9 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <span aria-hidden>←</span> {back.label}
          </Link>
        )}
        <h1 className="break-words text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">{children}</div>;
}

export function Section({ title, description, children, className, actions, id }: { title: string; description?: string; children: React.ReactNode; className?: string; actions?: React.ReactNode; id?: string }) {
  return (
    <section id={id} className={cn("rounded-xl border bg-card p-4 sm:p-5", className)}>
      {actions ? (
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">{title}</h2>{actions}</div>
      ) : <h2 className="text-lg font-semibold">{title}</h2>}
      {description && <p className="mb-4 mt-1 text-sm text-muted-foreground">{description}</p>}
      <div className={description ? "" : "mt-4"}>{children}</div>
    </section>
  );
}

const pagerLink = "inline-flex min-h-10 items-center rounded-md border px-3 font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function Pager({ page, hasMore, base, params }: { page: number; hasMore: boolean; base: string; params?: Record<string, string | undefined> }) {
  const q = (p: number) => {
    const s = new URLSearchParams(Object.entries({ ...params, page: String(p) }).filter(([, v]) => v) as Array<[string, string]>);
    return `${base}?${s.toString()}`;
  };
  return (
    <nav aria-label="Pages" className="mt-4 flex items-center justify-between gap-2 text-sm">
      {page > 1 ? <Link prefetch={false} href={q(page - 1)} className={pagerLink}>← Previous</Link> : <span />}
      {(page > 1 || hasMore) && <span className="text-muted-foreground">Page {page}</span>}
      {hasMore ? <Link prefetch={false} href={q(page + 1)} className={pagerLink}>Next →</Link> : <span />}
    </nav>
  );
}
