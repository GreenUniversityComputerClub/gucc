"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { normalizeCode } from "@/lib/certificates/code";
import { Button } from "@/components/ui/button";

/**
 * Enter a code, go to its page. Checked here first so a typo is explained at once; without
 * JavaScript the form goes through /c/go instead. `?code=` (from /c/go or an old link) is honoured.
 */
export function CodeForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [typed, setTyped] = useState(() => params.get("code")?.trim() ?? "");
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    const given = params.get("code")?.trim();
    if (!given) return;
    const code = normalizeCode(given);
    if (code) router.replace(`/c/${code}`);
    else setInvalid(true);
  }, [params, router]);

  return (
    <CodeFields typed={typed} invalid={invalid} onChange={(v) => { setTyped(v); setInvalid(false); }}
      onSubmit={(e) => {
        e.preventDefault();
        const code = normalizeCode(typed);
        if (code) router.push(`/c/${code}`);
        else setInvalid(true);
      }} />
  );
}

/** The fields alone (also the server-rendered stand-in until the address is read). */
export function CodeFields({ typed, invalid, onChange, onSubmit }: {
  typed?: string; invalid?: boolean; onChange?: (value: string) => void; onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form action="/c/go" method="get" className="mt-6 space-y-3" role="search" onSubmit={onSubmit}>
      <label htmlFor="code" className="text-sm font-medium">Certificate code</label>
      <input id="code" name="code" required autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="GUCC-XXXX-XXXX-XXXX-XXXX"
        {...(onChange ? { value: typed ?? "", onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value) } : { defaultValue: typed })}
        aria-invalid={Boolean(invalid)} aria-describedby={invalid ? "code-error" : undefined}
        className="h-12 w-full rounded-md border bg-background px-3 font-mono text-base uppercase tracking-wider" />
      {invalid && <p id="code-error" role="alert" className="text-sm text-destructive">That isn&apos;t a certificate code. Check it against the certificate (16 letters and digits after GUCC).</p>}
      <Button type="submit" className="min-h-11 w-full">Verify</Button>
    </form>
  );
}
