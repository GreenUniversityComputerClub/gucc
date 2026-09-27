"use client";

import { useSession } from "@/lib/api/use-session";

import { useCallback, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Turnstile } from "@/components/turnstile";
import { registerAction } from "./actions";

type Field = { key: string; label: string; type: string; required?: boolean; options?: string[] };

export function EventRegistration({ slug, fields }: { slug: string; fields: Field[] }) {
  const session = useSession();
  const signedIn = Boolean(session?.signedIn);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [token, setToken] = useState<string | null>(null);
  const onToken = useCallback((t: string | null) => setToken(t), []);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data: Record<string, string> = {};
    formData.forEach((v, k) => (data[k] = String(v)));
    if (token) data.turnstileToken = token;
    start(async () => {
      const res = await registerAction(slug, data);
      if (res.ok) {
        setErrors({});
        setResult({ ok: true, message: res.data?.message ?? "Registered." });
      } else {
        setErrors(res.fields ?? {});
        setResult({ ok: false, message: res.error });
      }
    });
  }

  if (result?.ok) {
    return (
      <div className="bg-card border p-6 rounded-xl shadow-sm" role="status">
        <h3 className="text-xl font-bold mb-2">You&apos;re in</h3>
        <p className="text-muted-foreground">{result.message}</p>
      </div>
    );
  }

  const err = (k: string) => (errors[k] ? <p className="text-sm text-destructive mt-1">{errors[k]}</p> : null);

  return (
    <form onSubmit={submit} className="bg-card border p-6 rounded-xl shadow-sm space-y-4" noValidate>
      <h3 className="text-xl font-bold text-card-foreground">Register</h3>
      {!signedIn && (
        <p className="text-sm text-muted-foreground">
          <Link href={`/auth/login?next=/events/${slug}`} className="underline underline-offset-4">Sign in</Link> to register faster, or fill in your details.
        </p>
      )}
      <div>
        <Label htmlFor="reg-name">Full name</Label>
        <Input id="reg-name" name="name" required autoComplete="name" aria-invalid={Boolean(errors.name)} />
        {err("name")}
      </div>
      {!signedIn && (
        <div>
          <Label htmlFor="reg-email">Email</Label>
          <Input id="reg-email" name="email" type="email" required autoComplete="email" aria-invalid={Boolean(errors.email)} />
          {err("email")}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="reg-sid">Student ID (optional)</Label>
          <Input id="reg-sid" name="studentId" inputMode="numeric" maxLength={9} aria-invalid={Boolean(errors.studentId)} />
          {err("studentId")}
        </div>
        <div>
          <Label htmlFor="reg-phone">Phone (optional)</Label>
          <Input id="reg-phone" name="phone" type="tel" autoComplete="tel" aria-invalid={Boolean(errors.phone)} />
          {err("phone")}
        </div>
      </div>
      {fields.map((f) => (
        <div key={f.key}>
          {f.type === "checkbox" ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name={`field_${f.key}`} /> {f.label}
            </label>
          ) : (
            <>
              <Label htmlFor={`f-${f.key}`}>{f.label}{f.required ? "" : " (optional)"}</Label>
              {f.type === "textarea" ? (
                <Textarea id={`f-${f.key}`} name={`field_${f.key}`} required={f.required} />
              ) : f.type === "select" ? (
                <select id={`f-${f.key}`} name={`field_${f.key}`} required={f.required} className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                  <option value="">Choose…</option>
                  {(f.options ?? []).map((o) => <option key={o}>{o}</option>)}
                </select>
              ) : (
                <Input id={`f-${f.key}`} name={`field_${f.key}`} required={f.required} />
              )}
            </>
          )}
          {err(`field_${f.key}`)}
        </div>
      ))}
      {!signedIn && <Turnstile onToken={onToken} />}
      {result && !result.ok && <p className="text-sm text-destructive" role="alert">{result.message}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Registering…" : "Register now"}
      </Button>
    </form>
  );
}
