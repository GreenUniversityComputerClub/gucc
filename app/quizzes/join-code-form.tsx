"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";

export function JoinCodeForm({ initialCode = "" }: { initialCode?: string }) {
  const router = useRouter();
  const [code, setCode] = useState(initialCode);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!/^[A-Z0-9]{6,12}$/.test(cleaned)) {
      setError("Enter a 6 to 12 character alphanumeric join code (e.g. GUCC42).");
      return;
    }
    setError(null);
    router.push(`/q/${encodeURIComponent(cleaned)}`);
  };

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Quiz Join Code</span>
          <Hash className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="text"
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={12}
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              if (error) setError(null);
            }}
            placeholder="Enter join code (e.g. AB12CD)"
            className="h-12 w-full rounded-xl border bg-background pl-9 pr-4 font-mono text-base font-bold uppercase tracking-[0.18em] placeholder:font-sans placeholder:text-sm placeholder:font-normal placeholder:tracking-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <Button type="submit" className="h-12 gap-2 rounded-xl px-6 text-base font-semibold">
          Join Room
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
