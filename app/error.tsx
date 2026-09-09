"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Route-level error boundary. Replaces the raw Next error screen so a failed
 * data fetch or render degrades into something branded and recoverable.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="container flex min-h-[60vh] flex-col items-center justify-center py-16 text-center">
      <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
        Something went wrong
      </h1>
      <p className="mt-4 max-w-md text-muted-foreground">
        This page failed to load. Trying again usually fixes it — if it keeps
        happening, please let us know.
      </p>
      {error.digest && (
        <p className="mt-2 font-mono text-xs text-muted-foreground">
          Reference: {error.digest}
        </p>
      )}

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="outline">
          <Link href="/">Back to home</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/contact">Report the problem</Link>
        </Button>
      </div>
    </div>
  );
}
