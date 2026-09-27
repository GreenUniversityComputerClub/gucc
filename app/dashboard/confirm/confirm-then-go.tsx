"use client";

import Link from "next/link";
import { useState } from "react";
import { ReauthPrompt } from "@/components/admin/ui";

export function ConfirmThenGo({ next, back }: { next: string; back: string }) {
  const [done, setDone] = useState(false);
  if (done) {
    return (
      <p className="text-sm">
        Confirmed. Your download should start now. If it doesn&apos;t, <a href={next} className="underline">download it here</a>.{" "}
        <Link href={back} className="underline">Go back</Link>
      </p>
    );
  }
  return <ReauthPrompt message="Enter your password to continue." onConfirmed={() => { setDone(true); window.location.assign(next); }} />;
}
