"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { verifyTwoFactorAction } from "../actions";

export function TwoFactorForm() {
  const params = useSearchParams();
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [error, setError] = useState<{ message: string; expired: boolean } | null>(null);
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await verifyTwoFactorAction({ code, next: params.get("next") ?? undefined });
      // Success redirects on the server.
      if (r && !r.ok) setError({ message: r.error, expired: r.code === "AUTH_REQUIRED" || r.code === "RATE_LIMITED" });
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Two-factor sign-in</CardTitle>
        <CardDescription>{recovery ? "Enter one of your recovery codes. Each code works once." : "Enter the 6-digit code from your authenticator app."}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-5">
          <div className="grid gap-2">
            <Label htmlFor="code">{recovery ? "Recovery code" : "Code"}</Label>
            <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} required autoFocus autoComplete="one-time-code"
              inputMode={recovery ? "text" : "numeric"} pattern={recovery ? undefined : "[0-9 ]{6,7}"} maxLength={recovery ? 12 : 7} placeholder={recovery ? "abcd-2345" : "123456"} />
          </div>
          {error && (
            <p className="text-sm text-red-500" role="alert">
              {error.message} {error.expired && <Link href="/auth/login" className="underline">Sign in again</Link>}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={pending}>{pending ? "Checking…" : "Continue"}</Button>
          <button type="button" onClick={() => { setRecovery(!recovery); setCode(""); setError(null); }} className="text-sm underline underline-offset-4">
            {recovery ? "Use a code from the app instead" : "Lost your phone? Use a recovery code"}
          </button>
        </form>
      </CardContent>
    </Card>
  );
}
