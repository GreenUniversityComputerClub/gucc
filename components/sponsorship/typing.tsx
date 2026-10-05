"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * Phrases typed one after another, like a terminal. The first phrase is in the page's HTML (for
 * search engines and before JavaScript); people who prefer less motion see it still.
 */
export function TypedPhrases({ phrases }: { phrases: string[] }) {
  const key = phrases.join("\u0000");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the phrases, by value
  const list = useMemo(() => (phrases.length ? phrases : [" "]), [key]);
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(list[0] ?? "");
  const [deleting, setDeleting] = useState(false);
  const [still, setStill] = useState(true);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    setStill(reduce.matches || list.length < 2);
  }, [list.length]);

  useEffect(() => {
    if (still) return;
    const phrase = list[i] ?? "";
    let t: ReturnType<typeof setTimeout>;
    if (!deleting && shown === phrase) t = setTimeout(() => setDeleting(true), 2200);
    else if (deleting && shown === "") {
      setDeleting(false);
      setI((n) => (n + 1) % list.length);
    } else t = setTimeout(() => setShown((s) => (deleting ? s.slice(0, -1) : phrase.slice(0, s.length + 1))), deleting ? 28 : 58);
    return () => clearTimeout(t);
  }, [shown, deleting, i, list, still]);

  return (
    <span className="inline-flex min-h-[1.5em] items-center font-mono text-sm text-muted-foreground">
      <span className="sr-only">{list.join(", ")}</span>
      <span aria-hidden>{shown}</span>
      <span aria-hidden className="ml-0.5 inline-block h-[1em] w-[2px] bg-primary align-middle motion-safe:animate-pulse" />
    </span>
  );
}
