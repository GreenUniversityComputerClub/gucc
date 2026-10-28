"use client";

import { MotionConfig, motion, useInView } from "framer-motion";
import { useRef } from "react";
import { SectionHeading } from "@/components/section-heading";
import { cn } from "@/lib/utils";

export type Stat = { value: number; suffix?: string; label: string };

const EASE = [0.22, 1, 0.36, 1] as const;

/** A fixed-seed random, so the server and the browser draw the same pattern. */
function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

/**
 * "GUCC in numbers" as a mission-control board: each figure gets its own instrument (a constellation,
 * a signal, a gauge, a timeline) and rolls into place like an odometer. The figures are edited by
 * leaders (Settings → Home page); the instruments are decoration and claim nothing beyond them.
 */
export function ImpactSection({ stats }: { stats: Stat[] }) {
  const [first, ...rest] = stats;
  return (
    <MotionConfig reducedMotion="user">
      <section aria-labelledby="numbers-heading" className="relative w-full overflow-hidden py-20 md:py-28">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-grid opacity-60" />
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[520px] w-[820px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-[140px]" />

        <div className="container px-4 md:px-6">
          <SectionHeading index="02" eyebrow="Impact" id="numbers-heading" title={<>GUCC <span className="text-gradient">in numbers</span></>}
            description="Our impact in the university and beyond">
            <p className="inline-flex shrink-0 items-center gap-2 rounded-full border border-secondary/30 bg-secondary/10 px-4 py-2 font-mono text-xs uppercase tracking-[0.2em] text-secondary">
              <span className="relative flex h-2 w-2" aria-hidden>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-secondary opacity-70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-secondary" />
              </span>
              Live telemetry
            </p>
          </SectionHeading>

          {first && (
            <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4 lg:grid-rows-2">
              <Panel className="md:col-span-2 lg:row-span-2" code="SYS-01" delay={0}>
                <Constellation />
                <Readout stat={first} big />
              </Panel>
              {rest.map((st, i) => {
                const kind = i % 3;
                return (
                  <Panel key={st.label} code={`SYS-0${i + 2}`} delay={0.12 * (i + 1)} className={cn(kind === 2 && "md:col-span-2")}>
                    {kind === 0 && <Signal />}
                    {kind === 1 && <Gauge />}
                    {kind === 2 && <Timeline ticks={Math.min(Math.max(st.value, 3), 24)} />}
                    <Readout stat={st} gauge={kind === 1} />
                  </Panel>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </MotionConfig>
  );
}

/** A HUD panel: corner brackets, a status code, a scanline sweeping down now and then. */
function Panel({ children, className, code, delay }: { children: React.ReactNode; className?: string; code: string; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.97 }} whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.3 }} transition={{ delay, duration: 0.7, ease: EASE }}
      className={cn("group relative isolate flex min-h-[250px] flex-col justify-end overflow-hidden rounded-3xl border border-foreground/10 bg-card/60 p-6 backdrop-blur-sm transition-colors duration-500 hover:border-primary/40 md:p-8", className)}>
      {/* Corner brackets */}
      <span aria-hidden className="absolute left-3 top-3 h-4 w-4 border-l-2 border-t-2 border-primary/60 transition-all duration-500 group-hover:left-2 group-hover:top-2" />
      <span aria-hidden className="absolute right-3 top-3 h-4 w-4 border-r-2 border-t-2 border-secondary/60 transition-all duration-500 group-hover:right-2 group-hover:top-2" />
      <span aria-hidden className="absolute bottom-3 left-3 h-4 w-4 border-b-2 border-l-2 border-secondary/60 transition-all duration-500 group-hover:bottom-2 group-hover:left-2" />
      <span aria-hidden className="absolute bottom-3 right-3 h-4 w-4 border-b-2 border-r-2 border-primary/60 transition-all duration-500 group-hover:bottom-2 group-hover:right-2" />
      <span aria-hidden className="absolute right-8 top-6 font-mono text-[10px] tracking-[0.25em] text-muted-foreground/70">{code}</span>
      {/* Scanline */}
      <span aria-hidden className="pointer-events-none absolute inset-x-0 -top-1/3 h-1/3 bg-gradient-to-b from-transparent via-primary/10 to-transparent animate-scan" />
      {children}
    </motion.div>
  );
}

/** The figure, rolling digit by digit into place. Screen readers and search engines get it whole. */
function Readout({ stat, big, gauge }: { stat: Stat; big?: boolean; gauge?: boolean }) {
  const text = `${stat.value.toLocaleString("en-US")}${stat.suffix ?? ""}`;
  return (
    <div className={cn("relative", gauge && "absolute inset-0 flex flex-col items-center justify-center text-center")}>
      <p className="sr-only">{text} {stat.label}</p>
      <Odometer text={text} className={cn("font-display font-bold tracking-tight", big ? "text-6xl sm:text-7xl lg:text-8xl" : "text-5xl")} />
      <p aria-hidden className={cn("mt-2 font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground", big && "text-sm")}>{stat.label}</p>
    </div>
  );
}

function Odometer({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const chars = text.split("");
  const digits = chars.filter((c) => /\d/.test(c)).length;
  let d = 0;
  return (
    <div ref={ref} aria-hidden className={cn("flex leading-[1.15] tabular-nums", className)}>
      {chars.map((c, i) => {
        if (!/\d/.test(c)) return <span key={i} className="inline-block h-[1.15em] text-gradient">{c}</span>;
        const n = Number(c);
        const order = d++;
        return (
          // Each digit is a column of 0–9 behind a one-digit window.
          <span key={i} className="relative inline-block h-[1.15em] overflow-hidden px-[0.02em] text-center">
            {/* Sizes the window to this digit's own width */}
            <span className="invisible">{c}</span>
            <motion.span className="absolute inset-x-0 top-0 flex flex-col"
              initial={{ y: "0em" }} animate={{ y: inView ? `${-(n + 10) * 1.15}em` : "0em" }}
              transition={{ duration: 1.6 + (digits - order) * 0.15, delay: order * 0.08, ease: EASE }}>
              {Array.from({ length: 20 }, (_, k) => (
                <span key={k} className="block h-[1.15em] text-gradient">{k % 10}</span>
              ))}
            </motion.span>
          </span>
        );
      })}
    </div>
  );
}

/** Points of light that wake one by one, a few joined into constellations. */
const DOTS = (() => {
  const r = seeded(11);
  return Array.from({ length: 90 }, () => ({ x: r() * 100, y: r() * 62, s: r() < 0.15 ? 3 : 1.5 + r(), delay: r() * 1.8, pulse: r() < 0.2 }));
})();
/** Each of the first stars joins its nearest neighbour, so the lines draw small, believable constellations. */
const LINKS = DOTS.slice(0, 24).flatMap((p, i) => {
  let best = -1;
  let bestD = Infinity;
  DOTS.forEach((q, j) => {
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    if (j !== i && d < bestD) [best, bestD] = [j, d];
  });
  return bestD < 14 ? [[i, best] as const] : [];
});

function Constellation() {
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.3 });
  return (
    <svg ref={ref} aria-hidden viewBox="0 0 100 62" preserveAspectRatio="xMidYMid slice" className="absolute inset-x-0 top-0 -z-10 h-[70%] w-full">
      <defs>
        <linearGradient id="cst-line" x1="0" x2="1">
          <stop offset="0" stopColor="hsl(var(--primary))" />
          <stop offset="1" stopColor="hsl(var(--secondary))" />
        </linearGradient>
      </defs>
      {LINKS.map(([a, b], i) => (
        <motion.line key={i} x1={DOTS[a].x} y1={DOTS[a].y} x2={DOTS[b].x} y2={DOTS[b].y} stroke="url(#cst-line)" strokeWidth={0.22} strokeOpacity={0.8}
          initial={{ pathLength: 0 }} animate={{ pathLength: inView ? 1 : 0 }} transition={{ delay: 1 + i * 0.08, duration: 0.8, ease: EASE }} />
      ))}
      {DOTS.map((p, i) => (
        <motion.circle key={i} cx={p.x} cy={p.y} r={p.s / 6} className={cn("fill-foreground", p.pulse && "animate-twinkle")}
          style={p.pulse ? { animationDelay: `${p.delay}s`, transformOrigin: `${p.x}px ${p.y}px` } : undefined}
          initial={{ opacity: 0 }} animate={{ opacity: inView ? (p.s > 2.5 ? 1 : 0.55) : 0 }} transition={{ delay: p.delay, duration: 0.4 }} />
      ))}
    </svg>
  );
}

/** A signal pulsing like a live feed. */
const BARS = (() => {
  const r = seeded(5);
  return Array.from({ length: 22 }, () => ({ h: 25 + r() * 75, d: 0.9 + r() * 1.2, delay: r() * -2 }));
})();

function Signal() {
  return (
    <div aria-hidden className="absolute inset-x-6 top-12 -z-10 flex h-[28%] items-end gap-[3px] opacity-80 md:inset-x-8">
      {BARS.map((b, i) => (
        <span key={i} className="flex-1 origin-bottom rounded-t-sm bg-gradient-to-t from-primary/50 to-secondary/70 animate-equalize"
          style={{ height: `${b.h}%`, animationDuration: `${b.d}s`, animationDelay: `${b.delay}s` }} />
      ))}
    </div>
  );
}

/** A dial that sweeps round once it's seen. */
function Gauge() {
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  return (
    <svg ref={ref} aria-hidden viewBox="0 0 120 120" className="absolute left-1/2 top-1/2 -z-10 h-[86%] max-h-[220px] -translate-x-1/2 -translate-y-1/2 -rotate-90">
      <defs>
        <linearGradient id="gauge-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="hsl(var(--primary))" />
          <stop offset="1" stopColor="hsl(var(--secondary))" />
        </linearGradient>
      </defs>
      {Array.from({ length: 48 }, (_, i) => (
        <line key={i} x1="60" y1="4" x2="60" y2={i % 4 === 0 ? 10 : 7} stroke="hsl(var(--foreground))" strokeOpacity={0.2} strokeWidth={0.8}
          transform={`rotate(${i * 7.5} 60 60)`} />
      ))}
      <circle cx="60" cy="60" r="46" fill="none" stroke="hsl(var(--foreground))" strokeOpacity={0.08} strokeWidth="5" />
      <motion.circle cx="60" cy="60" r="46" fill="none" stroke="url(#gauge-grad)" strokeWidth="5" strokeLinecap="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: inView ? 0.86 : 0 }} transition={{ duration: 2, ease: EASE }}
        style={{ filter: "drop-shadow(0 0 4px hsl(var(--primary) / 0.7))" }} />
    </svg>
  );
}

/** A track of years with a comet running along it. */
function Timeline({ ticks }: { ticks: number }) {
  return (
    <div aria-hidden className="absolute inset-x-6 top-[30%] -z-10 -translate-y-1/2 md:inset-x-8">
      <div className="relative h-16">
        <div className="absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-primary/10 via-foreground/25 to-secondary/10" />
        <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-between">
          {Array.from({ length: ticks }, (_, i) => (
            <motion.span key={i} className={cn("block w-px bg-foreground/40", i % 5 === 0 ? "h-6" : "h-3")}
              initial={{ scaleY: 0 }} whileInView={{ scaleY: 1 }} viewport={{ once: true }} transition={{ delay: i * 0.05, duration: 0.4 }} />
          ))}
        </div>
        <span className="absolute top-1/2 h-[3px] w-24 -translate-y-1/2 rounded-full bg-gradient-to-r from-transparent via-primary to-secondary shadow-[0_0_14px_2px] shadow-secondary/60 animate-comet" />
      </div>
    </div>
  );
}
