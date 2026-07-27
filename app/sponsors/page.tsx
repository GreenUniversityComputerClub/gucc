"use client";

import {
  useEffect,
  useRef,
  useState,
  type ElementType,
} from "react";
import Image from "next/image";
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
  Sparkles,
  Shirt,
  Utensils,
  Gift,
  Server,
  Code2,
  ArrowRight,
  Briefcase,
  Share2,
  MapPin,
  GraduationCap,
  Lightbulb,
  ExternalLink,
  Star,
  Zap,
  ChevronDown,
} from "lucide-react";
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
    cardBg: "linear-gradient(145deg,#18181b 0%,#111112 60%,#0e0e10 100%)",
    shadow: "0 0 0 1px rgba(201,168,76,0.4),0 0 40px 0 rgba(201,168,76,0.12),0 24px 48px -12px rgba(0,0,0,0.6)",
    topGlow: "radial-gradient(ellipse 70% 40% at 50% 0%,rgba(201,168,76,0.18) 0%,transparent 70%)",
    hoverGlow: "radial-gradient(ellipse 80% 50% at 50% 0%,rgba(201,168,76,0.28) 0%,transparent 70%)",
    divider: "linear-gradient(to right,transparent,rgba(201,168,76,0.3),transparent)",
    badgeBorder: "rgba(201,168,76,0.3)",
    badgeBg: "rgba(201,168,76,0.12)",
    checkBg: "rgba(201,168,76,0.15)",
    checkBorder: "rgba(201,168,76,0.35)",
    btnBg: "linear-gradient(135deg,#C9A84C 0%,#e8c96c 50%,#C9A84C 100%)",
    btnBorder: "transparent",
    btnHoverBg: "",
  },
  "Silver Sponsor": {
    icon: Medal,
    accentColor: "#94a3b8",
    cardBg: "linear-gradient(145deg,#1c1c1f 0%,#161618 100%)",
    shadow: "0 0 0 1px rgba(148,163,184,0.22),0 16px 40px -12px rgba(0,0,0,0.5)",
    topGlow: "radial-gradient(ellipse 60% 35% at 50% 0%,rgba(148,163,184,0.09) 0%,transparent 70%)",
    hoverGlow: "radial-gradient(ellipse 70% 50% at 50% 0%,rgba(148,163,184,0.14) 0%,transparent 70%)",
    divider: "linear-gradient(to right,transparent,rgba(148,163,184,0.2),transparent)",
    badgeBorder: "rgba(148,163,184,0.28)",
    badgeBg: "rgba(148,163,184,0.1)",
    checkBg: "rgba(148,163,184,0.12)",
    checkBorder: "rgba(148,163,184,0.28)",
    btnBg: "rgba(148,163,184,0.14)",
    btnBorder: "rgba(148,163,184,0.28)",
    btnHoverBg: "rgba(148,163,184,0.24)",
  },
  "Bronze Sponsor": {
    icon: Award,
    accentColor: "#A0714F",
    cardBg: "linear-gradient(145deg,#1a1714 0%,#141210 100%)",
    shadow: "0 0 0 1px rgba(160,113,79,0.25),0 16px 40px -12px rgba(0,0,0,0.5)",
    topGlow: "radial-gradient(ellipse 60% 35% at 50% 0%,rgba(160,113,79,0.09) 0%,transparent 70%)",
    hoverGlow: "radial-gradient(ellipse 70% 50% at 50% 0%,rgba(160,113,79,0.14) 0%,transparent 70%)",
    divider: "linear-gradient(to right,transparent,rgba(160,113,79,0.2),transparent)",
    badgeBorder: "rgba(160,113,79,0.28)",
    badgeBg: "rgba(160,113,79,0.1)",
    checkBg: "rgba(160,113,79,0.12)",
    checkBorder: "rgba(160,113,79,0.28)",
    btnBg: "rgba(160,113,79,0.14)",
    btnBorder: "rgba(160,113,79,0.28)",
    btnHoverBg: "rgba(160,113,79,0.24)",
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
  "Inter Department Programming Contest",
  "Competitive Programming Championship",
  "Where Future Engineers Compete",
  "Build · Code · Compete",
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
            { n: 1, c: "text-muted-foreground/50", t: "# IDPC 2026 · GUCC" },
            { n: 2, c: "", t: "" },
            {
              n: 3,
              c: "text-blue-400/80",
              t: "from",
              rest: " gucc import Contest, Team, Problem",
            },
            { n: 4, c: "", t: "" },
            {
              n: 5,
              c: "text-violet-400/80",
              t: "contest",
              rest: " = Contest(",
            },
            {
              n: 6,
              c: "text-muted-foreground",
              t: '    name="IDPC 2026",',
            },
            { n: 7, c: "text-muted-foreground", t: "    teams=100," },
            { n: 8, c: "text-muted-foreground", t: "    problems=12," },
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
              t: "contest.run()",
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

      {/* Leaderboard chip */}
      <motion.div
        className="absolute bottom-8 right-2 rounded-xl border border-border/60 bg-background/85 backdrop-blur-md shadow-lg px-4 py-3"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0, y: [0, -5, 0] }}
        transition={{
          opacity: { duration: 0.5, delay: 0.9 },
          x: { duration: 0.5, delay: 0.9 },
          y: {
            duration: 3.5,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 1.1,
          },
        }}
      >
        <p className="text-[10px] font-mono text-muted-foreground mb-1">
          leaderboard
        </p>
        {[
          ["#1 Team Alpha", "3260 pts"],
          ["#2 Team Beta", "3140 pts"],
          ["#3 Team Gamma", "2980 pts"],
        ].map(([name, pts]) => (
          <div
            key={name}
            className="flex items-center justify-between gap-6 py-0.5"
          >
            <span className="text-xs font-medium text-foreground/80">
              {name}
            </span>
            <span className="text-xs font-mono text-primary">{pts}</span>
          </div>
        ))}
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
          Leading brands and organizations that have trusted GUCC — hover to
          reveal, drag to browse.
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
              className="group flex items-center justify-center h-24 w-44 sm:w-48 shrink-0 rounded-2xl border border-border/60 bg-background/80 backdrop-blur-sm px-4 py-3 transition-all duration-300 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10 hover:-translate-y-1"
              title={p.name}
            >
              <div className="relative h-full w-full">
                <Image
                  src={p.logo}
                  alt={p.name}
                  fill
                  sizes="(max-width: 640px) 176px, 192px"
                  draggable={false}
                  className="object-contain opacity-80 sm:grayscale sm:opacity-60 transition-all duration-300 pointer-events-none select-none sm:group-hover:grayscale-0 sm:group-hover:opacity-100 group-hover:scale-105"
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
const GALLERY_IMAGES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

function Gallery() {
  const [lightbox, setLightbox] = useState<number | null>(null);
  return (
    <section className="py-20 relative overflow-hidden">
      <ParallaxBlob className="bottom-0 right-0 w-80 h-80 bg-emerald-400/10" duration={18} />
      <div className="container mx-auto px-4 max-w-6xl">
        <Reveal className="text-center mb-12">
          <SectionLabel>
            <Sparkles className="w-3 h-3" /> Flashback
          </SectionLabel>
          <SectionHeading>
            Moments from{" "}
            <span className="bg-gradient-to-r from-green-500 to-emerald-400 bg-clip-text text-transparent">
              Our Events
            </span>
          </SectionHeading>
          <p className="text-muted-foreground mt-3">
            A glimpse into the energy, passion, and innovation at GUCC events.
          </p>
        </Reveal>

        <motion.div
          className="columns-2 sm:columns-3 lg:columns-4 gap-3 space-y-3"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          variants={staggerFast}
        >
          {GALLERY_IMAGES.map((n) => (
            <motion.div
              key={n}
              variants={fadeUp}
              className="break-inside-avoid group relative overflow-hidden rounded-2xl cursor-zoom-in"
              onClick={() => setLightbox(n)}
            >
              <div className="relative w-full aspect-[4/3]">
                <Image
                  src={`/events/${n}.jpg`}
                  alt={`GUCC event moment ${n}`}
                  fill
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-110"
                />
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl flex items-end p-3">
                <span className="text-white text-xs font-medium">GUCC Event</span>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>

      {lightbox !== null && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={() => setLightbox(null)}
        >
          <motion.div
            className="relative max-w-4xl w-full aspect-[4/3]"
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={`/events/${lightbox}.jpg`}
              alt="Event"
              fill
              className="object-contain rounded-2xl"
              sizes="(max-width: 1024px) 100vw, 896px"
            />
          </motion.div>
          <button
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
            onClick={() => setLightbox(null)}
            aria-label="Close lightbox"
          >
            ✕
          </button>
        </motion.div>
      )}
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
    { label: "Contestants", value: 100, suffix: "+" },
    { label: "Active Teams", value: 30, suffix: "+" },
    { label: "Past Partners", value: previousPartners.length, suffix: "+" },
  ];

  return (
    <MotionConfig reducedMotion="user">
      <ReadingProgress />
      <AmbientBackground />

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
                  Partner with Green University Computer Club to inspire the
                  next generation of software engineers, innovators and
                  competitive programmers.
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

        {/* ══ SECTION 2 — ABOUT ════════════════════════════ */}
        <section className="relative py-24 overflow-hidden bg-muted/20">
          <ParallaxBlob className="top-0 right-0 w-72 h-72 bg-green-500/12" duration={16} />
          <DotGrid className="text-primary" />
          <div className="container mx-auto px-4 max-w-6xl">
            <Reveal className="text-center mb-14">
              <SectionLabel>
                <Sparkles className="w-3 h-3" /> About the Event
              </SectionLabel>
              <SectionHeading>
                What is{" "}
                <span className="bg-gradient-to-r from-green-500 to-emerald-400 bg-clip-text text-transparent">
                  IDPC 2026?
                </span>
              </SectionHeading>
              <p className="text-muted-foreground mt-4 max-w-2xl mx-auto text-base leading-relaxed">
                The biggest inter-departmental programming &amp; math event hosted
                by GUCC — a platform for networking, innovation, and competitive
                excellence.
              </p>
            </Reveal>

            <div className="grid lg:grid-cols-2 gap-10 items-start">
              <motion.div
                className="space-y-5"
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, margin: "-80px" }}
                variants={staggerContainer}
              >
                {[
                  { icon: Sparkles, title: "About the Events", body: about.eventDescription },
                  { icon: Users, title: "About GUCC", body: about.clubDescription },
                ].map((item) => (
                  <motion.div key={item.title} variants={slideLeft} whileHover={{ y: -4 }}>
                    <Card className="h-full border-green-200/50 dark:border-green-900/40 hover:border-primary/40 transition-all duration-300 hover:shadow-xl hover:shadow-primary/5">
                      <CardHeader>
                        <div className="flex items-center gap-3">
                          <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary shrink-0">
                            <item.icon className="w-5 h-5" />
                          </span>
                          <h3 className="font-semibold text-lg">{item.title}</h3>
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

              <motion.div
                className="grid grid-cols-2 gap-4"
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, margin: "-80px" }}
                variants={staggerContainer}
              >
                {[
                  { icon: Users, value: 7000, suffix: "+", label: "Students", desc: "Thriving community members", color: "text-green-500", bg: "bg-green-500/10" },
                  { icon: Code2, value: 100, suffix: "+", label: "Contestants", desc: "Competing across departments", color: "text-emerald-500", bg: "bg-emerald-500/10" },
                  { icon: Trophy, value: null, label: "Programming Contest", desc: "Algorithmic problem solving", color: "text-amber-500", bg: "bg-amber-500/10" },
                  { icon: Star, value: null, label: "Math Olympiad", desc: "Analytical & mathematical prowess", color: "text-blue-500", bg: "bg-blue-500/10" },
                  { icon: Award, value: null, label: "University Recognition", desc: "Endorsed by GUB administration", color: "text-purple-500", bg: "bg-purple-500/10" },
                  { icon: Zap, value: null, label: "Innovation Hub", desc: "Where ideas become solutions", color: "text-orange-500", bg: "bg-orange-500/10" },
                ].map((item) => (
                  <motion.div
                    key={item.label}
                    variants={fadeUp}
                    whileHover={{ y: -5, scale: 1.02 }}
                    className="group relative p-5 rounded-2xl border border-border/60 bg-background hover:border-primary/40 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5"
                  >
                    <div className={`w-10 h-10 rounded-xl ${item.bg} flex items-center justify-center mb-3 transition-transform group-hover:scale-110`}>
                      <item.icon className={`w-5 h-5 ${item.color}`} />
                    </div>
                    {item.value !== null ? (
                      <p className={`text-3xl font-extrabold ${item.color} leading-none mb-1`}>
                        <CountUp end={item.value} duration={2} separator="," suffix={item.suffix} enableScrollSpy scrollSpyOnce />
                      </p>
                    ) : null}
                    <p className="font-semibold text-sm">{item.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                  </motion.div>
                ))}
              </motion.div>
            </div>
          </div>
        </section>

        {/* ══ SECTION 3 — TIMELINE ══════════════════════════ */}
        <section className="relative py-24 overflow-hidden">
          <ParallaxBlob className="top-1/2 left-0 w-72 h-72 bg-teal-400/10" duration={20} />
          <div className="container mx-auto px-4 max-w-3xl">
            <Reveal className="text-center mb-14">
              <SectionLabel>
                <Calendar className="w-3 h-3" /> Event Timeline
              </SectionLabel>
              <SectionHeading>
                Program{" "}
                <span className="bg-gradient-to-r from-green-500 to-emerald-400 bg-clip-text text-transparent">
                  Schedule
                </span>
              </SectionHeading>
              <p className="text-muted-foreground mt-4">
                Dates to be announced. Stay tuned for the official schedule.
              </p>
            </Reveal>

            <motion.ol
              ref={timelineRef}
              className="relative ml-4"
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-80px" }}
              variants={staggerContainer}
            >
              <span className="absolute left-0 top-2 bottom-2 w-px bg-border" />
              <motion.span
                className="absolute left-0 top-2 bottom-2 w-px bg-gradient-to-b from-primary via-emerald-400 to-teal-400 origin-top"
                style={{ scaleY: timelineFill }}
              />

              {schedule.map((s, i) => (
                <motion.li key={s.label} variants={fadeUp} className="relative mb-10 ml-8 last:mb-0">
                  <span className="absolute -left-[41px] flex items-center justify-center w-7 h-7 rounded-full border-2 border-primary/40 bg-background text-primary shadow-sm shadow-primary/20">
                    <span className="w-2.5 h-2.5 rounded-full bg-primary/60" />
                  </span>
                  <div className="group p-5 rounded-2xl border border-border/60 bg-background/70 backdrop-blur-sm hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-bold text-primary uppercase tracking-widest">
                        Step {i + 1}
                      </span>
                      <Badge variant="outline" className="rounded-full px-2 py-0 text-[10px] border-muted-foreground/30 text-muted-foreground">
                        TBA
                      </Badge>
                    </div>
                    <p className="font-semibold text-base">{s.label}</p>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{s.description}</p>
                  </div>
                </motion.li>
              ))}
            </motion.ol>
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
                A proven track record of organizing world-class events that make a real impact.
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
                  whileHover={{ y: -5 }}
                  className="group relative flex gap-5 p-6 rounded-2xl bg-background border border-border/60 overflow-hidden hover:border-amber-400/50 hover:shadow-xl hover:shadow-amber-400/10 transition-all duration-300"
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
                    <p className="font-bold text-base mb-1.5">{a.title}</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">{a.description}</p>
                  </div>
                </motion.div>
              ))}
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
                      className="relative rounded-2xl overflow-hidden group"
                      style={{
                        background: cfg?.cardBg,
                        boxShadow: cfg?.shadow,
                      }}
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

                        <h3 className="text-xl font-bold text-white mb-0.5">{pkg.tier}</h3>

                        <div className="flex items-baseline gap-1 mt-3 mb-5">
                          <span className="text-2xl font-bold" style={{ color: ac }}>৳</span>
                          <span className={`font-extrabold text-white ${isGold ? "text-4xl" : "text-3xl"}`}>
                            <CountUp end={pkg.price} duration={1.6} separator="," enableScrollSpy scrollSpyOnce />
                          </span>
                          <span className="text-xs text-zinc-500 font-normal ml-1">{pkg.currency}</span>
                        </div>

                        <div className="h-px w-full" style={{ background: cfg?.divider }} />
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
                              textClass={isGold ? "text-zinc-300" : "text-zinc-400"}
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
                            className="group/btn flex items-center justify-center gap-2 w-full rounded-xl py-3 text-sm font-semibold text-white transition-all duration-200"
                            style={{ background: cfg?.btnBg, border: `1px solid ${cfg?.btnBorder}` }}
                            whileHover={{ background: cfg?.btnHoverBg, y: -1 }}
                            whileTap={{ scale: 0.98 }}
                          >
                            Become a {pkg.tier.split(" ")[0]} Sponsor
                            <ArrowRight className="w-4 h-4 transition-transform group-hover/btn:translate-x-1" />
                          </motion.a>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
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

        {/* ══ SECTION 10 — FINAL CTA ═══════════════════════ */}
        <section className="relative py-28 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-green-600 via-emerald-600 to-teal-600 dark:from-green-800 dark:via-emerald-800 dark:to-teal-800" />
          <DotGrid className="text-white" />
          <motion.div
            className="absolute top-[-20%] left-[-10%] w-[36rem] h-[36rem] rounded-full bg-white/5 blur-[80px]"
            animate={{ x: [0, 30, 0], y: [0, 20, 0] }}
            transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute bottom-[-20%] right-[-10%] w-[32rem] h-[32rem] rounded-full bg-white/5 blur-[80px]"
            animate={{ x: [0, -25, 0], y: [0, -20, 0] }}
            transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
          />

          <div className="container mx-auto px-4 max-w-4xl text-center relative z-10">
            <motion.div
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-80px" }}
              variants={staggerContainer}
            >
              <motion.div variants={fadeUp}>
                <Badge className="mb-6 bg-white/20 hover:bg-white/20 text-white border-white/30 backdrop-blur-sm">
                  <Sparkles className="w-3 h-3 mr-1.5" />
                  Join Us Today
                </Badge>
              </motion.div>

              <motion.h2
                variants={fadeUp}
                className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white tracking-tight leading-tight mb-6"
              >
                Let&apos;s Build the{" "}
                <span className="bg-gradient-to-r from-yellow-300 to-green-200 bg-clip-text text-transparent">
                  Future Together
                </span>
              </motion.h2>

              <motion.p
                variants={fadeUp}
                className="text-lg text-white/80 max-w-2xl mx-auto mb-10 leading-relaxed"
              >
                Join us in empowering the next generation of programmers and
                software engineers. Your brand, their future — together we shape
                Bangladesh&apos;s tech landscape.
              </motion.p>

              <motion.div variants={fadeUp} className="flex flex-wrap gap-4 justify-center">
                <motion.div whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.97 }}>
                  <Button
                    size="lg"
                    className="rounded-xl px-8 py-6 text-base font-semibold bg-white text-green-700 hover:bg-green-50 shadow-xl shadow-black/20 group"
                    asChild
                  >
                    <a href="#packages">
                      Become a Sponsor
                      <ArrowRight className="ml-2 w-4 h-4 transition-transform group-hover:translate-x-1" />
                    </a>
                  </Button>
                </motion.div>
                <motion.div whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.97 }}>
                  <Button
                    size="lg"
                    variant="outline"
                    className="rounded-xl px-8 py-6 text-base font-semibold border-white/40 text-white bg-white/10 hover:bg-white/20 backdrop-blur-sm"
                    asChild
                  >
                    <a href="#contact">Contact Us</a>
                  </Button>
                </motion.div>
              </motion.div>
            </motion.div>
          </div>
        </section>

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

          <motion.div
            className="grid sm:grid-cols-2 gap-6 max-w-3xl mx-auto"
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

                    <a
                      href={`mailto:${c.email}`}
                      className="flex items-center gap-3 text-sm text-muted-foreground hover:text-primary transition-colors group/link"
                    >
                      <span className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center shrink-0 group-hover/link:bg-primary/10 transition-colors">
                        <Mail className="w-4 h-4" />
                      </span>
                      <span className="break-all">{c.email}</span>
                    </a>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>

          <Reveal className="mt-10">
            <div className="rounded-2xl border border-border/60 bg-muted/30 p-6 text-center">
              <p className="text-muted-foreground text-sm">
                You can also reach us at{" "}
                <a
                  href={`mailto:${sponsorData.event.email}`}
                  className="text-primary font-semibold hover:underline"
                >
                  {sponsorData.event.email}
                </a>{" "}
                or visit{" "}
                <a
                  href={`https://${sponsorData.event.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary font-semibold hover:underline inline-flex items-center gap-1"
                >
                  {sponsorData.event.website}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </p>
            </div>
          </Reveal>
        </section>
      </div>
    </MotionConfig>
  );
}