"use client";

import { useMemo, useRef, type ElementType } from "react";
import {
  motion,
  MotionConfig,
  useScroll,
  useTransform,
  type Variants,
} from "framer-motion";
import CountUp from "react-countup";
import ReadingProgress from "@/components/reading-progress";
import { AnimatedBackground } from "@/components/animated-background";
import { TiltShapes } from "@/components/tilt-shapes";
import {
  Trophy,
  Medal,
  Award,
  Calendar,
  Users,
  Megaphone,
  Mail,
  Phone,
  Sparkles,
  Shirt,
  Utensils,
  Gift,
  Server,
  CheckCircle2,
  Code2,
  ArrowRight,
  CheckCircle,
  CircleDot,
  Circle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import sponsorData from "@/data/sponsors.json";

interface Package {
  tier: string;
  slots: number;
  price: number;
  currency: string;
  highlight: boolean;
  benefits: string[];
}

const TIER_STYLES: Record<
  string,
  {
    icon: ElementType;
    ring: string;
    badge: string;
    glow: string;
    label: string;
    chip: string;
  }
> = {
  "Gold Sponsor": {
    icon: Trophy,
    ring: "border-amber-400/60 dark:border-amber-500/40",
    badge: "bg-amber-400 text-amber-950 hover:bg-amber-400",
    glow: "from-amber-400/20 via-amber-300/5 to-transparent",
    label: "text-amber-600 dark:text-amber-400",
    chip: "bg-amber-400/15",
  },
  "Silver Sponsor": {
    icon: Medal,
    ring: "border-slate-400/50 dark:border-slate-400/30",
    badge: "bg-slate-300 text-slate-900 hover:bg-slate-300",
    glow: "from-slate-300/20 via-slate-200/5 to-transparent",
    label: "text-slate-500 dark:text-slate-300",
    chip: "bg-slate-400/15",
  },
  "Bronze Sponsor": {
    icon: Award,
    ring: "border-orange-400/40 dark:border-orange-500/30",
    badge: "bg-orange-300 text-orange-950 hover:bg-orange-300",
    glow: "from-orange-400/20 via-orange-300/5 to-transparent",
    label: "text-orange-600 dark:text-orange-400",
    chip: "bg-orange-400/15",
  },
};

const OPPORTUNITY_ICONS: Record<string, ElementType> = {
  "T-Shirt Partner": Shirt,
  "Food & Beverage Partner": Utensils,
  "Gift & Award Partner": Gift,
  "Platform / Server Partner": Server,
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};

const staggerContainer: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.12, delayChildren: 0.05 },
  },
};

function Reveal({
  children,
  className,
  variants = fadeUp,
}: {
  children: React.ReactNode;
  className?: string;
  variants?: Variants;
}) {
  return (
    <motion.div
      className={className}
      variants={variants}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
    >
      {children}
    </motion.div>
  );
}

function DotGrid({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 opacity-[0.35] dark:opacity-[0.25] ${className}`}
      style={{
        backgroundImage:
          "radial-gradient(circle, currentColor 1px, transparent 1px)",
        backgroundSize: "26px 26px",
        maskImage:
          "radial-gradient(ellipse 70% 60% at 50% 0%, black 40%, transparent 90%)",
        WebkitMaskImage:
          "radial-gradient(ellipse 70% 60% at 50% 0%, black 40%, transparent 90%)",
      }}
    />
  );
}

function parseScheduleDate(dateLabel: string, year: number) {
  const parsed = new Date(`${dateLabel} ${year}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** A blurred blob that drifts continuously and drifts further as the page scrolls past it. */
function ParallaxBlob({
  className,
  parallax = 60,
  floatRange = 18,
  duration = 14,
}: {
  className: string;
  parallax?: number;
  floatRange?: number;
  duration?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], [-parallax, parallax]);

  return (
    <motion.div ref={ref} className="absolute inset-0 pointer-events-none" style={{ y }}>
      <motion.div
        className={`absolute rounded-full blur-3xl ${className}`}
        animate={{ x: [0, floatRange, 0], y: [0, -floatRange, 0] }}
        transition={{ duration, repeat: Infinity, ease: "easeInOut" }}
      />
    </motion.div>
  );
}

/** Fixed, page-wide ambient background that drifts slowly on its own and eases with scroll. */
function AmbientBackground() {
  const { scrollYProgress } = useScroll();
  const y = useTransform(scrollYProgress, [0, 1], [0, -240]);

  return (
    <motion.div
      aria-hidden
      className="fixed inset-0 -z-10 overflow-hidden pointer-events-none"
      style={{ y }}
    >
      <motion.div
        className="absolute top-[-12%] left-[-10%] w-[34rem] h-[34rem] rounded-full bg-green-500/10 blur-[120px]"
        animate={{ x: [0, 40, 0], y: [0, 30, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute top-[35%] right-[-14%] w-[30rem] h-[30rem] rounded-full bg-emerald-400/10 blur-[120px]"
        animate={{ x: [0, -35, 0], y: [0, -30, 0] }}
        transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-[-12%] left-[25%] w-[28rem] h-[28rem] rounded-full bg-teal-400/10 blur-[120px]"
        animate={{ x: [0, 25, 0], y: [0, -20, 0] }}
        transition={{ duration: 19, repeat: Infinity, ease: "easeInOut" }}
      />
    </motion.div>
  );
}

export default function SponsorsPage() {
  const {
    event,
    about,
    achievements,
    schedule,
    previousPartners,
    whySponsor,
    packages,
    otherOpportunities,
    contacts,
  } = sponsorData as {
    event: typeof sponsorData.event;
    about: typeof sponsorData.about;
    achievements: typeof sponsorData.achievements;
    schedule: typeof sponsorData.schedule;
    previousPartners: string[];
    whySponsor: string;
    packages: Package[];
    otherOpportunities: typeof sponsorData.otherOpportunities;
    contacts: typeof sponsorData.contacts;
  };

  const scheduleWithStatus = useMemo(() => {
    const now = new Date();
    let nextAssigned = false;
    return schedule.map((s) => {
      const date = parseScheduleDate(s.date, 2026);
      let status: "done" | "current" | "upcoming" = "upcoming";
      if (date) {
        if (date.getTime() < now.setHours(0, 0, 0, 0)) {
          status = "done";
        } else if (!nextAssigned) {
          status = "current";
          nextAssigned = true;
        }
      }
      return { ...s, status };
    });
  }, [schedule]);

  const stats = [
    { label: "Community Members", value: 7000, suffix: "+" },
    { label: "Sponsorship Tiers", value: packages.length, suffix: "" },
    { label: "Recent Achievements", value: achievements.length, suffix: "" },
    { label: "Past Partners", value: previousPartners.length, suffix: "+" },
  ];

  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress: heroProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const heroBgY = useTransform(heroProgress, [0, 1], [0, 120]);
  const heroContentY = useTransform(heroProgress, [0, 1], [0, -80]);
  const heroContentOpacity = useTransform(heroProgress, [0, 1], [1, 0]);

  const timelineRef = useRef<HTMLOListElement>(null);
  const { scrollYProgress: timelineFill } = useScroll({
    target: timelineRef,
    offset: ["start 0.8", "end 0.4"],
  });

  return (
    <MotionConfig reducedMotion="user">
      <ReadingProgress />
      <AmbientBackground />
      <div className="relative overflow-hidden">
        {/* ---------- Hero ---------- */}
        <section ref={heroRef} className="relative py-24 sm:py-32 overflow-hidden">
          <AnimatedBackground />
          <div className="absolute inset-0 bg-gradient-to-b from-green-50 via-background to-background dark:from-green-950/30 dark:via-background dark:to-background" />
          <DotGrid className="text-green-900 dark:text-green-100" />

          <motion.div className="absolute inset-0" style={{ y: heroBgY }}>
            <motion.div
              className="absolute -top-24 -left-24 w-96 h-96 bg-green-500/10 rounded-full blur-3xl"
              animate={{ x: [0, 26, 0], y: [0, 18, 0] }}
              transition={{ duration: 13, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
              className="absolute top-10 right-0 w-80 h-80 bg-emerald-400/10 rounded-full blur-3xl"
              animate={{ x: [0, -22, 0], y: [0, 24, 0] }}
              transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
              className="absolute bottom-0 left-1/3 w-72 h-72 bg-teal-400/10 rounded-full blur-3xl"
              animate={{ x: [0, 18, 0], y: [0, -16, 0] }}
              transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
            />
          </motion.div>

          <TiltShapes />

          <motion.div
            className="container relative z-10 mx-auto px-4 text-center max-w-4xl"
            initial="hidden"
            animate="show"
            variants={staggerContainer}
            style={{ y: heroContentY, opacity: heroContentOpacity }}
          >
            <motion.div variants={fadeUp}>
              <Badge
                variant="outline"
                className="mb-6 px-4 py-1.5 rounded-full bg-green-50/60 dark:bg-green-950/30 border-green-200 dark:border-green-800 backdrop-blur-sm"
              >
                <Code2 className="w-3.5 h-3.5 mr-1.5" />
                {event.organizer}
              </Badge>
            </motion.div>

            <motion.h1
              variants={fadeUp}
              className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight"
            >
              <span className="bg-gradient-to-r from-green-600 via-green-500 to-emerald-500 bg-clip-text text-transparent bg-[length:200%_auto] animate-[gradient-shift_6s_ease_infinite]">
                {event.name}
              </span>
            </motion.h1>

            <motion.p
              variants={fadeUp}
              className="mt-4 text-sm text-muted-foreground uppercase tracking-[0.2em] font-medium"
            >
              {event.tagline}
            </motion.p>

            <motion.p
              variants={fadeUp}
              className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed"
            >
              Partner with Bangladesh&apos;s next generation of problem-solvers.
              Put your brand in front of 7,000+ engaged, technically sharp
              students.
            </motion.p>

            <motion.div
              variants={fadeUp}
              className="mt-8 flex flex-wrap gap-3 justify-center"
            >
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                <Button size="lg" className="rounded-xl px-8 group" asChild>
                  <a href="#packages">
                    View Sponsorship Packages
                    <ArrowRight className="ml-1.5 w-4 h-4 transition-transform group-hover:translate-x-1" />
                  </a>
                </Button>
              </motion.div>
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                <Button
                  size="lg"
                  variant="outline"
                  className="rounded-xl px-8 backdrop-blur-sm"
                  asChild
                >
                  <a href="#contact">Contact the Team</a>
                </Button>
              </motion.div>
            </motion.div>

            <motion.div
              variants={fadeUp}
              className="mt-16 grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-4 max-w-2xl mx-auto"
            >
              {stats.map((s) => (
                <div key={s.label}>
                  <p className="text-2xl sm:text-3xl font-bold text-primary">
                    <CountUp
                      end={s.value}
                      duration={2.2}
                      separator=","
                      suffix={s.suffix}
                      enableScrollSpy
                      scrollSpyOnce
                    />
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 leading-snug">
                    {s.label}
                  </p>
                </div>
              ))}
            </motion.div>
          </motion.div>

          <motion.div
            className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 text-muted-foreground/50"
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 4v14m0 0l-6-6m6 6l6-6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </motion.div>
        </section>

        {/* ---------- About ---------- */}
        <section className="relative overflow-hidden container mx-auto px-4 py-16 max-w-5xl">
          <ParallaxBlob className="top-0 right-0 w-64 h-64 bg-green-500/10" />
          <motion.div
            className="grid md:grid-cols-2 gap-8"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
            variants={staggerContainer}
          >
            {[
              { icon: Sparkles, title: "About the Events", body: about.eventDescription },
              { icon: Users, title: "About GUCC", body: about.clubDescription },
            ].map((item) => (
              <motion.div key={item.title} variants={fadeUp} whileHover={{ y: -4 }}>
                <Card className="h-full border-green-200/60 dark:border-green-900/50 transition-shadow hover:shadow-lg hover:shadow-green-500/5">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary shrink-0">
                        <item.icon className="w-5 h-5" />
                      </span>
                      <h2 className="font-semibold text-lg">{item.title}</h2>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground leading-relaxed text-sm">
                      {item.body}
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </section>

        {/* ---------- Achievements ---------- */}
        <section className="bg-muted/30 py-16 relative overflow-hidden">
          <ParallaxBlob className="bottom-0 left-0 w-72 h-72 bg-emerald-400/10" duration={17} />
          <div className="container mx-auto px-4 max-w-5xl">
            <Reveal className="text-center mb-10">
              <h2 className="text-2xl sm:text-3xl font-bold mb-2">
                Our Achievements
              </h2>
              <p className="text-muted-foreground">
                A track record that speaks for itself
              </p>
            </Reveal>
            <motion.div
              className="grid sm:grid-cols-2 gap-5"
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-80px" }}
              variants={staggerContainer}
            >
              {achievements.map((a, i) => (
                <motion.div
                  key={a.title}
                  variants={fadeUp}
                  whileHover={{ y: -3 }}
                  className="group relative flex gap-4 p-5 rounded-xl bg-background border border-border/60 overflow-hidden transition-colors hover:border-primary/40"
                >
                  <span className="absolute right-3 top-2 text-4xl font-black text-primary/5 select-none group-hover:text-primary/10 transition-colors">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="relative flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 text-primary shrink-0 mt-0.5 transition-transform group-hover:scale-110 group-hover:rotate-6">
                    <Trophy className="w-4.5 h-4.5" />
                  </span>
                  <div className="relative">
                    <p className="font-semibold text-sm">{a.title}</p>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                      {a.description}
                    </p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ---------- Schedule ---------- */}
        <section className="container mx-auto px-4 py-16 max-w-3xl">
          <Reveal className="flex items-center justify-center gap-2 mb-12">
            <Calendar className="w-5 h-5 text-primary" />
            <h2 className="text-2xl sm:text-3xl font-bold">Program Schedule</h2>
          </Reveal>
          <motion.ol
            ref={timelineRef}
            className="relative ml-3"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
            variants={staggerContainer}
          >
            <span className="absolute left-0 top-1 bottom-1 w-px bg-border" />
            <motion.span
              className="absolute left-0 top-1 bottom-1 w-px bg-gradient-to-b from-primary to-emerald-400 origin-top"
              style={{ scaleY: timelineFill }}
            />
            {scheduleWithStatus.map((s, i) => (
              <motion.li
                key={s.label}
                variants={fadeUp}
                className="relative mb-9 ml-6 last:mb-0"
              >
                <span
                  className={`absolute -left-[33px] flex items-center justify-center w-6 h-6 rounded-full border-2 ${
                    s.status === "done"
                      ? "bg-primary border-primary text-primary-foreground"
                      : s.status === "current"
                        ? "bg-background border-primary text-primary"
                        : "bg-background border-border text-muted-foreground"
                  }`}
                >
                  {s.status === "done" ? (
                    <CheckCircle className="w-3.5 h-3.5" />
                  ) : s.status === "current" ? (
                    <>
                      <CircleDot className="w-3.5 h-3.5" />
                      <span className="absolute inset-0 rounded-full bg-primary/30 animate-ping" />
                    </>
                  ) : (
                    <Circle className="w-2.5 h-2.5 fill-current" />
                  )}
                </span>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xs font-medium text-primary uppercase tracking-wide">
                    Step {i + 1}
                  </p>
                  {s.status === "current" && (
                    <Badge className="rounded-full px-2 py-0 text-[10px] bg-primary/15 text-primary hover:bg-primary/15 border-0">
                      Next Up
                    </Badge>
                  )}
                </div>
                <p className="font-semibold">{s.label}</p>
                <p className="text-sm text-muted-foreground">{s.date}, 2026</p>
              </motion.li>
            ))}
          </motion.ol>
        </section>

        {/* ---------- Why Sponsor ---------- */}
        <section className="relative py-16 bg-gradient-to-br from-green-600 to-emerald-600 text-white overflow-hidden">
          <motion.div
            className="absolute -top-16 -right-16 w-64 h-64 bg-white/10 rounded-full blur-3xl"
            animate={{ scale: [1, 1.15, 1] }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute -bottom-20 -left-10 w-72 h-72 bg-white/10 rounded-full blur-3xl"
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
          />
          <Reveal className="relative container mx-auto px-4 max-w-4xl text-center">
            <motion.div
              animate={{ rotate: [0, -8, 8, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="inline-block mb-4"
            >
              <Megaphone className="w-8 h-8 opacity-90" />
            </motion.div>
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">Why Sponsor Us</h2>
            <p className="leading-relaxed text-green-50/95 text-sm sm:text-base">
              {whySponsor}
            </p>
          </Reveal>
        </section>

        {/* ---------- Packages ---------- */}
        <section
          id="packages"
          className="relative overflow-hidden container mx-auto px-4 py-20 max-w-6xl"
        >
          <ParallaxBlob className="top-1/4 right-0 w-80 h-80 bg-amber-400/10" duration={20} />
          <Reveal className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-2">
              Sponsorship Packages
            </h2>
            <p className="text-muted-foreground">
              Choose the tier that fits your brand&apos;s ambitions
            </p>
          </Reveal>

          <motion.div
            className="grid md:grid-cols-3 gap-6 items-start"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
            variants={staggerContainer}
          >
            {packages.map((pkg) => {
              const style = TIER_STYLES[pkg.tier];
              const Icon = style?.icon ?? Award;
              return (
                <motion.div
                  key={pkg.tier}
                  variants={fadeUp}
                  whileHover={{ y: pkg.highlight ? -16 : -6 }}
                  className={pkg.highlight ? "md:-translate-y-3" : ""}
                >
                  <Card
                    className={`relative overflow-hidden border-2 ${style?.ring} transition-shadow ${
                      pkg.highlight
                        ? "shadow-xl shadow-primary/10"
                        : "shadow-sm hover:shadow-lg"
                    }`}
                  >
                    <div
                      className={`absolute inset-0 bg-gradient-to-b ${style?.glow} pointer-events-none`}
                    />
                    {pkg.highlight && (
                      <Badge className="absolute top-4 right-4 bg-primary text-primary-foreground animate-pulse">
                        Most Prestige
                      </Badge>
                    )}
                    <CardHeader className="relative">
                      <span
                        className={`flex items-center justify-center w-12 h-12 rounded-xl mb-2 ${style?.chip} ${style?.label}`}
                      >
                        <Icon className="w-6 h-6" />
                      </span>
                      <p className={`text-xs font-semibold uppercase tracking-wide ${style?.label}`}>
                        Only {pkg.slots} slot{pkg.slots > 1 ? "s" : ""} available
                      </p>
                      <h3 className="text-xl font-bold">{pkg.tier}</h3>
                      <p className="text-3xl font-bold mt-1">
                        ৳
                        <CountUp
                          end={pkg.price}
                          duration={1.6}
                          separator=","
                          enableScrollSpy
                          scrollSpyOnce
                        />
                        <span className="text-sm font-normal text-muted-foreground">
                          {" "}
                          {pkg.currency}
                        </span>
                      </p>
                    </CardHeader>
                    <CardContent className="relative">
                      <ul className="space-y-3">
                        {pkg.benefits.map((b) => (
                          <li key={b} className="flex gap-2 text-sm">
                            <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                            <span className="text-muted-foreground">{b}</span>
                          </li>
                        ))}
                      </ul>
                      <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                        <Button
                          className="w-full mt-6 rounded-lg"
                          variant={pkg.highlight ? "default" : "outline"}
                          asChild
                        >
                          <a href="#contact">
                            Become a {pkg.tier.split(" ")[0]} Sponsor
                          </a>
                        </Button>
                      </motion.div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </motion.div>
        </section>

        {/* ---------- Other Opportunities ---------- */}
        <section className="bg-muted/30 py-16 relative overflow-hidden">
          <ParallaxBlob className="top-0 left-1/4 w-72 h-72 bg-green-500/10" duration={15} />
          <div className="container mx-auto px-4 max-w-5xl">
            <Reveal className="text-center mb-10">
              <h2 className="text-2xl sm:text-3xl font-bold">
                Other Partnership Opportunities
              </h2>
            </Reveal>
            <motion.div
              className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5"
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-80px" }}
              variants={staggerContainer}
            >
              {otherOpportunities.map((o) => {
                const Icon = OPPORTUNITY_ICONS[o.title] ?? Gift;
                return (
                  <motion.div
                    key={o.title}
                    variants={fadeUp}
                    whileHover={{ y: -4, scale: 1.02 }}
                    className="group p-5 rounded-xl bg-background border border-border/60 text-center transition-colors hover:border-primary/50"
                  >
                    <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-primary/10 text-primary mb-3 transition-transform group-hover:scale-110">
                      <Icon className="w-5 h-5" />
                    </span>
                    <p className="font-semibold text-sm">{o.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">{o.detail}</p>
                  </motion.div>
                );
              })}
            </motion.div>
            <Reveal className="text-center mt-8">
              <p className="text-sm text-muted-foreground max-w-xl mx-auto">
                Join hands with us in empowering the next generation of software
                engineers — explore exclusive partnership options to make an
                impact on campus and beyond.
              </p>
            </Reveal>
          </div>
        </section>

        {/* ---------- Previous Partners ---------- */}
        <section className="py-16 overflow-hidden">
          <Reveal className="container mx-auto px-4 max-w-5xl text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold">
              Our Previous Sponsoring Partners
            </h2>
          </Reveal>
          <div
            className="relative w-full overflow-hidden"
            style={{
              maskImage:
                "linear-gradient(to right, transparent, black 10%, black 90%, transparent)",
              WebkitMaskImage:
                "linear-gradient(to right, transparent, black 10%, black 90%, transparent)",
            }}
          >
            <div
              className="flex w-max gap-3 animate-marquee hover:[animation-play-state:paused]"
              style={{ animationDuration: `${Math.max(previousPartners.length * 3.5, 20)}s` }}
            >
              {[...previousPartners, ...previousPartners, ...previousPartners].map(
                (p, i) => (
                  <span
                    key={`${p}-${i}`}
                    className="px-4 py-2 rounded-full border border-border/60 bg-background text-sm text-muted-foreground whitespace-nowrap"
                  >
                    {p}
                  </span>
                )
              )}
            </div>
          </div>
        </section>

        {/* ---------- Contact ---------- */}
        <section id="contact" className="container mx-auto px-4 py-20 max-w-4xl">
          <Reveal className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold mb-2">Get in Touch</h2>
            <p className="text-muted-foreground">
              Ready to partner with us? Reach out directly.
            </p>
          </Reveal>
          <motion.div
            className="grid sm:grid-cols-2 gap-6"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
            variants={staggerContainer}
          >
            {contacts.map((c) => (
              <motion.div key={c.name} variants={fadeUp} whileHover={{ y: -4 }}>
                <Card className="h-full border-green-200/60 dark:border-green-900/50 transition-shadow hover:shadow-lg hover:shadow-green-500/5">
                  <CardContent className="pt-6">
                    <p className="font-semibold">{c.name}</p>
                    <p className="text-xs text-muted-foreground mb-4">{c.role}</p>
                    <div className="space-y-2 text-sm">
                      <a
                        href={`tel:${c.phone.replace(/\s/g, "")}`}
                        className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors"
                      >
                        <Phone className="w-4 h-4" /> {c.phone}
                      </a>
                      <a
                        href={`mailto:${c.email}`}
                        className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors"
                      >
                        <Mail className="w-4 h-4" /> {c.email}
                      </a>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </section>
      </div>
    </MotionConfig>
  );
}
