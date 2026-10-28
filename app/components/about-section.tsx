"use client";

import { useState, type MouseEvent } from "react";
import Image from "next/image";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import {
  Award, BookOpen, CalendarDays, ChevronDown, Code2, Lightbulb, Rocket, Telescope, Trophy, Users, type LucideIcon,
} from "lucide-react";
import { SectionHeading } from "@/components/section-heading";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

const FACTS = ["Student-run", "Non-profit", "Non-political", "Dept. of CSE"];

const AIMS = {
  mission: { icon: Rocket, text: "Empower CSE students to build successful careers in modern computer science and engineering." },
  vision: { icon: Telescope, text: "Grow the leadership and professional skills of every CSE student at Green University of Bangladesh." },
} as const;

const PILLARS: Array<{ icon: LucideIcon; title: string; text: string }> = [
  { icon: Users, title: "Community", text: "A vibrant crowd of tech enthusiasts" },
  { icon: Award, title: "Excellence", text: "High standards in all we do" },
  { icon: BookOpen, title: "Learning", text: "Always growing, always curious" },
  { icon: CalendarDays, title: "Events", text: "Workshops, contests, hackathons" },
];

/** Nodes on the orbit: [ring, angle in degrees]. */
const ORBIT: Array<{ icon: LucideIcon; label: string; ring: 0 | 1 | 2; angle: number }> = [
  { icon: Code2, label: "Learn", ring: 0, angle: 20 },
  { icon: Trophy, label: "Compete", ring: 0, angle: 200 },
  { icon: Users, label: "Connect", ring: 1, angle: 110 },
  { icon: Lightbulb, label: "Innovate", ring: 1, angle: 290 },
  { icon: Rocket, label: "Lead", ring: 2, angle: 60 },
  { icon: CalendarDays, label: "Events", ring: 2, angle: 240 },
];
const RINGS = [
  { inset: "26%", duration: "26s" },
  { inset: "15%", duration: "38s" },
  { inset: "5%", duration: "52s" },
];

const TITLE = ["Code.", "Create.", "Lead.", "Together."];

/**
 * The home page's "About us": the gist at a glance (one line, a few chips, mission and vision a tap
 * apart) with an orbit of what members do beside it. The full description is one tap away and stays
 * in the page for search engines.
 */
export function AboutSection({ members }: { members?: { value: number; suffix?: string } }) {
  const [aim, setAim] = useState<keyof typeof AIMS>("mission");
  const Aim = AIMS[aim];

  return (
    <MotionConfig reducedMotion="user">
      <section className="relative w-full overflow-hidden py-20 md:py-28 lg:py-32">
        <div aria-hidden className="pointer-events-none absolute left-0 top-1/4 -z-10 h-96 w-96 rounded-full bg-primary/10 blur-[120px]" />
        <div aria-hidden className="pointer-events-none absolute bottom-0 right-0 -z-10 h-96 w-96 rounded-full bg-secondary/10 blur-[120px]" />

        <div className="container px-4 md:px-6">
          <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-10">
            {/* The gist */}
            <div>
              <SectionHeading
                index="01"
                eyebrow="About us"
                title={
                  <span className="flex flex-wrap gap-x-[0.28em]">
                    {TITLE.map((w, i) => (
                      <motion.span key={w} className={cn("inline-block", i === TITLE.length - 1 && "text-gradient")}
                        initial={{ opacity: 0, y: 30, rotateX: -60 }} whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
                        viewport={{ once: true, amount: 0.6 }} transition={{ delay: i * 0.12, duration: 0.7, ease: EASE }}>
                        {w}
                      </motion.span>
                    ))}
                  </span>
                }
              />

              <motion.p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground md:text-xl"
                initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.45, duration: 0.6, ease: EASE }}>
                The flagship club of Green University&rsquo;s CSE department, where{" "}
                <span className="font-semibold text-foreground">{(members?.value ?? 7000).toLocaleString("en-US")}{members?.suffix ?? "+"} students</span>{" "}
                learn, build and lead together.
              </motion.p>

              <ul className="mt-6 flex flex-wrap gap-2">
                {FACTS.map((f, i) => (
                  <motion.li key={f}
                    initial={{ opacity: 0, scale: 0.6 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }}
                    transition={{ delay: 0.6 + i * 0.08, type: "spring", bounce: 0.45, duration: 0.6 }}
                    className="rounded-full border border-primary/25 bg-primary/10 px-3.5 py-1.5 font-mono text-xs font-medium text-primary">
                    {f}
                  </motion.li>
                ))}
              </ul>

              {/* Mission and vision, a tap apart */}
              <motion.div className="glass glow-border relative mt-8 rounded-3xl p-2"
                initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.8, duration: 0.6, ease: EASE }}>
                <div role="tablist" aria-label="Our aims" className="grid grid-cols-2 gap-1">
                  {(Object.keys(AIMS) as Array<keyof typeof AIMS>).map((k) => (
                    <button key={k} type="button" role="tab" aria-selected={aim === k} aria-controls="aim-panel" onClick={() => setAim(k)}
                      className={cn("relative isolate h-11 rounded-2xl text-sm font-semibold capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        aim === k ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                      {aim === k && (
                        <motion.span layoutId="aim-pill" aria-hidden className="absolute inset-0 -z-10 rounded-2xl bg-gradient-to-r from-primary to-secondary shadow-lg shadow-primary/30"
                          transition={{ type: "spring", bounce: 0.25, duration: 0.5 }} />
                      )}
                      Our {k}
                    </button>
                  ))}
                </div>
                <div id="aim-panel" role="tabpanel" className="relative min-h-[96px] px-4 pb-3 pt-4">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div key={aim} className="flex items-start gap-4"
                      initial={{ opacity: 0, y: 12, filter: "blur(4px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                      exit={{ opacity: 0, y: -12, filter: "blur(4px)" }} transition={{ duration: 0.35, ease: EASE }}>
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-secondary/15 text-secondary">
                        <Aim.icon className="h-5 w-5" aria-hidden />
                      </span>
                      <p className="pt-1 font-display text-lg leading-snug">{Aim.text}</p>
                    </motion.div>
                  </AnimatePresence>
                </div>
              </motion.div>

              {/* The full description, for whoever wants it (and for search engines) */}
              <details className="group mt-5">
                <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                  Read our full story
                  <ChevronDown className="h-4 w-4 transition-transform duration-300 group-open:rotate-180" aria-hidden />
                </summary>
                <div className="mt-4 space-y-3 border-l-2 border-primary/30 pl-4 text-sm leading-relaxed text-muted-foreground">
                  <p>
                    Welcome to the Green University Computer Club (GUCC), a dynamic and student-driven non-profit and
                    non-political organization operating in collaboration with the Department of Computer Science and
                    Engineering (CSE) at the esteemed Green University of Bangladesh. As the flagship club of the
                    university, GUCC boasts a thriving community of over 7000+ members.
                  </p>
                  <p>
                    Our primary objective is to empower and guide students within the Department of CSE on their journey
                    to carve out successful careers in the ever-evolving realms of modern computer science and
                    engineering. Under the vigilant supervision of the department, GUCC serves as a catalyst for
                    excellence, fostering development and leadership among its members.
                  </p>
                </div>
              </details>
            </div>

            {/* The orbit: what members do, circling the club */}
            <motion.div aria-hidden className="relative mx-auto aspect-square w-full max-w-[520px]"
              initial={{ opacity: 0, scale: 0.85, rotate: -10 }} whileInView={{ opacity: 1, scale: 1, rotate: 0 }}
              viewport={{ once: true, amount: 0.3 }} transition={{ duration: 1.1, ease: EASE }}>
              <div className="absolute inset-[15%] rounded-full bg-gradient-to-br from-primary/25 to-secondary/20 blur-3xl" />
              {RINGS.map((r, ri) => (
                <div key={ri} className="absolute rounded-full border border-dashed border-foreground/15 animate-spin"
                  style={{ inset: r.inset, animationDuration: r.duration, animationDirection: ri === 1 ? "reverse" : "normal" }}>
                  {ORBIT.filter((n) => n.ring === ri).map((n) => (
                    <div key={n.label} className="absolute inset-0" style={{ transform: `rotate(${n.angle}deg)` }}>
                      <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2">
                        <div style={{ transform: `rotate(${-n.angle}deg)` }}>
                          {/* Counter-spin, so the badge stays upright while its ring turns */}
                          <div className="animate-spin" style={{ animationDuration: r.duration, animationDirection: ri === 1 ? "normal" : "reverse" }}>
                            <div className="glass flex items-center gap-2 rounded-full p-1.5 shadow-lg shadow-primary/10 sm:pr-3.5">
                              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-secondary text-primary-foreground">
                                <n.icon className="h-4 w-4" />
                              </span>
                              <span className="hidden text-xs font-semibold sm:inline">{n.label}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}

              {/* The core */}
              <div className="absolute inset-[34%] flex items-center justify-center">
                <span className="absolute inset-0 animate-ping rounded-full bg-primary/20 [animation-duration:3s]" />
                <span className="absolute inset-[-8%] rounded-full bg-gradient-to-br from-primary via-brand-400 to-secondary opacity-80 blur-xl" />
                <div className="relative flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br from-primary via-brand-500 to-secondary p-[3px] shadow-[0_0_60px_-10px] shadow-primary">
                  <div className="flex h-full w-full items-center justify-center rounded-full bg-background">
                    <Image src="/android-chrome-192x192.png" alt="" width={120} height={120} className="h-[72%] w-[72%] rounded-full" />
                  </div>
                </div>
              </div>

              {/* A members badge floating by */}
              <div className="absolute bottom-[4%] left-0 sm:left-[2%]">
                <div className="animate-float glass glow-border relative rounded-2xl px-4 py-3 shadow-xl">
                  <p className="font-display text-2xl font-bold text-gradient">{(members?.value ?? 7000).toLocaleString("en-US")}{members?.suffix ?? "+"}</p>
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Members</p>
                </div>
              </div>
            </motion.div>
          </div>

          {/* The pillars */}
          <ul className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PILLARS.map((p, i) => (
              <motion.li key={p.title}
                initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.4 }}
                transition={{ delay: i * 0.1, duration: 0.6, ease: EASE }}>
                <SpotlightCard>
                  <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-secondary/20 text-primary ring-1 ring-primary/20 transition-transform duration-500 group-hover:-rotate-6 group-hover:scale-110">
                    <p.icon className="h-6 w-6" aria-hidden />
                  </span>
                  <span className="absolute right-6 top-6 font-mono text-xs text-muted-foreground/60">0{i + 1}</span>
                  <h3 className="mt-5 font-display text-lg font-semibold">{p.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{p.text}</p>
                  <span aria-hidden className="mt-5 block h-0.5 w-8 rounded-full bg-gradient-to-r from-primary to-secondary transition-all duration-500 group-hover:w-full" />
                </SpotlightCard>
              </motion.li>
            ))}
          </ul>
        </div>
      </section>
    </MotionConfig>
  );
}

/** A card lit by a soft glow that follows the pointer. */
function SpotlightCard({ children }: { children: React.ReactNode }) {
  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--x", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--y", `${e.clientY - r.top}px`);
  };
  return (
    <div onMouseMove={onMove}
      className="lift group relative h-full overflow-hidden rounded-3xl border bg-card p-6 before:pointer-events-none before:absolute before:inset-0 before:opacity-0 before:transition-opacity before:duration-300 before:[background:radial-gradient(320px_circle_at_var(--x,50%)_var(--y,50%),hsl(var(--primary)/0.18),transparent_70%)] hover:before:opacity-100">
      {children}
    </div>
  );
}
