"use client";

import { useState, useTransition } from "react";
import { resetLinkAction, resetMfaAction } from "@/app/dashboard/actions";
import { ReauthPrompt } from "./ui";
import { useConfirm } from "@/components/ui/confirm-dialog";

/** Creates a one-time password reset link and shows it once, to pass on privately. */
export function ResetLinkButton({ userId, name }: { userId: string; name: string }) {
  const [result, setResult] = useState<{ url: string; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [reauth, setReauth] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [confirm, dialog] = useConfirm();

  const create = async (confirmed = false) => {
    if (!confirmed && !(await confirm({
      title: `Create a password reset link for ${name}?`,
      description: "Whoever has the link can set their password, so give it only to them, privately. It works once, for 24 hours.",
      confirmLabel: "Create link",
    }))) return;
    start(async () => {
      setError(null);
      try {
        const r = await resetLinkAction(userId);
        if (r.ok && r.data) setResult({ url: r.data.url, message: r.data.message });
        else if (!r.ok && r.code === "REAUTH_REQUIRED") setReauth(r.error);
        else if (!r.ok) setError(r.error);
      } catch {
        setError("Could not reach the server. Check your connection and try again.");
      }
    });
  };

  if (result) {
    return (
      <div className="w-full rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs" role="status">
        <p>{result.message}</p>
        <div className="mt-1 flex items-start gap-2">
          <code className="min-w-0 flex-1 break-all rounded bg-muted px-2 py-1">{result.url}</code>
          <button
            type="button"
            className="shrink-0 rounded-md border px-2 py-1 hover:bg-muted"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(result.url);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
    );
  }
  return (
    <span className="inline-flex flex-col gap-1">
      {dialog}
      <button type="button" onClick={() => create()} disabled={pending} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-60">
        {pending ? "Creating…" : "Password reset link"}
      </button>
      {error && <span role="alert" className="text-xs text-destructive">{error}</span>}
      {reauth && <ReauthPrompt message={reauth} onConfirmed={() => { setReauth(null); create(true); }} onCancel={() => setReauth(null)} />}
    </span>
  );
}

/** Turns off someone's two-factor sign-in (lost phone, no recovery codes). Audited, with a reason. */
export function ResetMfaButton({ userId, name }: { userId: string; name: string }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [reauth, setReauth] = useState<{ text: string; reason: string } | null>(null);
  const [, dialog, ask] = useConfirm();
  const [pending, start] = useTransition();
  const run = (reason: string) => start(async () => {
    const r = await resetMfaAction(userId, reason);
    if (r.ok) return setMsg({ ok: true, text: r.message ?? "Reset." });
    if (r.code === "REAUTH_REQUIRED") return setReauth({ text: r.error, reason });
    setMsg({ ok: false, text: r.error });
  });
  return (
    <span className="inline-flex flex-col gap-1">
      {dialog}
      <button type="button" disabled={pending} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-60" onClick={async () => {
        const reason = await ask({
          title: `Reset two-factor sign-in for ${name}?`,
          description: "Only do this after checking who is asking (for example in person). They'll sign in with just their password and should set it up again.",
          input: { label: "Reason (kept in the activity log)", minLength: 5 },
          confirmLabel: "Reset two-factor", destructive: true,
        });
        if (reason) run(reason);
      }}>{pending ? "Resetting…" : "Reset two-factor"}</button>
      {msg && <span role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-xs text-emerald-700 dark:text-emerald-300" : "text-xs text-destructive"}>{msg.text}</span>}
      {reauth && <ReauthPrompt message={reauth.text} onConfirmed={() => { const r = reauth.reason; setReauth(null); run(r); }} onCancel={() => setReauth(null)} />}
    </span>
  );
}
