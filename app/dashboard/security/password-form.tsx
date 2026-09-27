"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { changePasswordAction } from "@/app/auth/actions";

export function PasswordForm() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        start(async () => {
          const res = await changePasswordAction({ current: String(fd.get("current")), password: String(fd.get("password")) });
          setMsg(res.ok ? { ok: true, text: "Password changed. Other devices were signed out." } : { ok: false, text: res.error });
          if (res.ok) form.reset();
        });
      }}
      className="grid gap-4 sm:grid-cols-2"
    >
      <div className="grid gap-1.5">
        <Label htmlFor="pw-current">Current password</Label>
        <PasswordInput id="pw-current" name="current" autoComplete="current-password" required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="pw-new">New password</Label>
        <PasswordInput id="pw-new" name="password" autoComplete="new-password" minLength={10} required />
        <p className="text-xs text-muted-foreground">At least 10 characters.</p>
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" variant="outline" disabled={pending}>{pending ? "Changing…" : "Change password"}</Button>
        {msg && <p role="status" className={`text-sm ${msg.ok ? "text-emerald-600" : "text-destructive"}`}>{msg.text}</p>}
      </div>
    </form>
  );
}
