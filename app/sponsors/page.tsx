"use client";

import {
  useEffect,
  useRef,
  useState,
  type ElementType,
} from "react";
import Image from "next/image";
import Link from "next/link";
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
import { Trophy, Medal, Award, Calendar, Users, Megaphone, Mail, Sparkles, Shirt, Utensils, Gift, Server, Code2, ArrowRight, Briefcase, Share2, MapPin, GraduationCap, Lightbulb, ExternalLink, Star, Zap, ChevronDown, Mic, Phone, Check, X, Laptop, Calculator, Terminal, Shield, Hash, Sigma, Building2, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import sponsorData from "@/data/sponsors.json";

/* ─── Types ─────────────────────────────────────────── */
interface Partner {
  name: string;
  logo: string;
}

interface Package {
  tier: string;
  slots: number;
  price: number;
  currency: string;
  highlight: boolean;
  benefits: string[];
}

interface ScheduleItem {
  label: string;
  date: string;
  description: string;
}

interface Contact {
  name: string;
  role: string;
  organization: string;
  phone: string;
  email: string;
  website: string;
}

interface OtherOpportunity {
  title: string;
  detail: string;
  description: string;
}

interface Program {
  id: string;
  name: string;
  shortName: string;
  category: string;
  featured: boolean;
  description: string;
  components?: string[];
  sponsorValue: string[];
  eventSlug: string;
}

interface ComparisonFeature {
  feature: string;
  gold: boolean;
  silver: boolean;
  bronze: boolean;
}

/* ─── Premium tier palette ───────────────────────────── */
const TIER_CONFIG: Record<
  string,
  {
    icon: ElementType;
    accentColor: string;
    cardBg: string;
    shadow: string;
    topGlow: string;
    hoverGlow: string;
    divider: string;
    badgeBorder: string;
    badgeBg: string;
    checkBg: string;
    checkBorder: string;
    btnBg: string;
    btnBorder: string;
    btnHoverBg: string;
  }
> = {
  "Gold Sponsor": {
    icon: Trophy,
    accentColor: "#C9A84C",
    cardBg: "rgba(255,255,255,0.02)",
    shadow: "0 4px 24px -1px rgba(0,0,0,0.2)",
    topGlow: "transparent",
    hoverGlow: "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(201,168,76,0.15) 0%, transparent 70%)",
    divider: "rgba(255,255,255,0.1)",
    badgeBorder: "rgba(201,168,76,0.5)",
    badgeBg: "rgba(201,168,76,0.1)",
    checkBg: "rgba(201,168,76,0.1)",
    checkBorder: "rgba(201,168,76,0.3)",
    btnBg: "#C9A84C",
    btnBorder: "transparent",
    btnHoverBg: "#D4B45A",
  },
  "Silver Sponsor": {
    icon: Medal,
    accentColor: "#94a3b8",
    cardBg: "transparent",
    shadow: "none",
    topGlow: "transparent",
    hoverGlow: "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(148,163,184,0.1) 0%, transparent 70%)",
    divider: "rgba(255,255,255,0.08)",
    badgeBorder: "rgba(148,163,184,0.3)",
    badgeBg: "transparent",
    checkBg: "rgba(148,163,184,0.1)",
    checkBorder: "rgba(148,163,184,0.2)",
    btnBg: "rgba(255,255,255,0.05)",
    btnBorder: "rgba(148,163,184,0.3)",
    btnHoverBg: "rgba(255,255,255,0.1)",
  },
  "Bronze Sponsor": {
    icon: Award,
    accentColor: "#A0714F",
    cardBg: "transparent",
    shadow: "none",
    topGlow: "transparent",
    hoverGlow: "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(160,113,79,0.1) 0%, transparent 70%)",
    divider: "rgba(255,255,255,0.08)",
    badgeBorder: "rgba(160,113,79,0.3)",
    badgeBg: "transparent",
    checkBg: "rgba(160,113,79,0.1)",
    checkBorder: "rgba(160,113,79,0.2)",
    btnBg: "rgba(255,255,255,0.05)",
    btnBorder: "rgba(160,113,79,0.3)",
    btnHoverBg: "rgba(255,255,255,0.1)",
  },
};

const OPPORTUNITY_ICONS: Record<string, ElementType> = {
  "T-Shirt Partner": Shirt,
  "Food & Beverage Partner": Utensils,
  "Gift & Award Partner": Gift,
  "Platform / Server Partner": Server,
};

const WHY_ICONS: Record<string, ElementType> = {
  Users,
  Megaphone,
  Briefcase,
  Share2,
  MapPin,
  GraduationCap,
  Lightbulb,
  Mic,
};

const PROGRAM_ICONS: Record<string, ElementType> = {
  "cse-carnival": Sparkles,
  iupc: Code2,
  "ict-olympiad": Laptop,
  "math-olympiad": Calculator,
  workshops: GraduationCap,
};

/* ─── Animation variants ─────────────────────────────── */
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 32 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] },
  },
};

const slideLeft: Variants = {
  hidden: { opacity: 0, x: -40 },
  show: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
  },
};

const staggerContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
};

const staggerFast: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

/* ─── Terminal Typing Animation ──────────────────────── */
const TYPING_PHRASES = [
  "Inter University Programming Contest",
  "Cyber Security Contest (CTF)",
  "ICT Olympiad",
  "Math Olympiad",
];

function TerminalTyping() {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [displayed, setDisplayed] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [cursorVisible, setCursorVisible] = useState(true);

  useEffect(() => {
    const id = setInterval(() => setCursorVisible((v) => !v), 530);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const phrase = TYPING_PHRASES[phraseIndex];
    let timeout: ReturnType<typeof setTimeout>;
    if (!isDeleting && displayed === phrase) {
      timeout = setTimeout(() => setIsDeleting(true), 2200);
    } else if (isDeleting && displayed === "") {
      setIsDeleting(false);
      setPhraseIndex((i) => (i + 1) % TYPING_PHRASES.length);
    } else {
      timeout = setTimeout(
        () =>
          setDisplayed((d) =>
            isDeleting ? d.slice(0, -1) : phrase.slice(0, d.length + 1)
          ),
        isDeleting ? 28 : 58
      );
    }
    return () => clearTimeout(timeout);
  }, [displayed, isDeleting, phraseIndex]);

  return (
    <span className="inline-flex items-center font-mono text-sm text-muted-foreground">
      {displayed}
      <span
        aria-hidden
        className={`ml-0.5 inline-block w-[2px] h-[1em] bg-primary align-middle transition-opacity duration-100 ${
          cursorVisible ? "opacity-100" : "opacity-0"
        }`}
      />
    </span>
  );
}

/* ─── Shared primitives ──────────────────────────────── */
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
      viewport={{ once: true, margin: "-72px" }}
    >
      {children}
    </motion.div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-widest border border-primary/30 bg-primary/8 text-primary mb-4">
      {children}
    </span>
  );
}

function SectionHeading({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={`text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-tight ${className}`}
    >
      {children}
    </h2>
  );
}

function DotGrid({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 opacity-30 dark:opacity-20 ${className}`}
      style={{
        backgroundImage:
          "radial-gradient(circle, currentColor 1px, transparent 1px)",
        backgroundSize: "28px 28px",
        maskImage:
          "radial-gradient(ellipse 80% 60% at 50% 0%, black 30%, transparent 90%)",
        WebkitMaskImage:
          "radial-gradient(ellipse 80% 60% at 50% 0%, black 30%, transparent 90%)",
      }}
    />
  );
}

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
    <motion.div
      ref={ref}
      className="absolute inset-0 pointer-events-none"
      style={{ y }}
    >
      <motion.div
        className={`absolute rounded-full blur-3xl ${className}`}
        animate={{ x: [0, floatRange, 0], y: [0, -floatRange, 0] }}
        transition={{ duration, repeat: Infinity, ease: "easeInOut" }}
      />
    </motion.div>
  );
}

function AmbientBackground() {
  const { scrollYProgress } = useScroll();
  const y = useTransform(scrollYProgress, [0, 1], [0, -300]);
  return (
    <motion.div
      aria-hidden
      className="fixed inset-0 -z-10 overflow-hidden pointer-events-none"
      style={{ y }}
    >
      <motion.div
        className="absolute top-[-12%] left-[-10%] w-[40rem] h-[40rem] rounded-full bg-green-500/8 blur-[140px]"
        animate={{ x: [0, 40, 0], y: [0, 30, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute top-[35%] right-[-14%] w-[34rem] h-[34rem] rounded-full bg-emerald-400/8 blur-[140px]"
        animate={{ x: [0, -35, 0], y: [0, -30, 0] }}
        transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-[-12%] left-[25%] w-[32rem] h-[32rem] rounded-full bg-teal-400/8 blur-[140px]"
        animate={{ x: [0, 25, 0], y: [0, -20, 0] }}
        transition={{ duration: 19, repeat: Infinity, ease: "easeInOut" }}
      />
    </motion.div>
  );
}

/* ─── Code Visual (Hero Right) ───────────────────────── */
function CodeVisual() {
  return (
    <div className="relative h-[480px] w-full select-none pointer-events-none">
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-64 h-64 rounded-full bg-primary/10 blur-[60px]" />
      </div>

      {/* Terminal window */}
      <motion.div
        className="absolute top-0 left-4 right-4 rounded-2xl border border-border/60 bg-background/90 backdrop-blur-md shadow-2xl shadow-black/20 overflow-hidden"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.3 }}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50 bg-muted/30">
          <span className="w-3 h-3 rounded-full bg-red-400/70" />
          <span className="w-3 h-3 rounded-full bg-yellow-400/70" />
          <span className="w-3 h-3 rounded-full bg-green-400/70" />
          <span className="ml-3 text-xs font-mono text-muted-foreground">
            contest_runner.py
          </span>
        </div>
        <div className="px-5 py-4 font-mono text-xs leading-relaxed space-y-0.5">
          {[
            { n: 1, c: "text-muted-foreground/50", t: "# CSE CARNIVAL 2026 · GUCC" },
            { n: 2, c: "", t: "" },
            {
              n: 3,
              c: "text-blue-400/80",
              t: "from",
              rest: " gucc import Carnival, Contest",
            },
            { n: 4, c: "", t: "" },
            {
              n: 5,
              c: "text-violet-400/80",
              t: "carnival",
              rest: " = Carnival(",
            },
            {
              n: 6,
              c: "text-muted-foreground",
              t: '    name="CSE Carnival 2026",',
            },
            { n: 7, c: "text-muted-foreground", t: "    contests=4," },
            { n: 8, c: "text-muted-foreground", t: "    participants=500," },
            {
              n: 9,
              c: "text-muted-foreground",
              t: '    venue="Green University"',
            },
            { n: 10, c: "text-muted-foreground", t: ")" },
            { n: 11, c: "", t: "" },
            {
              n: 12,
              c: "text-primary/80",
              t: "carnival.run()",
              rest: "  # 🚀 starting...",
            },
          ].map((line) => (
            <div key={line.n} className="flex gap-4">
              <span className="w-5 shrink-0 text-right text-muted-foreground/30 select-none">
                {line.n}
              </span>
              <span>
                <span className={line.c}>{line.t}</span>
                {line.rest && (
                  <span className="text-foreground/70">{line.rest}</span>
                )}
              </span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Grid decoration */}
      <svg
        className="absolute inset-0 w-full h-full opacity-[0.04] dark:opacity-[0.07]"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern
            id="code-grid"
            width="32"
            height="32"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 32 0 L 0 0 0 32"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.5"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#code-grid)" />
      </svg>
    </div>
  );
}

/* ─── Partners Marquee ───────────────────────────────── */
function PartnersMarquee({ partners }: { partners: Partner[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);
  const draggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartScrollRef = useRef(0);
  const movedRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const loop = [...partners, ...partners, ...partners];

  const setPaused = (v: boolean) => { pausedRef.current = v; };

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollLeft = track.scrollWidth / 3;
    let frameId: number;
    const speed = 0.55;
    const step = () => {
      const w = track.scrollWidth / 3;
      if (!pausedRef.current && !draggingRef.current && w > 0) {
        track.scrollLeft += speed;
        if (track.scrollLeft >= w * 2) track.scrollLeft -= w;
        else if (track.scrollLeft <= 0) track.scrollLeft += w;
      }
      frameId = requestAnimationFrame(step);
    };
    frameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameId);
  }, [partners.length]);

  const startDrag = (clientX: number) => {
    const track = trackRef.current;
    if (!track) return;
    draggingRef.current = true;
    movedRef.current = false;
    setIsDragging(true);
    dragStartXRef.current = clientX;
    dragStartScrollRef.current = track.scrollLeft;
  };
  const moveDrag = (clientX: number) => {
    const track = trackRef.current;
    if (!track || !draggingRef.current) return;
    const dx = clientX - dragStartXRef.current;
    if (Math.abs(dx) > 3) movedRef.current = true;
    track.scrollLeft = dragStartScrollRef.current - dx;
  };
  const endDrag = () => { draggingRef.current = false; setIsDragging(false); };

  useEffect(() => {
    const onMove = (e: MouseEvent) => moveDrag(e.clientX);
    const onUp = () => endDrag();
    if (isDragging) {
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    }
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isDragging]);

  return (
    <section className="py-20 overflow-hidden relative">
      <ParallaxBlob className="top-0 left-1/4 w-72 h-72 bg-green-500/10" duration={20} />
      <Reveal className="container mx-auto px-4 max-w-5xl text-center mb-10">
        <SectionLabel>
          <Star className="w-3 h-3" /> Previous Partners
        </SectionLabel>
        <SectionHeading>
          Trusted by Our{" "}
          <span className="bg-gradient-to-r from-green-500 to-emerald-400 bg-clip-text text-transparent">
            Previous Partners
          </span>
        </SectionHeading>
        <p className="text-muted-foreground mt-3 text-base">
          Leading brands and organizations that have trusted GUCC — drag
          to browse.
        </p>
      </Reveal>

      <div
        className="relative w-full"
        style={{
          maskImage:
            "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
          WebkitMaskImage:
            "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
        }}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => { setPaused(false); endDrag(); }}
        onTouchStart={() => setPaused(true)}
        onTouchEnd={() => setPaused(false)}
      >
        <div
          ref={trackRef}
          className={`flex w-full gap-5 overflow-x-auto py-4 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden ${
            isDragging ? "cursor-grabbing" : "cursor-grab"
          }`}
          onMouseDown={(e) => { e.preventDefault(); startDrag(e.clientX); }}
          onDragStart={(e) => e.preventDefault()}
          onClickCapture={(e) => { if (movedRef.current) e.preventDefault(); }}
        >
          {loop.map((p, i) => (
            <div
              key={`${p.name}-${i}`}
              className="group flex items-center justify-center h-24 w-44 sm:w-48 shrink-0 rounded-2xl border border-border/60 bg-background/80 backdrop-blur-sm px-4 py-3 transition-all duration-300 hover:border-primary/40 hover:-translate-y-1"
              style={{ transition: "all 0.3s ease" }}
              title={p.name}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.boxShadow = "0 0 20px rgba(34,197,94,0.25), 0 0 40px rgba(34,197,94,0.10)";
                (e.currentTarget as HTMLDivElement).style.transform = "scale(1.05) translateY(-4px)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.boxShadow = "";
                (e.currentTarget as HTMLDivElement).style.transform = "";
              }}
            >
              <div className="relative h-full w-full">
                <Image
                  src={p.logo}
                  alt={p.name}
                  fill
                  sizes="(max-width: 640px) 176px, 192px"
                  draggable={false}
                  className="object-contain opacity-90 transition-all duration-300 pointer-events-none select-none"
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Gallery ────────────────────────────────────────── */
const GALLERY_IMAGES = [65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 78];

function Gallery() {
  const row1 = GALLERY_IMAGES.slice(0, 6);
  const row2 = GALLERY_IMAGES.slice(6, 12);
  
  return (
    <section id="gallery" className="py-24 relative overflow-hidden bg-background">
      <div className="container mx-auto px-4 max-w-6xl relative z-10 mb-16">
        <Reveal className="text-center">
          <SectionLabel>
            <Sparkles className="w-3 h-3" /> Flashbacks
          </SectionLabel>
          <SectionHeading>
            Moments from{" "}
            <span className="bg-gradient-to-r from-green-500 to-emerald-400 bg-clip-text text-transparent">
              Our Events
            </span>
          </SectionHeading>
        </Reveal>
      </div>
      
      <div className="flex flex-col gap-6 overflow-hidden">
        {/* Row 1 */}
        <motion.div
          className="flex gap-6 w-max"
          animate={{ x: ["0%", "-50%"] }}
          transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
        >
          {[...row1, ...row1].map((n, idx) => (
            <div key={`${n}-${idx}`} className="relative w-[280px] sm:w-[400px] aspect-[4/3] rounded-3xl overflow-hidden shadow-lg border border-border/40 shrink-0 group">
              <Image src={`/events/${n}.jpg`} alt="Event" fill sizes="(max-width: 640px) 280px, 400px" className="object-cover transition-transform duration-700 group-hover:scale-105" />
              <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors duration-500" />
            </div>
          ))}
        </motion.div>
        
        {/* Row 2 */}
        <motion.div
          className="flex gap-6 w-max"
          animate={{ x: ["-50%", "0%"] }}
          transition={{ duration: 45, repeat: Infinity, ease: "linear" }}
        >
          {[...row2, ...row2].map((n, idx) => (
            <div key={`${n}-${idx}`} className="relative w-[240px] sm:w-[320px] aspect-video rounded-3xl overflow-hidden shadow-lg border border-border/40 shrink-0 group">
              <Image src={`/events/${n}.jpg`} alt="Event" fill sizes="(max-width: 640px) 240px, 320px" className="object-cover transition-transform duration-700 group-hover:scale-105" />
              <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors duration-500" />
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/* ─── Benefit checklist item ─────────────────────────── */
function BenefitItem({
  text,
  accentColor,
  checkBg,
  checkBorder,
  textClass = "text-zinc-300",
}: {
  text: string;
  accentColor: string;
  checkBg: string;
  checkBorder: string;
  textClass?: string;
}) {
  return (
    <li className="flex items-start gap-3 text-sm">
      <span
        className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
        style={{ background: checkBg, border: `1px solid ${checkBorder}` }}
      >
        <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
          <path
            d="M1 3l2 2 4-4"
            stroke={accentColor}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className={`leading-snug ${textClass}`}>{text}</span>
    </li>
  );
}

function SponsorNav() {
  const [active, setActive] = useState("");
  const [isHidden, setIsHidden] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const sections = ["programs", "packages", "gallery"];
      let current = "";
      for (const section of sections) {
        const el = document.getElementById(section);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= 200 && rect.bottom >= 200) current = section;
        }
      }
      setActive(current);

      const scrolledToBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 300;
      setIsHidden(scrolledToBottom);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <motion.div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-auto"
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: isHidden ? 100 : 0, opacity: isHidden ? 0 : 1 }}
      transition={{ delay: 0.1, duration: 0.3 }}
    >
      <div className="flex items-center gap-1 p-1.5 rounded-full bg-background/80 backdrop-blur-xl border border-border shadow-2xl">
        {[
          { id: "programs", icon: Star, label: "Programs" },
          { id: "packages", icon: Gift, label: "Packages" },
          { id: "gallery", icon: Sparkles, label: "Gallery" },
        ].map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          return (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-300 ${
                isActive
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "hover:bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="text-sm font-medium hidden sm:inline-block">{item.label}</span>
            </a>
          );
        })}
      </div>
    </motion.div>
  );
}

/* ─── Main Page ──────────────────────────────────────── */
export default function SponsorsPage() {
  const {
    event,
    about,
    achievements,
    schedule,
    previousPartners,
    whySponsorReasons,
    packages,
    otherOpportunities,
    contacts,
    programs,
    comparisonFeatures,
  } = sponsorData as {
    event: typeof sponsorData.event;
    about: typeof sponsorData.about;
    achievements: typeof sponsorData.achievements;
    schedule: ScheduleItem[];
    previousPartners: Partner[];
    whySponsorReasons: typeof sponsorData.whySponsorReasons;
    packages: Package[];
    otherOpportunities: OtherOpportunity[];
    contacts: Contact[];
    programs: Program[];
    comparisonFeatures: ComparisonFeature[];
  };

  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress: heroProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const heroBgY = useTransform(heroProgress, [0, 1], [0, 140]);
  const heroContentY = useTransform(heroProgress, [0, 1], [0, -90]);
  const heroContentOpacity = useTransform(heroProgress, [0, 1], [1, 0]);

  const timelineRef = useRef<HTMLOListElement>(null);
  const { scrollYProgress: timelineFill } = useScroll({
    target: timelineRef,
    offset: ["start 0.8", "end 0.4"],
  });

  const stats = [
    { label: "Community Members", value: 7000, suffix: "+" },
    { label: "University Connections", value: 50, suffix: "+" },
    { label: "Club Partners", value: 10, suffix: "+" },
    { label: "Company Collaborations", value: 12, suffix: "+" },
  ];

  return (
    <MotionConfig reducedMotion="user">
      <ReadingProgress />
      <AmbientBackground />
      <SponsorNav />

      <div className="relative overflow-hidden">
        {/* ══ SECTION 1 — HERO ══════════════════════════════ */}
        <section
          ref={heroRef}
          className="relative min-h-screen flex items-center overflow-hidden"
          aria-label="Hero — Become our partner"
        >
          <AnimatedBackground />
          <div className="absolute inset-0 bg-gradient-to-br from-green-50/80 via-background to-background dark:from-green-950/25 dark:via-background dark:to-background" />
          <DotGrid className="text-green-800 dark:text-green-100" />

          <motion.div className="absolute inset-0" style={{ y: heroBgY }}>
            <motion.div
              className="absolute -top-32 -left-32 w-[36rem] h-[36rem] bg-green-500/12 rounded-full blur-[100px]"
              animate={{ x: [0, 30, 0], y: [0, 20, 0] }}
              transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
              className="absolute top-20 right-0 w-[28rem] h-[28rem] bg-emerald-400/10 rounded-full blur-[100px]"
              animate={{ x: [0, -20, 0], y: [0, 28, 0] }}
              transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
              className="absolute bottom-0 left-1/3 w-[24rem] h-[24rem] bg-teal-400/10 rounded-full blur-[100px]"
              animate={{ x: [0, 18, 0], y: [0, -14, 0] }}
              transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
            />
          </motion.div>

          <TiltShapes />

          <div className="container relative z-10 mx-auto px-4 max-w-7xl py-20 sm:py-28 lg:py-36">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              {/* Left */}
              <motion.div
                initial="hidden"
                animate="show"
                variants={staggerContainer}
              >
                <motion.div variants={fadeUp}>
                  <Badge
                    variant="outline"
                    className="mb-6 px-4 py-1.5 rounded-full bg-green-50/70 dark:bg-green-950/40 border-green-200 dark:border-green-800 backdrop-blur-sm text-green-700 dark:text-green-400"
                  >
                    <Code2 className="w-3.5 h-3.5 mr-1.5" />
                    {event.organizer}
                  </Badge>
                </motion.div>

                <motion.h1
                  variants={fadeUp}
                  className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.05] mb-6"
                  style={{ y: heroContentY, opacity: heroContentOpacity }}
                >
                  Become{" "}
                  <span className="bg-gradient-to-r from-green-500 via-emerald-400 to-teal-400 bg-clip-text text-transparent bg-[length:200%_auto] animate-[gradient-shift_5s_ease_infinite]">
                    Our Partner
                  </span>
                </motion.h1>

                <motion.p
                  variants={fadeUp}
                  className="text-lg sm:text-xl text-muted-foreground leading-relaxed max-w-xl mb-3"
                  style={{ y: heroContentY, opacity: heroContentOpacity }}
                >
                  Partner with Green University Computer Club to sponsor CSE Carnival 2026 — featuring IUPC, CTF, ICT Olympiad, and Math Olympiad.
                </motion.p>

                {/* Event badge + typing animation */}
                <motion.div
                  variants={fadeUp}
                  className="flex flex-wrap items-center gap-3 mb-8"
                  style={{ y: heroContentY, opacity: heroContentOpacity }}
                >
                  <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-primary/8 border border-primary/20 backdrop-blur-sm">
                    <Zap className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="text-sm font-semibold text-primary">
                      {event.name}
                    </span>
                  </div>
                  <TerminalTyping />
                </motion.div>

                {/* CTAs */}
                <motion.div
                  variants={fadeUp}
                  className="flex flex-wrap gap-3 mb-14"
                  style={{ y: heroContentY, opacity: heroContentOpacity }}
                >
                  <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                    <Button
                      size="lg"
                      className="rounded-xl px-8 py-6 text-base font-semibold shadow-lg shadow-primary/25 group"
                      asChild
                    >
                      <a href="#packages">
                        Become a Sponsor
                        <ArrowRight className="ml-2 w-4 h-4 transition-transform group-hover:translate-x-1" />
                      </a>
                    </Button>
                  </motion.div>
                  <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                    <Button
                      size="lg"
                      variant="outline"
                      className="rounded-xl px-8 py-6 text-base backdrop-blur-sm border-border/80 hover:border-primary/50 group"
                      asChild
                    >
                      <a href="#contact">
                        Download Proposal
                        <ExternalLink className="ml-2 w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                      </a>
                    </Button>
                  </motion.div>
                </motion.div>

                {/* Stats */}
                <motion.div
                  variants={staggerFast}
                  initial="hidden"
                  animate="show"
                  className="grid grid-cols-2 sm:grid-cols-4 gap-5"
                >
                  {stats.map((s) => (
                    <motion.div
                      key={s.label}
                      variants={fadeUp}
                      className="text-center sm:text-left"
                    >
                      <p className="text-2xl sm:text-3xl font-extrabold text-primary leading-none">
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
                    </motion.div>
                  ))}
                </motion.div>
              </motion.div>

              {/* Right — Code Visual (desktop only) */}
              <motion.div
                className="hidden lg:flex lg:items-center lg:justify-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 1, delay: 0.4 }}
              >
                <CodeVisual />
              </motion.div>
            </div>
          </div>

          <motion.div
            className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 text-muted-foreground/50"
            animate={{ y: [0, 9, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          >
            <ChevronDown className="w-6 h-6" />
          </motion.div>
        </section>

        {/* ══ RECOGNITION / AWARDS ════════════════════════════ */}
        <section className="relative py-24 overflow-hidden">
          <div className="container mx-auto px-4 max-w-5xl relative">
            <Reveal className="text-center mb-14">
              <SectionLabel>
                <Trophy className="w-3 h-3" /> Recognition
              </SectionLabel>
              <SectionHeading>
                Recognition That{" "}
                <span className="bg-gradient-to-r from-amber-500 to-orange-400 bg-clip-text text-transparent">
                  Speaks for Itself
                </span>
              </SectionHeading>
            </Reveal>
            <Reveal>
              <Link href="/events/gucc-receives-club-excellence-award-2026" className="block outline-none">
                <motion.div
                  className="relative max-w-2xl mx-auto rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-transparent overflow-hidden group cursor-pointer"
                  whileHover={{ y: -4, scale: 1.01 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                <div
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/50 to-transparent"
                />
                <div className="p-8 sm:p-10 flex flex-col sm:flex-row items-center gap-6 sm:gap-8">
                  <motion.div
                    className="relative flex items-center justify-center w-20 h-20 rounded-2xl bg-amber-500/10 border border-amber-500/20 shrink-0"
                    animate={{
                      boxShadow: [
                        "0 0 0px rgba(245,158,11,0)",
                        "0 0 30px rgba(245,158,11,0.25)",
                        "0 0 0px rgba(245,158,11,0)",
                      ],
                    }}
                    transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <Trophy className="w-10 h-10 text-amber-400" />
                  </motion.div>
                  <div className="text-center sm:text-left">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider border border-amber-500/20 bg-amber-500/10 text-amber-500 dark:text-amber-400 mb-3">
                      2026
                    </div>
                    <h3 className="text-xl sm:text-2xl font-bold text-foreground mb-2">
                      Club Excellence Award
                    </h3>
                    <p className="text-base text-amber-600 dark:text-amber-200/60 font-medium mb-1">
                      Best Computer Science & Programming Club
                    </p>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Recognized for outstanding contributions to technical
                      education, community building, and student development at
                      Green University of Bangladesh.
                    </p>
                  </div>
                </div>
              </motion.div>
              </Link>
            </Reveal>
          </div>
        </section>


        {/* ══ PROGRAMS ════════════════════════════════════ */}
        <section id="programs" className="relative py-24 overflow-hidden bg-[#0a0d12]">
          <div className="container mx-auto px-4 max-w-6xl relative z-10">
            <Reveal className="text-center mb-14 flex flex-col items-center">
              <div className="flex items-center gap-2 px-3 py-1 mb-6 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-500">
                <Star className="w-3.5 h-3.5" /> Programs
              </div>
              <h2 className="text-4xl sm:text-5xl font-extrabold text-white mb-6 tracking-tight">
                Sponsor the Programs That <span className="text-emerald-500">Matter</span>
              </h2>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                GUCC organizes a diverse portfolio of technical programs — each offering unique brand exposure and student engagement opportunities.
              </p>
            </Reveal>

            <Reveal className="mb-6">
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden p-8 sm:p-10 lg:p-12">
                <div className="grid lg:grid-cols-[1.5fr,1fr] gap-12 lg:gap-20">
                  {/* Left Column */}
                  <div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-[10px] font-bold uppercase tracking-widest text-emerald-500 mb-6 w-max">
                      <Star className="w-3 h-3" /> Flagship Program
                    </div>
                    <h3 className="text-3xl sm:text-4xl font-bold text-white mb-4 tracking-tight">
                      CSE Carnival 2026
                    </h3>
                    <p className="text-muted-foreground text-base leading-relaxed mb-10 max-w-lg">
                      A large-scale technology and student engagement initiative combining competitions, learning, innovation, community, and industry interaction across multiple days. The carnival features four core contests: IUPC, CTF (Cyber Security), ICT Olympiad, and Math Olympiad.
                    </p>
                    <div className="grid grid-cols-4 gap-4">
                      <div className="flex flex-col gap-2">
                        <Users className="w-5 h-5 text-emerald-500" />
                        <span className="text-sm font-semibold text-white">500+</span>
                        <span className="text-xs text-muted-foreground">Participants</span>
                      </div>
                      <div className="flex flex-col gap-2">
                        <Calendar className="w-5 h-5 text-emerald-500" />
                        <span className="text-sm font-semibold text-white">Multi-day</span>
                        <span className="text-xs text-muted-foreground">Event</span>
                      </div>
                      <div className="flex flex-col gap-2">
                        <Trophy className="w-5 h-5 text-emerald-500" />
                        <span className="text-sm font-semibold text-white">Competitions</span>
                        <span className="text-xs text-muted-foreground">& Awards</span>
                      </div>
                      <div className="flex flex-col gap-2">
                        <Building2 className="w-5 h-5 text-emerald-500" />
                        <span className="text-sm font-semibold text-white">Sponsor</span>
                        <span className="text-xs text-muted-foreground">Visibility</span>
                      </div>
                    </div>
                  </div>

                  {/* Right Column */}
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.15em] text-white mb-6">
                      Sponsor Value
                    </p>
                    <ul className="space-y-4">
                      {[
                        "Maximum brand exposure across all sub-events",
                        "Multi-day campus activation opportunity",
                        "Direct engagement with 500+ participants",
                        "Speaking and judging opportunities",
                        "Full digital and physical branding package"
                      ].map((v, i) => (
                        <li key={i} className="flex items-start gap-3">
                          <div className="mt-0.5 rounded-full border border-emerald-500/30 flex items-center justify-center p-0.5 shrink-0">
                            <Check className="w-3 h-3 text-emerald-500" />
                          </div>
                          <span className="text-sm text-muted-foreground leading-snug">{v}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </Reveal>

            <Reveal>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { title: "IUPC", subtitle: "Inter University Programming Contest", desc: "A competitive platform bringing together the best problem solvers from universities across the country.", icon: Code2 },
                  { title: "CTF", subtitle: "Cyber Security Contest", desc: "Capture The Flag competition designed to challenge and sharpen cybersecurity skills.", icon: Shield },
                  { title: "ICT Olympiad", subtitle: "ICT Knowledge Competition", desc: "An academic and technical competition to encourage ICT knowledge and innovation.", icon: Laptop },
                  { title: "Math Olympiad", subtitle: "Mathematics Competition", desc: "A problem-solving competition that promotes analytical thinking and mathematical excellence.", icon: Sigma },
                  { title: "Workshops", subtitle: "Hands-on workshops", desc: "Build practical skills and industry relevant knowledge.", icon: Wrench },
                  { title: "Industry Sessions", subtitle: "Learn from experts", desc: "Keynote talks and expert-led sessions.", icon: Mic },
                  { title: "Networking", subtitle: "Connect and collaborate", desc: "Grow with peers, mentors and industry professionals.", icon: Users },
                  { title: "Awards", subtitle: "Recognizing excellence", desc: "Celebrating innovation and outstanding performances.", icon: Trophy }
                ].map((item, i) => {
                  const Icon = item.icon;
                  return (
                    <motion.div
                      key={i}
                      className="group relative p-6 rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden hover:bg-white/[0.04] transition-all duration-300 flex flex-col h-full hover:-translate-y-1 hover:border-emerald-500/20 hover:shadow-[0_0_20px_rgba(16,185,129,0.05)]"
                    >
                      <div className="flex items-start gap-3 mb-4">
                        <div className="w-10 h-10 rounded-full border border-white/[0.08] flex items-center justify-center shrink-0">
                          <Icon className="w-5 h-5 text-emerald-500" />
                        </div>
                        <div>
                          <h4 className="font-bold text-white text-base">{item.title}</h4>
                          <p className="text-[10px] font-semibold text-emerald-500 leading-tight mt-0.5">{item.subtitle}</p>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed flex-grow">
                        {item.desc}
                      </p>
                      <div className="mt-4 flex justify-end">
                        <ArrowRight className="w-4 h-4 text-white/20 group-hover:text-emerald-500 transition-colors" />
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            </Reveal>
            
            <div className="mt-8 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Calendar className="w-3.5 h-3.5 text-emerald-500" /> One Community. Multiple Programs. Limitless Impact.
            </div>
          </div>
        </section>

        {/* ══ SECTION 4 — WHY SPONSOR ══════════════════════ */}
        <section className="relative py-24 overflow-hidden bg-muted/20">
          <DotGrid className="text-primary" />
          <ParallaxBlob className="top-0 left-1/4 w-80 h-80 bg-primary/10" duration={18} />
          <ParallaxBlob className="bottom-0 right-1/4 w-80 h-80 bg-emerald-400/10" duration={22} />
          <div className="container mx-auto px-4 max-w-6xl relative">
            <Reveal className="text-center mb-14">
              <SectionLabel>
                <Megaphone className="w-3 h-3" /> Why Sponsor
              </SectionLabel>
              <SectionHeading>
                Why{" "}
                <span className="bg-gradient-to-r from-green-500 to-emerald-400 bg-clip-text text-transparent">
                  Partner with Us?
                </span>
              </SectionHeading>
              <p className="text-muted-foreground mt-4 max-w-2xl mx-auto">
                Gain access to an unmatched talent pool, premium brand exposure,
                and a direct pipeline to Bangladesh&apos;s brightest tech minds.
              </p>
            </Reveal>

            <motion.div
              className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5"
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-80px" }}
              variants={staggerContainer}
            >
              {whySponsorReasons.map((r) => {
                const Icon = WHY_ICONS[r.icon] ?? Lightbulb;
                return (
                  <motion.div
                    key={r.title}
                    variants={fadeUp}
                    whileHover={{ y: -6, scale: 1.02 }}
                    className="group relative p-6 rounded-2xl border border-border/60 bg-background/80 backdrop-blur-sm hover:border-primary/50 hover:shadow-xl hover:shadow-primary/10 transition-all duration-300 overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/0 to-emerald-400/0 group-hover:from-primary/5 group-hover:to-emerald-400/5 transition-all duration-500" />
                    <div className="relative">
                      <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6">
                        <Icon className="w-5 h-5 text-primary" />
                      </div>
                      <h3 className="font-semibold text-sm mb-2">{r.title}</h3>
                      <p className="text-xs text-muted-foreground leading-relaxed">{r.description}</p>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          </div>
        </section>

        {/* ══ SECTION 5 — ACHIEVEMENTS ══════════════════════ */}
        <section className="relative py-24 overflow-hidden">
          <ParallaxBlob className="bottom-0 left-0 w-72 h-72 bg-amber-400/10" duration={17} />
          <div className="container mx-auto px-4 max-w-5xl">
            <Reveal className="text-center mb-14">
              <SectionLabel>
                <Trophy className="w-3 h-3" /> Track Record
              </SectionLabel>
              <SectionHeading>
                Our{" "}
                <span className="bg-gradient-to-r from-amber-500 to-orange-400 bg-clip-text text-transparent">
                  Achievements
                </span>
              </SectionHeading>
              <p className="text-muted-foreground mt-4">
                A proven track record of organizing world-class events that make a real impact. Click any card to explore the event.
              </p>
            </Reveal>

            <motion.div
              className="grid sm:grid-cols-2 gap-5"
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-80px" }}
              variants={staggerContainer}
            >
              {achievements.map((a: { title: string; description: string; eventSlug?: string }, i: number) => {
                const cardContent = (
                  <motion.div
                    key={a.title}
                    variants={fadeUp}
                    whileHover={{ y: -5, scale: 1.02 }}
                    className="group relative flex gap-5 p-6 rounded-2xl bg-background border border-border/60 overflow-hidden hover:border-amber-400/50 hover:shadow-xl hover:shadow-amber-400/10 transition-all duration-300 cursor-pointer"
                  >
                    <span className="absolute right-4 top-3 text-5xl font-black text-primary/5 select-none group-hover:text-primary/8 transition-colors">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <motion.span
                      className="relative flex items-center justify-center w-12 h-12 rounded-xl bg-amber-500/10 text-amber-500 shrink-0 mt-0.5 group-hover:bg-amber-500/20 transition-colors"
                      animate={{ boxShadow: ["0 0 0px rgba(245,158,11,0)", "0 0 18px rgba(245,158,11,0.35)", "0 0 0px rgba(245,158,11,0)"] }}
                      transition={{ duration: 2.5 + i * 0.5, repeat: Infinity, ease: "easeInOut" }}
                    >
                      <Trophy className="w-6 h-6" />
                    </motion.span>
                    <div className="relative">
                      <div className="flex items-center gap-2 mb-1.5">
                        <p className="font-bold text-base">{a.title}</p>
                        <ExternalLink className="w-3.5 h-3.5 text-amber-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">{a.description}</p>
                    </div>
                  </motion.div>
                );
                return a.eventSlug ? (
                  <Link key={a.title} href={`/events/${a.eventSlug}`} className="block">
                    {cardContent}
                  </Link>
                ) : cardContent;
              })}
            </motion.div>
          </div>
        </section>

        {/* ══ SECTION 6 — PREVIOUS PARTNERS ════════════════ */}
        <div className="bg-muted/20">
          <PartnersMarquee partners={previousPartners} />
        </div>

        {/* ══ SECTION 7 — SPONSORSHIP PACKAGES ════════════ */}
        <section
          id="packages"
          className="relative overflow-hidden py-24"
          aria-label="Sponsorship packages"
        >
          <ParallaxBlob className="top-1/4 right-0 w-96 h-96 bg-amber-400/8" duration={20} />
          <ParallaxBlob className="bottom-0 left-0 w-72 h-72 bg-green-500/8" duration={16} />
          <DotGrid className="text-primary" />

          <div className="container mx-auto px-4 max-w-7xl relative">
            <Reveal className="text-center mb-16">
              <SectionLabel>
                <Zap className="w-3 h-3" /> Packages
              </SectionLabel>
              <SectionHeading>
                Choose Your{" "}
                <span className="bg-gradient-to-r from-green-500 to-emerald-400 bg-clip-text text-transparent">
                  Sponsorship Tier
                </span>
              </SectionHeading>
              <p className="text-muted-foreground mt-4 max-w-xl mx-auto">
                Select the package that best fits your brand&apos;s vision and budget.
                Every tier delivers real, measurable impact.
              </p>
            </Reveal>

            <motion.div
              className="grid md:grid-cols-3 gap-6 items-end"
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-80px" }}
              variants={staggerContainer}
            >
              {packages.map((pkg) => {
                const cfg = TIER_CONFIG[pkg.tier];
                const Icon = cfg?.icon ?? Award;
                const isGold = pkg.highlight;
                const ac = cfg?.accentColor ?? "#888";

                return (
                  <motion.div
                    key={pkg.tier}
                    variants={fadeUp}
                    whileHover={{ y: isGold ? -14 : -6 }}
                    className={isGold ? "md:-translate-y-4 relative z-10" : ""}
                  >
                    {/* ── Card shell ── */}
                    <div
                      className={`relative rounded-2xl overflow-hidden group border transition-colors ${
                        isGold ? "border-amber-500/30 bg-amber-500/5 shadow-2xl shadow-amber-500/10" : "border-border bg-card shadow-md hover:border-border/80"
                      }`}
                    >
                      {/* Top glow */}
                      <div
                        aria-hidden
                        className="absolute inset-0 pointer-events-none"
                        style={{ background: cfg?.topGlow }}
                      />
                      {/* Hover glow */}
                      <div
                        aria-hidden
                        className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                        style={{ background: cfg?.hoverGlow }}
                      />

                      {/* Header */}
                      <div className="relative px-6 pt-6 pb-3">
                        <div className="flex items-center justify-between mb-5">
                          <span
                            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider"
                            style={{
                              border: `1px solid ${cfg?.badgeBorder}`,
                              background: cfg?.badgeBg,
                              color: ac,
                            }}
                          >
                            {isGold ? "✦ Exclusive" : `${pkg.slots} slot${pkg.slots > 1 ? "s" : ""} available`}
                          </span>
                          {isGold && (
                            <span
                              className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider"
                              style={{
                                border: `1px solid ${cfg?.badgeBorder}`,
                                background: cfg?.badgeBg,
                                color: `${ac}cc`,
                              }}
                            >
                              1 slot only
                            </span>
                          )}
                        </div>

                        {/* Icon */}
                        <motion.div
                          className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                          style={{ background: cfg?.checkBg, border: `1px solid ${cfg?.checkBorder}` }}
                          animate={isGold ? {
                            boxShadow: [`0 0 0px ${ac}00`, `0 0 20px ${ac}44`, `0 0 0px ${ac}00`],
                          } : undefined}
                          transition={isGold ? { duration: 3, repeat: Infinity, ease: "easeInOut" } : undefined}
                        >
                          <Icon className="w-6 h-6" style={{ color: ac }} />
                        </motion.div>

                        <h3 className="text-xl font-bold text-foreground mb-0.5">{pkg.tier}</h3>

                        <div className="flex items-baseline gap-1 mt-3 mb-5">
                          <span className="text-2xl font-bold" style={{ color: ac }}>৳</span>
                          <span className={`font-extrabold text-foreground ${isGold ? "text-4xl" : "text-3xl"}`}>
                            <CountUp end={pkg.price} duration={1.6} separator="," enableScrollSpy scrollSpyOnce />
                          </span>
                          <span className="text-xs text-muted-foreground font-normal ml-1">{pkg.currency}</span>
                        </div>

                        <div className="h-px w-full bg-border" />
                      </div>

                      {/* Benefits */}
                      <div className="relative px-6 pt-4 pb-6">
                        <ul className="space-y-3.5 mb-6">
                          {pkg.benefits.map((b) => (
                            <BenefitItem
                              key={b}
                              text={b}
                              accentColor={ac}
                              checkBg={cfg?.checkBg ?? ""}
                              checkBorder={cfg?.checkBorder ?? ""}
                              textClass={isGold ? "text-foreground/90" : "text-muted-foreground"}
                            />
                          ))}
                        </ul>

                        {/* CTA */}
                        {isGold ? (
                          <motion.a
                            href="#contact"
                            className="group/btn flex items-center justify-center gap-2 w-full rounded-xl py-3 text-sm font-semibold transition-all duration-200"
                            style={{
                              background: "linear-gradient(135deg,#C9A84C 0%,#e8c96c 50%,#C9A84C 100%)",
                              backgroundSize: "200% auto",
                              color: "#0e0e10",
                              boxShadow: "0 4px 20px rgba(201,168,76,0.25)",
                            }}
                            whileHover={{ y: -1, boxShadow: "0 6px 28px rgba(201,168,76,0.4)" }}
                            whileTap={{ scale: 0.98 }}
                          >
                            Become Gold Sponsor
                            <ArrowRight className="w-4 h-4 transition-transform group-hover/btn:translate-x-1" />
                          </motion.a>
                        ) : (
                          <motion.a
                            href="#contact"
                            className="group/btn flex items-center justify-center gap-2 w-full rounded-xl py-3 text-sm font-semibold transition-all duration-200 border border-border bg-muted/50 text-foreground hover:bg-muted"
                            whileHover={{ y: -1 }}
                            whileTap={{ scale: 0.98 }}
                          >
                            Become a {pkg.tier.split(" ")[0]} Sponsor
                            <ArrowRight className="w-4 h-4 transition-transform group-hover/btn:translate-x-1 text-muted-foreground" />
                          </motion.a>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>

            {/* Comparison Table */}
            <Reveal>
              <div className="max-w-4xl mx-auto overflow-x-auto pb-4 mt-20">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr>
                      <th className="py-2.5 px-4 text-sm font-semibold border-b border-border">Feature Comparison</th>
                      <th className="py-2.5 px-4 text-sm font-semibold text-[#C9A84C] text-center border-b border-border">Gold</th>
                      <th className="py-2.5 px-4 text-sm font-semibold text-slate-400 text-center border-b border-border">Silver</th>
                      <th className="py-2.5 px-4 text-sm font-semibold text-[#A0714F] text-center border-b border-border">Bronze</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {comparisonFeatures.map((row) => (
                      <tr key={row.feature} className="hover:bg-muted/30">
                        <td className="py-2 px-4 text-sm text-muted-foreground">{row.feature}</td>
                        <td className="py-2 px-4 text-center">
                          {row.gold ? <Check className="w-4 h-4 text-[#C9A84C] mx-auto" /> : <X className="w-4 h-4 text-muted-foreground/30 mx-auto" />}
                        </td>
                        <td className="py-2 px-4 text-center">
                          {row.silver ? <Check className="w-4 h-4 text-slate-400 mx-auto" /> : <X className="w-4 h-4 text-muted-foreground/30 mx-auto" />}
                        </td>
                        <td className="py-2 px-4 text-center">
                          {row.bronze ? <Check className="w-4 h-4 text-[#A0714F] mx-auto" /> : <X className="w-4 h-4 text-muted-foreground/30 mx-auto" />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ══ SECTION 8 — OTHER OPPORTUNITIES ══════════════ */}
        <section className="bg-muted/20 py-24 relative overflow-hidden">
          <ParallaxBlob className="top-0 left-1/4 w-72 h-72 bg-green-500/10" duration={15} />
          <div className="container mx-auto px-4 max-w-6xl">
            <Reveal className="text-center mb-12">
              <SectionLabel>
                <Gift className="w-3 h-3" /> Partnership Options
              </SectionLabel>
              <SectionHeading>
                Other{" "}
                <span className="bg-gradient-to-r from-green-500 to-emerald-400 bg-clip-text text-transparent">
                  Partnership
                </span>{" "}
                Opportunities
              </SectionHeading>
              <p className="text-muted-foreground mt-4 max-w-2xl mx-auto">
                Explore exclusive in-kind partnership options that offer unique
                brand touchpoints beyond traditional sponsorship.
              </p>
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
                    whileHover={{ y: -6, scale: 1.02 }}
                    className="group p-6 rounded-2xl bg-background border border-border/60 text-center hover:border-primary/50 hover:shadow-xl hover:shadow-primary/8 transition-all duration-300 overflow-hidden relative"
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/0 to-transparent group-hover:from-primary/5 transition-all duration-500" />
                    <div className="relative">
                      <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 text-primary mb-4 transition-all duration-300 group-hover:scale-110 group-hover:rotate-6 group-hover:bg-primary/20">
                        <Icon className="w-6 h-6" />
                      </div>
                      <p className="font-bold text-base mb-1">{o.title}</p>
                      <Badge variant="outline" className="mb-3 text-[10px] font-semibold border-primary/30 text-primary">
                        {o.detail}
                      </Badge>
                      <p className="text-xs text-muted-foreground leading-relaxed">{o.description}</p>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          </div>
        </section>

        {/* ══ SECTION 9 — GALLERY ══════════════════════════ */}
        <Gallery />



        {/* ══ CONTACT ═══════════════════════════════════════ */}
        <section
          id="contact"
          className="container mx-auto px-4 py-24 max-w-5xl"
          aria-label="Contact section"
        >
          <Reveal className="text-center mb-12">
            <SectionLabel>
              <Mail className="w-3 h-3" /> Get in Touch
            </SectionLabel>
            <SectionHeading>
              Ready to{" "}
              <span className="bg-gradient-to-r from-green-500 to-emerald-400 bg-clip-text text-transparent">
                Partner With Us?
              </span>
            </SectionHeading>
            <p className="text-muted-foreground mt-4 max-w-xl mx-auto">
              Reach out to our team directly. We&apos;d love to discuss how we
              can create a partnership that works for your brand.
            </p>
          </Reveal>

          {/* Official Club Email CTA */}
          <Reveal className="mb-10">
            <div className="flex justify-center">
              <motion.a
                href="mailto:gucc@green.edu.bd"
                className="inline-flex items-center gap-3 px-8 py-4 rounded-2xl font-semibold text-lg text-black bg-gradient-to-r from-green-400 via-emerald-400 to-teal-400 shadow-lg shadow-green-500/25 hover:shadow-xl hover:shadow-green-500/40 transition-all duration-300"
                whileHover={{ scale: 1.04, y: -2 }}
                whileTap={{ scale: 0.97 }}
              >
                <Mail className="w-5 h-5" />
                Official Mail: gucc@green.edu.bd
              </motion.a>
            </div>
          </Reveal>

          <motion.div
            className="grid sm:grid-cols-3 gap-6 max-w-4xl mx-auto"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
            variants={staggerContainer}
          >
            {contacts.map((c) => (
              <motion.div key={c.name} variants={fadeUp} whileHover={{ y: -6 }}>
                <Card className="h-full border-green-200/50 dark:border-green-900/40 hover:border-primary/50 hover:shadow-2xl hover:shadow-primary/8 transition-all duration-300 overflow-hidden group relative">
                  <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-green-500 to-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <CardContent className="pt-8 pb-7 px-7">
                    <div className="flex items-start gap-4 mb-6">
                      <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                        <span className="text-2xl font-bold text-primary">{c.name.charAt(0)}</span>
                      </div>
                      <div>
                        <p className="font-bold text-base">{c.name}</p>
                        <p className="text-sm text-primary font-medium">{c.role}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{c.organization}</p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <a
                        href={`mailto:${c.email}`}
                        className="flex items-center gap-3 text-sm text-muted-foreground hover:text-primary transition-colors group/link"
                      >
                        <span className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center shrink-0 group-hover/link:bg-primary/10 transition-colors">
                          <Mail className="w-4 h-4" />
                        </span>
                        <span className="break-all">{c.email}</span>
                      </a>
                      <a
                        href={`tel:${c.phone}`}
                        className="flex items-center gap-3 text-sm text-muted-foreground hover:text-primary transition-colors group/link"
                      >
                        <span className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center shrink-0 group-hover/link:bg-primary/10 transition-colors">
                          <Phone className="w-4 h-4" />
                        </span>
                        <span>{c.phone}</span>
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