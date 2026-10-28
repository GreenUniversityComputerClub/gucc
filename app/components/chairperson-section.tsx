"use client";

import { useRef, type MouseEvent } from "react";
import {
  MotionConfig, motion, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue,
} from "framer-motion";
import { Building2, GraduationCap } from "lucide-react";
import { SectionHeading } from "@/components/section-heading";

const EASE = [0.22, 1, 0.36, 1] as const;

type Person = { name: string; title: string; photo: string; initials: string; message: string };

/**
 * The chairperson's message as an editorial spread: a portrait in a glowing frame that tilts towards
 * the pointer, and the message lighting up word by word as it scrolls past, signed by hand. Every
 * word is in the page from the start (only its brightness moves), and all of it is edited by
 * leaders (Settings → Home page).
 */
export function ChairpersonSection({ heading, subheading, person }: { heading: string; subheading: string; person: Person }) {
  return (
    <MotionConfig reducedMotion="user">
      <section className="relative w-full overflow-hidden py-20 md:py-28">
        <div aria-hidden className="pointer-events-none absolute -left-32 top-1/3 -z-10 h-[420px] w-[420px] rounded-full bg-primary/15 blur-[130px]" />
        <div aria-hidden className="pointer-events-none absolute -right-32 top-1/3 -z-10 h-[360px] w-[360px] rounded-full bg-secondary/10 blur-[130px]" />

        <div className="container px-4 md:px-6">
          <SectionHeading index="03" eyebrow="Leadership" title={heading} description={subheading} />

          <figure className="mt-14 grid items-center gap-14 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-20">
            <Portrait person={person} />

            <div className="relative pt-16 sm:pt-20">
              {/* A large quotation mark above the words */}
              <span aria-hidden className="pointer-events-none absolute -left-1 -top-4 select-none font-display text-[8rem] font-bold leading-none text-gradient sm:-top-6 sm:text-[10rem]">
                &ldquo;
              </span>
              <Message text={person.message} />

              <figcaption className="mt-10 flex flex-wrap items-end gap-x-6 gap-y-3">
                <span>
                  <span className="relative inline-block font-display text-2xl font-bold tracking-tight sm:text-3xl">
                    {person.name}
                    <Signature />
                  </span>
                  <span className="mt-3 block font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">{person.title}</span>
                </span>
              </figcaption>
            </div>
          </figure>
        </div>
      </section>
    </MotionConfig>
  );
}

/** The portrait: a glowing gradient frame, an orbit behind it, credential chips, a tilt towards the pointer. */
function Portrait({ person }: { person: Person }) {
  const reduce = useReducedMotion();
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rotateY = useSpring(useTransform(mx, [-0.5, 0.5], [-10, 10]), { stiffness: 150, damping: 18 });
  const rotateX = useSpring(useTransform(my, [-0.5, 0.5], [8, -8]), { stiffness: 150, damping: 18 });
  const glareX = useTransform(mx, [-0.5, 0.5], ["0%", "100%"]);
  const glare = useTransform(glareX, (x) => `radial-gradient(circle at ${x} 20%, rgb(255 255 255 / 0.45), transparent 55%)`);

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    if (reduce) return;
    const r = e.currentTarget.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width - 0.5);
    my.set((e.clientY - r.top) / r.height - 0.5);
  };
  const onLeave = () => {
    mx.set(0);
    my.set(0);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 40, scale: 0.95 }} whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.3 }} transition={{ duration: 0.9, ease: EASE }}
      className="relative mx-auto w-full max-w-[400px] px-4 sm:px-8 [perspective:1000px]"
      onMouseMove={onMove} onMouseLeave={onLeave}>
      {/* An orbit turning slowly behind the frame */}
      <div aria-hidden className="absolute inset-[-6%] -z-10 rounded-full border border-dashed border-foreground/15 animate-[spin_40s_linear_infinite]">
        <span className="absolute left-1/2 top-0 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-secondary shadow-[0_0_14px_3px] shadow-secondary/70" />
      </div>
      <div aria-hidden className="absolute inset-[8%] -z-10 rounded-[2.5rem] bg-gradient-to-br from-primary via-brand-400 to-secondary opacity-60 blur-3xl" />

      <motion.div style={{ rotateX, rotateY, transformStyle: "preserve-3d" }} className="relative">
        <div className="rounded-[2rem] bg-gradient-to-br from-primary via-brand-400 to-secondary p-[2px] shadow-2xl shadow-primary/30">
          <div className="relative aspect-[4/5] overflow-hidden rounded-[calc(2rem-2px)] bg-card">
            {person.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={person.photo} alt={person.name} className="h-full w-full object-cover object-top" loading="lazy" />
            ) : (
              <span className="flex h-full w-full items-center justify-center font-display text-7xl font-bold text-gradient">{person.initials}</span>
            )}
            <div aria-hidden className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-background/70 to-transparent" />
            {/* A sheen that follows the pointer */}
            <motion.div aria-hidden className="pointer-events-none absolute inset-0 opacity-60 mix-blend-overlay"
              style={{ background: glare }} />
          </div>
        </div>

        {/* Credentials, floating off the frame */}
        <span style={{ transform: "translateZ(40px)" }}
          className="glass absolute -right-3 top-8 inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-semibold shadow-xl sm:-right-8">
          <Building2 className="h-4 w-4 text-secondary" aria-hidden />
          Dept. of CSE
        </span>
        <span style={{ transform: "translateZ(60px)" }}
          className="glass absolute -left-3 bottom-10 inline-flex max-w-[85%] items-center gap-2 rounded-2xl px-3.5 py-2.5 text-xs font-semibold shadow-xl sm:-left-8">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-secondary text-primary-foreground">
            <GraduationCap className="h-4 w-4" aria-hidden />
          </span>
          <span className="leading-snug">{person.title}</span>
        </span>
      </motion.div>
    </motion.div>
  );
}

/** The message, its words brightening in reading order as it scrolls through the view. */
function Message({ text }: { text: string }) {
  const ref = useRef<HTMLQuoteElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.85", "end 0.6"] });
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <blockquote ref={ref} className="relative font-display text-xl leading-relaxed tracking-tight sm:text-2xl lg:text-[1.7rem] lg:leading-[1.5]">
      <p className="flex flex-wrap gap-x-[0.3em]">
        {words.map((w, i) => (
          <Word key={i} progress={scrollYProgress} range={[i / words.length, (i + 1) / words.length]} still={!!reduce}>
            {w}
          </Word>
        ))}
      </p>
    </blockquote>
  );
}

function Word({ children, progress, range, still }: { children: string; progress: MotionValue<number>; range: [number, number]; still: boolean }) {
  const opacity = useTransform(progress, range, [0.18, 1]);
  return <motion.span style={{ opacity: still ? 1 : opacity }} className="text-foreground">{children}</motion.span>;
}

/** A hand-drawn flourish under the name, drawn once it's seen. */
function Signature() {
  return (
    <svg aria-hidden viewBox="0 0 300 24" preserveAspectRatio="none" className="absolute -bottom-3 left-0 h-4 w-[105%] overflow-visible">
      <defs>
        <linearGradient id="sig-grad" x1="0" x2="1">
          <stop offset="0" stopColor="hsl(var(--primary))" />
          <stop offset="1" stopColor="hsl(var(--secondary))" />
        </linearGradient>
      </defs>
      <motion.path d="M2 16 C 40 4, 80 22, 120 12 S 200 2, 240 14 S 290 18, 298 6" fill="none" stroke="url(#sig-grad)" strokeWidth="3" strokeLinecap="round"
        initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1.4, delay: 0.3, ease: EASE }} />
    </svg>
  );
}
