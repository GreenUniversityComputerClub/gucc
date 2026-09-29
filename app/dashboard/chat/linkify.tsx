import { Fragment } from "react";

const URL_RE = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/gi;

/** Plain text with web addresses made clickable (opened in a new tab, no referrer). Nothing else is interpreted. */
export function Linkified({ text, className }: { text: string; className?: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const start = m.index ?? 0;
    if (start > last) parts.push(text.slice(last, start));
    parts.push(
      <a key={start} href={m[0]} target="_blank" rel="noopener noreferrer nofollow ugc" className={className ?? "break-all underline underline-offset-2"}>
        {m[0]}
      </a>,
    );
    last = start + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <Fragment>{parts}</Fragment>;
}
