"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <div role="alert" className="rounded-xl border border-destructive/40 bg-card p-8 text-center">
      <h1 className="text-xl font-semibold">This page could not load</h1>
      <p className="mt-2 text-sm text-muted-foreground">The service may be busy. Try again; if it keeps happening, share this reference with the web team.</p>
      {error.digest && <p className="mt-2 font-mono text-xs text-muted-foreground">Reference: {error.digest}</p>}
      <Button onClick={reset} className="mt-4">Try again</Button>
    </div>
  );
}
