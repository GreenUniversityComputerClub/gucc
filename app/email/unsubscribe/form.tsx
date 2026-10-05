"use client";

import { useActionState } from "react";
import Link from "next/link";
import { CheckCircle2, MailX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { unsubscribeAction, type UnsubscribeState } from "./actions";

/** Confirm, then a way back (resubscribe) and to the full email choices. */
export function UnsubscribeForm({ token }: { token: string }) {
  const [state, run, pending] = useActionState<UnsubscribeState, FormData>(unsubscribeAction, null);
  const done = state?.ok ? state : null;
  return (
    <div className="text-center">
      <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        {done && !done.resubscribed ? <CheckCircle2 className="h-7 w-7" aria-hidden /> : <MailX className="h-7 w-7" aria-hidden />}
      </span>
      <h1 className="text-2xl font-bold tracking-tight">
        {done ? (done.resubscribed ? "You'll get club announcements again" : "You're unsubscribed") : "Stop club announcement emails?"}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground" aria-live="polite">
        {done
          ? done.resubscribed ? "Thanks for staying in touch." : "You won't get GUCC announcement emails any more. Account and security emails are separate."
          : "GUCC emails announcements to members a few times a month at most. You can turn them back on any time."}
      </p>
      {state && !state.ok && <p role="alert" className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{state.error}</p>}
      <form action={run} className="mt-6 flex flex-col items-center gap-3">
        <input type="hidden" name="t" value={token} />
        {done && !done.resubscribed ? (
          <Button type="submit" name="resubscribe" value="1" variant="outline" className="min-h-11" disabled={pending}>Resubscribe</Button>
        ) : !done ? (
          <Button type="submit" className="min-h-11 px-6" disabled={pending}>{pending ? "Working…" : "Unsubscribe"}</Button>
        ) : null}
      </form>
      {(done?.member ?? true) && (
        <p className="mt-6 text-sm text-muted-foreground">
          Members choose every kind of email in <Link href="/dashboard/profile#email" className="font-medium text-primary underline-offset-4 hover:underline">My profile → Email</Link>.
        </p>
      )}
    </div>
  );
}
