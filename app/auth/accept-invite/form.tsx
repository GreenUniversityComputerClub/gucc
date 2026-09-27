"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { acceptInviteAction } from "../actions";

export function AcceptInviteForm() {
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!token) {
    return (
      <Card>
        <CardHeader><CardTitle>Invitation link missing</CardTitle><CardDescription>Open the link from your invitation email, or ask the person who invited you to send a new one.</CardDescription></CardHeader>
        <CardContent><Link href="/auth/login" className="text-sm underline">Go to sign in</Link></CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Activate your GUCC account</CardTitle>
        <CardDescription>You were added to the GUCC committee. Choose a password to finish setting up your account.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            if (password !== repeat) return setError("The passwords don't match.");
            start(async () => {
              const r = await acceptInviteAction({ token, password });
              if (r && !r.ok) setError(r.error);
            });
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="password">New password</Label>
            <PasswordInput id="password" autoComplete="new-password" minLength={10} required value={password} onChange={(e) => setPassword(e.target.value)} aria-describedby="pw-hint" />
            <p id="pw-hint" className="text-xs text-muted-foreground">At least 10 characters. Don&apos;t reuse a password from another site.</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="repeat">Repeat password</Label>
            <PasswordInput id="repeat" autoComplete="new-password" required value={repeat} onChange={(e) => setRepeat(e.target.value)} />
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={pending} className="w-full">{pending ? "Activating…" : "Activate account"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
