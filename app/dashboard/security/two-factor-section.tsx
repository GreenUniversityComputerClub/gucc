"use client";

import { useState, useTransition } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionForm, Field, ReauthPrompt } from "@/components/admin/ui";
import { reloadWith } from "@/lib/flash";
import { confirmMfaAction, confirmMfaReplaceAction, disableMfaAction, newRecoveryCodesAction, startMfaAction, startMfaReplaceAction } from "./actions";

type Status = { enabled: boolean; enabledAt: string | null; recoveryLeft: number; required: boolean; deadline: string | null; blocked: boolean };
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "long", year: "numeric" });

type Setup = { secret: string; svg: string; uri: string };

/** The QR code, the typed key, and the first code from the app. */
function ScanAndConfirm({ setup, onConfirm, submitLabel }: { setup: Setup; onConfirm: (code: string) => Promise<{ ok: boolean; error?: string }>; submitLabel: string }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
      {/* Drawn on our own server from the secret; nothing leaves the site. */}
      <div className="mx-auto w-44 rounded-md border bg-white p-2 sm:mx-0 sm:w-auto" role="img" aria-label="QR code for your authenticator app" dangerouslySetInnerHTML={{ __html: setup.svg }} />
      <div className="space-y-3">
        <ol className="list-decimal space-y-1 pl-5">
          <li>Scan the QR code with your authenticator app. On this phone? <a href={setup.uri} className="underline">Open it in the app</a>.</li>
          <li>Or type this key: <code className="select-all break-all rounded bg-muted px-1.5 py-0.5">{setup.secret}</code></li>
          <li>Enter the 6-digit code the app shows.</li>
        </ol>
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            setError(null);
            const r = await onConfirm(code);
            if (!r.ok) setError(r.error ?? "That didn't work. Try again.");
          });
        }}>
          <div className="grid gap-1">
            <Label htmlFor="mfa-code">Code</Label>
            <Input id="mfa-code" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={7} className="w-40" autoComplete="one-time-code" required />
          </div>
          <Button type="submit" disabled={pending || !code}>{pending ? "Checking…" : submitLabel}</Button>
        </form>
        {error && <p role="alert" className="text-destructive">{error}</p>}
      </div>
    </div>
  );
}

/** Move two-factor to a new phone: prove it's you with the old app (or a recovery code), then scan. */
function MoveToNewPhone({ onCodes }: { onCodes: (codes: string[]) => void }) {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [setup, setSetup] = useState<Setup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (setup) {
    return (
      <div className="mt-3 space-y-3">
        <p>Now scan this with the <strong>new</strong> phone. Your old app keeps working until the new one&apos;s code is accepted.</p>
        <ScanAndConfirm setup={setup} submitLabel="Switch to the new phone" onConfirm={async (c) => {
          const r = await confirmMfaReplaceAction(c);
          if (!r.ok) return { ok: false, error: r.error };
          onCodes(r.data!.recoveryCodes);
          return { ok: true };
        }} />
      </div>
    );
  }
  return (
    <form className="mt-3 space-y-3" onSubmit={(e) => {
      e.preventDefault();
      start(async () => {
        setError(null);
        const r = await startMfaReplaceAction(password, code);
        if (!r.ok) return setError(r.error);
        setSetup({ secret: r.secret, svg: r.svg, uri: r.uri });
      });
    }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label htmlFor="mv-password">Your password</Label>
          <Input id="mv-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="mv-code">Code from your old app (or a recovery code)</Label>
          <Input id="mv-code" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" required />
        </div>
      </div>
      <Button type="submit" variant="outline" disabled={pending || !password || !code}>{pending ? "Checking…" : "Continue"}</Button>
      {error && <p role="alert" className="text-destructive">{error}</p>}
    </form>
  );
}

function RecoveryCodes({ codes }: { codes: string[] }) {
  const text = codes.join("\n");
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">Save these recovery codes somewhere safe. Each works once if you lose your phone. They won&apos;t be shown again.</p>
      <ul className="grid grid-cols-2 gap-1 rounded-md border bg-muted/40 p-3 font-mono text-sm sm:grid-cols-5">{codes.map((c) => <li key={c}>{c}</li>)}</ul>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => navigator.clipboard?.writeText(text)}>Copy</Button>
        <a className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-muted" download="gucc-recovery-codes.txt" href={`data:text/plain;charset=utf-8,${encodeURIComponent(`GUCC recovery codes\n\n${text}\n`)}`}>Download</a>
        <Button type="button" size="sm" onClick={() => reloadWith("Two-factor sign-in is on.")}>I&apos;ve saved them</Button>
      </div>
    </div>
  );
}

export function TwoFactorSection({ status }: { status: Status }) {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [reauth, setReauth] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (codes) return <RecoveryCodes codes={codes} />;

  const begin = () => start(async () => {
    setError(null);
    const r = await startMfaAction();
    if (!r.ok) return r.code === "REAUTH_REQUIRED" ? setReauth(r.error) : setError(r.error);
    setSetup({ secret: r.secret, svg: r.svg, uri: r.uri });
  });

  if (status.enabled) {
    return (
      <div className="space-y-4 text-sm">
        <p className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden />On since {day(status.enabledAt!)}. {status.recoveryLeft} recovery code{status.recoveryLeft === 1 ? "" : "s"} left.</p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1">
            <Label htmlFor="rc-code">Current code from your app</Label>
            <Input id="rc-code" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={7} className="w-40" autoComplete="one-time-code" />
          </div>
          <Button type="button" variant="outline" disabled={pending || !code} onClick={() => start(async () => {
            setError(null);
            const r = await newRecoveryCodesAction(code);
            if (!r.ok) return setError(r.error);
            setCodes(r.data!.recoveryCodes);
          })}>Make new recovery codes</Button>
        </div>
        {error && <p role="alert" className="text-destructive">{error}</p>}
        <details>
          <summary className="cursor-pointer py-1 text-muted-foreground">Move to a new phone</summary>
          <MoveToNewPhone onCodes={setCodes} />
        </details>
        {status.required ? (
          <p className="text-muted-foreground">Your permissions require two-factor sign-in, so it stays on.</p>
        ) : (
          <details>
            <summary className="cursor-pointer text-muted-foreground">Turn off two-factor sign-in</summary>
            <ActionForm action={disableMfaAction} submitLabel="Turn off" variant="destructive" className="mt-3 space-y-3" confirm="Turn off two-factor sign-in? Your account will be protected by the password only.">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field name="password" label="Your password" type="password" required />
                <Field name="code" label="Code from your app (or a recovery code)" required />
              </div>
            </ActionForm>
          </details>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 text-sm">
      {status.required && (
        <p className={status.blocked ? "rounded-md border border-destructive/50 bg-destructive/5 p-3 text-destructive" : "rounded-md border border-amber-400/60 bg-amber-500/5 p-3"}>
          {status.blocked
            ? "Your leadership permissions are paused until you turn on two-factor sign-in. It takes about a minute."
            : `Your permissions require two-factor sign-in${status.deadline ? ` from ${day(status.deadline)}` : ""}. Set it up now so nothing is paused.`}
        </p>
      )}
      {!setup ? (
        <>
          <p className="text-muted-foreground">Use an authenticator app (Google Authenticator, Microsoft Authenticator, 2FAS, Aegis…). After your password, you&apos;ll enter the 6-digit code it shows.</p>
          <Button type="button" disabled={pending} onClick={begin}>{pending ? "Preparing…" : "Set up two-factor sign-in"}</Button>
          {reauth && <ReauthPrompt message={reauth} onConfirmed={() => { setReauth(null); begin(); }} onCancel={() => setReauth(null)} />}
        </>
      ) : (
        <ScanAndConfirm setup={setup} submitLabel="Turn on" onConfirm={async (c) => {
          const r = await confirmMfaAction(c);
          if (!r.ok) return { ok: false, error: r.error };
          setCodes(r.data!.recoveryCodes);
          return { ok: true };
        }} />
      )}
      {error && <p role="alert" className="text-destructive">{error}</p>}
    </div>
  );
}
