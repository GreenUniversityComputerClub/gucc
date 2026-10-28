"use client";

import { ArrowRight, CalendarDays, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRef } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";

/**
 * Stars over the campus. Positions come from a fixed seed, so the server and the browser draw the
 * same sky (no hydration mismatch) and it doesn't jump between visits.
 */
const STARS = (() => {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  return Array.from({ length: 70 }, () => ({
    top: rand() * 62,
    left: rand() * 100,
    size: rand() < 0.85 ? 1 + rand() * 1.2 : 2.4 + rand() * 1.2,
    delay: rand() * 6,
    duration: 3 + rand() * 4,
  }));
})();

/** Staggers the `animate-rise` entrance: each line starts a little after the one before. */
const rise = (delay: number) => ({ style: { animationDelay: `${delay}s` } });

/**
 * The home page's opening: the campus at night, full bleed under the (transparent) header. It is
 * always dark, whatever the theme, so its text reads against the photo. Movement (the photo's slow
 * settle, parallax, twinkling, shooting stars) stops for people who ask for less motion.
 */
export const HeroSection = () => {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const photoY = useTransform(scrollYProgress, [0, 1], ["0%", reduce ? "0%" : "22%"]);
  const copyY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : -90]);
  const copyOpacity = useTransform(scrollYProgress, [0, 0.7], [1, reduce ? 1 : 0]);

  return (
    <section
      ref={ref}
      aria-labelledby="hero-heading"
      className="dark dark-surface relative isolate -mt-16 flex min-h-[100svh] items-end overflow-hidden bg-background pb-20 pt-32 text-foreground sm:items-center sm:pb-24"
    >
      {/* The campus under the Milky Way */}
      <motion.div aria-hidden className="absolute inset-0 -z-30 will-change-transform" style={{ y: photoY }}>
        <div className="absolute inset-0 animate-kenburns">
          <Image
            src="/hero/campus-night.webp"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover object-[50%_35%] brightness-110 saturate-[1.15]"
          />
        </div>
      </motion.div>

      {/* Light: aurora glows mixed into the sky */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-20 mix-blend-screen">
        <div className="absolute -left-[10%] -top-[20%] h-[70vh] w-[60vw] rounded-full bg-brand-600/30 blur-[120px] animate-aurora" />
        <div className="absolute -right-[10%] top-[5%] h-[55vh] w-[45vw] rounded-full bg-aurora-500/20 blur-[120px] animate-aurora [animation-delay:-6s]" />
        <div className="absolute bottom-[10%] left-[30%] h-[35vh] w-[40vw] rounded-full bg-brand-400/10 blur-[100px] animate-aurora [animation-delay:-12s]" />
      </div>

      {/* Stars and the odd shooting star */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        {STARS.map((s, i) => (
          <span
            key={i}
            className="absolute rounded-full bg-white animate-twinkle"
            style={{
              top: `${s.top}%`,
              left: `${s.left}%`,
              width: s.size,
              height: s.size,
              animationDelay: `${s.delay}s`,
              animationDuration: `${s.duration}s`,
              boxShadow: s.size > 2 ? "0 0 8px 1px rgb(255 255 255 / 0.6)" : undefined,
            }}
          />
        ))}
        <span className="shooting-star right-[8%] top-[12%]" style={{ animationDelay: "2s" }} />
        <span className="shooting-star right-[38%] top-[4%]" style={{ animationDelay: "6.5s", animationDuration: "11s" }} />
      </div>

      {/* Scrims: the header reads at the top, the copy on the left, and the photo melts into the page */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-background/80 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/25 to-transparent sm:bg-gradient-to-r sm:from-background/80 sm:via-background/20 sm:to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-background to-transparent" />
        <div className="absolute inset-0 bg-grid opacity-40" />
      </div>

      <motion.div style={{ y: copyY, opacity: copyOpacity }} className="container relative px-4 md:px-6">
        <div className="grid items-end gap-12 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="max-w-3xl">
            <p {...rise(0.1)} className="animate-rise glass mb-6 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium text-foreground/90 sm:text-sm">
              <span className="relative flex h-2 w-2" aria-hidden>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-star opacity-70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-star" />
              </span>
              Dept. of CSE · Green University of Bangladesh
            </p>

            <h1 id="hero-heading" className="font-display text-5xl font-bold leading-[0.95] tracking-tight text-balance sm:text-7xl lg:text-8xl">
              <span {...rise(0.25)} className="animate-rise block text-white">Green University</span>
              <span {...rise(0.4)} className="animate-rise block pb-2 text-gradient">Computer Club</span>
            </h1>

            <p {...rise(0.55)} className="animate-rise mt-6 max-w-xl text-lg leading-relaxed text-foreground/80 sm:text-xl">
              Where curious minds learn, build and lead. Empowering students to excel in technology through innovation,
              collaboration and continuous learning.
            </p>

            <div {...rise(0.7)} className="animate-rise mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/join"
                className="group relative inline-flex min-h-12 items-center justify-center gap-2 overflow-hidden rounded-full bg-gradient-to-r from-brand-400 to-aurora-400 px-7 text-base font-semibold text-slate-950 shadow-[0_0_40px_-8px] shadow-brand-400/70 transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-[0_0_60px_-6px] hover:shadow-aurora-400/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <span aria-hidden className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                Join the club
                <ArrowRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-1" aria-hidden />
              </Link>
              <Link
                href="/events"
                className="glass inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-7 text-base font-medium text-foreground transition-colors duration-300 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <CalendarDays className="h-5 w-5" aria-hidden />
                Explore events
              </Link>
              <Link
                href="/executives"
                className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-medium text-foreground/75 underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Meet the community
              </Link>
            </div>
          </div>

          {/* A terminal card floating by the building, for the wide screens */}
          <div {...rise(0.9)} aria-hidden className="animate-rise hidden lg:block">
            <div className="animate-float glass glow-border relative rounded-2xl p-5 font-mono text-[13px] leading-relaxed shadow-2xl shadow-brand-950/60">
              <div className="mb-4 flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-400/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-300/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-aurora-400/80" />
                <span className="ml-auto text-[11px] text-foreground/50">~/gucc</span>
              </div>
              <p className="text-foreground/60">
                <span className="text-aurora-300">$</span> gucc join --student
              </p>
              <p className="mt-2 text-brand-300">› workshops &amp; bootcamps</p>
              <p className="text-brand-300">› contests &amp; hackathons</p>
              <p className="text-brand-300">› mentors &amp; community</p>
              <p className="mt-2 flex items-center gap-2 text-aurora-300">
                <Sparkles className="h-3.5 w-3.5" /> ready to build
                <span className="inline-block h-4 w-2 animate-pulse bg-aurora-300" />
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Scroll cue */}
      <div aria-hidden className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 sm:block">
        <div className="flex h-10 w-6 justify-center rounded-full border border-white/25 pt-2">
          <span className="h-2 w-1 rounded-full bg-white/70 animate-scroll-dot" />
        </div>
      </div>
    </section>
  );
};
