"use client";

import { useCallback, useEffect, useState } from "react";
import { MotionConfig, motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight, Quote } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SectionHeading } from "@/components/section-heading";
import { cn } from "@/lib/utils";

type Person = { name: string; title: string; photo: string; initials: string; message: string };

const EASE = [0.22, 1, 0.36, 1] as const;
const INTERVAL = 7000;

/**
 * "Messages from our moderators" as a spotlight: the mentors line up on one side, one speaks at a
 * time on the stage, and the stage moves on by itself (paused while pointed at or focused, still
 * for people who prefer less motion). Every message is in the page; only the chosen one shows.
 */
export function ModeratorsSection({ heading, subheading, people }: { heading: string; subheading: string; people: Person[] }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduce = useReducedMotion();
  const count = people.length;
  const go = useCallback((i: number) => setActive(((i % count) + count) % count), [count]);
  const auto = !paused && !reduce && count > 1;

  useEffect(() => {
    if (!auto) return;
    const t = setTimeout(() => go(active + 1), INTERVAL);
    return () => clearTimeout(t);
  }, [auto, active, go]);

  if (!count) return null;

  return (
    <MotionConfig reducedMotion="user">
      <section className="relative w-full overflow-hidden py-16 md:py-24">
        <div aria-hidden className="pointer-events-none absolute -right-32 top-1/3 -z-10 h-96 w-96 rounded-full bg-secondary/10 blur-[120px]" />
        <div className="container px-4 md:px-6">
          <SectionHeading index="04" eyebrow="Mentors" title={heading} description={subheading} />

          <div className="mt-12 grid gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]"
            onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
            onFocusCapture={() => setPaused(true)} onBlurCapture={() => setPaused(false)}>
            {/* The mentors */}
            <div role="tablist" aria-label="Moderators" aria-orientation="vertical"
              className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
              {people.map((m, i) => {
                const on = i === active;
                return (
                  <button key={m.name} type="button" role="tab" id={`mod-tab-${i}`} aria-selected={on} aria-controls={`mod-panel-${i}`}
                    onClick={() => go(i)}
                    className={cn("group relative flex min-w-[240px] shrink-0 snap-start items-center gap-4 overflow-hidden rounded-2xl border p-4 text-left transition-[background-color,border-color,box-shadow] duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:min-w-0",
                      on ? "border-primary/40 bg-primary/10 shadow-[0_12px_40px_-20px_hsl(var(--primary)/0.6)]" : "border-border bg-card/60 hover:border-primary/25 hover:bg-card")}>
                    <span className={cn("rounded-full p-[2px] transition-colors", on ? "bg-gradient-to-br from-primary to-secondary" : "bg-border")}>
                      <Avatar className="h-12 w-12 border-2 border-background">
                        <AvatarImage src={m.photo} alt="" className="object-cover" />
                        <AvatarFallback>{m.initials}</AvatarFallback>
                      </Avatar>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{m.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{m.title}</span>
                    </span>
                    <span className={cn("font-mono text-xs transition-colors", on ? "text-primary" : "text-muted-foreground/60")}>{String(i + 1).padStart(2, "0")}</span>
                    {/* Countdown to the next mentor */}
                    {on && (
                      <span aria-hidden className="absolute inset-x-0 bottom-0 h-[2px] bg-border/50">
                        <motion.span key={`${active}-${auto}`} className="block h-full origin-left bg-gradient-to-r from-primary to-secondary"
                          initial={{ scaleX: auto ? 0 : 1 }} animate={{ scaleX: 1 }} transition={{ duration: auto ? INTERVAL / 1000 : 0, ease: "linear" }} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* The stage: every message is here, stacked; only the chosen one shows */}
            <div className="glass glow-border relative isolate grid overflow-hidden rounded-[2rem] p-8 md:p-12">
              <div aria-hidden className="absolute -left-20 -top-20 -z-10 h-72 w-72 rounded-full bg-primary/20 blur-[90px] animate-aurora" />
              <div aria-hidden className="absolute inset-0 -z-10 bg-grid opacity-40" />
              {people.map((m, i) => {
                const on = i === active;
                return (
                  <motion.figure key={m.name} id={`mod-panel-${i}`} role="tabpanel" aria-labelledby={`mod-tab-${i}`} inert={!on}
                    className="relative [grid-area:1/1]"
                    initial={false}
                    animate={on ? { opacity: 1, x: 0, filter: "blur(0px)" } : { opacity: 0, x: 24, filter: "blur(6px)" }}
                    transition={{ duration: 0.55, ease: EASE }}>
                    <span aria-hidden className="pointer-events-none absolute -right-2 -top-6 select-none font-display text-[9rem] font-bold leading-none text-foreground/[0.04] md:text-[12rem]">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="flex flex-col gap-8 md:flex-row md:items-start">
                      <div className="relative shrink-0 self-start">
                        <span aria-hidden className="absolute -inset-3 rounded-full border border-dashed border-primary/30 animate-spin [animation-duration:24s]" />
                        <div className="rounded-full bg-gradient-to-br from-primary via-brand-400 to-secondary p-1 shadow-[0_0_50px_-12px] shadow-primary/60">
                          <Avatar className="h-24 w-24 border-4 border-background md:h-32 md:w-32">
                            <AvatarImage src={m.photo} alt={m.name} className="object-cover" />
                            <AvatarFallback className="text-xl">{m.initials}</AvatarFallback>
                          </Avatar>
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <Quote aria-hidden className="h-9 w-9 text-secondary" />
                        <blockquote className="mt-4 font-display text-xl leading-relaxed text-foreground/90 md:text-2xl">
                          &ldquo;{m.message}&rdquo;
                        </blockquote>
                        <figcaption className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-border/60 pb-2 pr-28 pt-6">
                          <span>
                            <span className="block font-display text-lg font-semibold">{m.name}</span>
                            <span className="block font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">{m.title}</span>
                          </span>
                        </figcaption>
                      </div>
                    </div>
                  </motion.figure>
                );
              })}

              {count > 1 && (
                <div className="absolute bottom-8 right-8 flex gap-2 md:bottom-12 md:right-12">
                  <button type="button" onClick={() => go(active - 1)} aria-label="Previous moderator"
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background/60 transition-colors hover:border-primary/50 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <ChevronLeft className="h-5 w-5" aria-hidden />
                  </button>
                  <button type="button" onClick={() => go(active + 1)} aria-label="Next moderator"
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
                    <ChevronRight className="h-5 w-5" aria-hidden />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </MotionConfig>
  );
}
