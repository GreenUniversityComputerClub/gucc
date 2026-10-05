import { Fragment } from "react";
import Link from "next/link";
import { EVERYONE, segment, type Mention } from "@/lib/chat/mentions";
import { cn } from "@/lib/utils";

/**
 * A message's text: plain, with web addresses made clickable (new tab, no referrer) and mentions
 * linked to the person's profile. A mention of you (or of everyone) is highlighted. Nothing else
 * is interpreted.
 */
export function RichText({ text, mentions = [], me, mine = false }: { text: string; mentions?: Mention[]; me?: string; mine?: boolean }) {
  return (
    <Fragment>
      {segment(text, mentions).map((p, i) => {
        if (p.t === "text") return <Fragment key={i}>{p.v}</Fragment>;
        if (p.t === "url") {
          return (
            <a key={i} href={p.v} target="_blank" rel="noopener noreferrer nofollow ugc" className={cn("break-all underline underline-offset-2", mine && "text-primary-foreground")}>
              {p.v}
            </a>
          );
        }
        const forMe = !mine && (p.m.u === me || p.m.u === EVERYONE);
        const cls = cn("font-semibold", mine ? "text-primary-foreground underline decoration-primary-foreground/40 underline-offset-2" : "text-primary",
          forMe && "rounded bg-amber-300/40 px-0.5 text-foreground dark:bg-amber-400/25");
        return p.m.h && p.m.u !== EVERYONE
          ? <Link key={i} prefetch={false} href={`/members/${encodeURIComponent(p.m.h)}`} className={cn(cls, "hover:underline")}>{p.v}</Link>
          : <span key={i} className={cls}>{p.v}</span>;
      })}
    </Fragment>
  );
}
