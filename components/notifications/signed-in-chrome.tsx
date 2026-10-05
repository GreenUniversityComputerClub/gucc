"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const Attention = dynamic(() => import("./attention"), { ssr: false });

const signedInHint = () => document.cookie.split("; ").some((c) => c.startsWith("gucc_signed_in="));

/**
 * Loads the notification extras (tab count, live connection, arriving cards) only for people who
 * are signed in: visitors download none of it. Re-checked when the tab comes back, so signing in
 * or out in another tab is picked up.
 */
export function SignedInChrome() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const check = () => setOn(signedInHint());
    check();
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
  return on ? <Attention /> : null;
}
