"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Bell,
  Clock,
  Facebook,
  Globe,
  Home,
  Instagram,
  Linkedin,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Particle {
  id: number;
  x: number;
  size: number;
  duration: number;
  delay: number;
  opacity: number;
}

// ─── Floating Particles ───────────────────────────────────────────────────────

function FloatingParticles() {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    setParticles(
      Array.from({ length: 18 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        size: Math.random() * 3 + 1,
        duration: Math.random() * 14 + 10,
        delay: Math.random() * 12,
        opacity: Math.random() * 0.35 + 0.08,
      }))
    );
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute bottom-0 rounded-full bg-primary"
          style={{
            left: `${p.x}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            opacity: p.opacity,
            animation: `floatUp ${p.duration}s ${p.delay}s infinite linear`,
          }}
        />
      ))}
    </div>
  );
}

// ─── Animated Clock Visual ────────────────────────────────────────────────────

function ClockVisual() {
  return (
    <div className="relative flex h-52 w-52 items-center justify-center sm:h-60 sm:w-60">
      {/* Outermost dashed ring — slow rotate */}
      <div
        className="absolute inset-0 rounded-full border border-dashed border-primary/20"
        style={{ animation: "spinCW 28s linear infinite" }}
      />
      {/* Inner accent ring — counter-rotate */}
      <div
        className="absolute inset-4 rounded-full border border-primary/15"
        style={{ animation: "spinCCW 18s linear infinite" }}
      />
      {/* Middle ring with orbiting dot */}
      <div
        className="absolute inset-8 rounded-full"
        style={{ animation: "spinCW 12s linear infinite" }}
      >
        <div className="absolute -top-1.5 left-1/2 -translate-x-1/2">
          <div className="h-3 w-3 rounded-full bg-primary shadow-[0_0_10px_3px_rgba(34,197,94,0.6)]" />
        </div>
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1.5">
          <div className="h-2 w-2 rounded-full bg-primary/40" />
        </div>
      </div>
      {/* Inner glow ring */}
      <div
        className="absolute inset-12 rounded-full border border-primary/30"
        style={{ animation: "spinCCW 8s linear infinite" }}
      />
      {/* Center core */}
      <div
        className="relative z-10 flex h-20 w-20 items-center justify-center rounded-full border border-primary/40 bg-linear-to-br from-primary/25 to-primary/5"
        style={{ animation: "coreGlow 3.5s ease-in-out infinite" }}
      >
        <Clock className="h-9 w-9 text-primary drop-shadow-[0_0_6px_rgba(34,197,94,0.7)]" strokeWidth={1.5} />
      </div>
    </div>
  );
}

// ─── Info Card ────────────────────────────────────────────────────────────────

function InfoCard({
  icon,
  title,
  description,
  animDelay,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  animDelay: string;
}) {
  return (
    <div
      className="group relative overflow-hidden rounded-2xl border border-border/50 bg-muted/30 p-5 backdrop-blur-sm transition-all duration-300 hover:border-primary/40 hover:bg-muted/50 hover:shadow-lg hover:shadow-primary/8 hover:-translate-y-0.5"
      style={{ animation: `slideUp 0.7s ${animDelay} both ease-out` }}
    >
      <div className="absolute inset-0 bg-linear-to-br from-primary/5 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <div className="relative flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary transition-all duration-300 group-hover:border-primary/40 group-hover:bg-primary/20 group-hover:shadow-[0_0_12px_rgba(34,197,94,0.2)]">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Social Link Button ───────────────────────────────────────────────────────

function SocialButton({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="flex h-10 w-10 items-center justify-center rounded-full border border-border/60 bg-muted/40 text-muted-foreground backdrop-blur-sm transition-all duration-200 hover:scale-110 hover:border-primary/50 hover:bg-primary/10 hover:text-primary hover:shadow-[0_0_14px_rgba(34,197,94,0.25)]"
    >
      {icon}
    </a>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function JoinPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animFrameId: number;
    let t = 0;

    function resize() {
      if (!canvas) return;
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    }
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    function draw() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const spacing = 52;
      const cols = Math.ceil(canvas.width / spacing) + 1;
      const rows = Math.ceil(canvas.height / spacing) + 1;
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = c * spacing;
          const y = r * spacing;
          const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
          const wave = Math.sin(dist / 65 - t) * 0.5 + 0.5;
          ctx.beginPath();
          ctx.arc(x, y, 1.2, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(34,197,94,${wave * 0.13})`;
          ctx.fill();
        }
      }
      t += 0.02;
      animFrameId = requestAnimationFrame(draw);
    }
    draw();

    return () => {
      cancelAnimationFrame(animFrameId);
      ro.disconnect();
    };
  }, []);

  return (
    <>
      {/* ── Global keyframes ── */}
      <style>{`
        @keyframes floatUp {
          0%   { transform: translateY(0) scale(1);    opacity: 1;   }
          100% { transform: translateY(-100vh) scale(0.4); opacity: 0; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
        @keyframes spinCW  { to { transform: rotate(360deg);  } }
        @keyframes spinCCW { to { transform: rotate(-360deg); } }
        @keyframes coreGlow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.25); }
          50%       { box-shadow: 0 0 28px 8px rgba(34,197,94,0.18); }
        }
        @keyframes orb1 {
          0%,100% { transform: translate(0,0)   scale(1);    }
          50%      { transform: translate(80px,-50px) scale(1.12); }
        }
        @keyframes orb2 {
          0%,100% { transform: translate(0,0)    scale(1);   }
          50%      { transform: translate(-70px,70px) scale(0.9); }
        }
        @keyframes orb3 {
          0%,100% { transform: translate(0,0) scale(1); }
          50%      { transform: translate(30px,40px) scale(1.08); }
        }
        @keyframes badgePing {
          0%, 100% { box-shadow: 0 0 0 0 rgba(251,191,36,0.4); }
          50%       { box-shadow: 0 0 0 8px rgba(251,191,36,0); }
        }
        .slide-1 { animation: slideUp 0.75s 0.05s both ease-out; }
        .slide-2 { animation: slideUp 0.75s 0.15s both ease-out; }
        .slide-3 { animation: slideUp 0.75s 0.25s both ease-out; }
        .slide-4 { animation: slideUp 0.75s 0.35s both ease-out; }
        .slide-5 { animation: slideUp 0.75s 0.45s both ease-out; }
        .slide-6 { animation: slideUp 0.75s 0.55s both ease-out; }
        .slide-7 { animation: slideUp 0.75s 0.65s both ease-out; }
        .shimmer-text {
          background: linear-gradient(90deg,#22c55e 0%,#86efac 35%,#4ade80 50%,#86efac 65%,#22c55e 100%);
          background-size: 200% auto;
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: shimmer 3.5s linear infinite;
        }
      `}</style>

      {/* ── Root ── */}
      <div className="relative flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center overflow-hidden bg-background px-4 py-12 sm:py-16">

        {/* Animated dot-grid canvas */}
        <canvas
          ref={canvasRef}
          className="pointer-events-none absolute inset-0 h-full w-full"
          aria-hidden="true"
        />

        {/* Ambient glow orbs */}
        <div
          className="pointer-events-none absolute -left-24 top-0 h-[480px] w-[480px] rounded-full bg-primary/10 blur-[110px] md:h-[600px] md:w-[600px]"
          style={{ animation: "orb1 22s ease-in-out infinite" }}
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -right-24 bottom-0 h-[380px] w-[380px] rounded-full bg-primary/8 blur-[90px] md:h-[500px] md:w-[500px]"
          style={{ animation: "orb2 28s ease-in-out infinite" }}
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 h-[260px] w-[260px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/6 blur-[70px]"
          style={{ animation: "orb3 16s ease-in-out infinite" }}
          aria-hidden="true"
        />

        {/* Floating particles */}
        <FloatingParticles />

        {/* ── Content wrapper ── */}
        <div className="relative z-10 w-full max-w-xl sm:max-w-2xl">

          {/* ── Logo & Brand strip ── */}
          <div className="slide-1 mb-8 flex flex-col items-center gap-3 sm:mb-10">
            <div className="relative">
              <div className="absolute inset-0 rounded-2xl bg-primary/25 blur-xl" />
              <Image
                src="/android-chrome-192x192.png"
                alt="GUCC Logo"
                width={64}
                height={64}
                className="relative rounded-2xl shadow-lg"
                priority
              />
            </div>
            <div className="text-center">
              <p className="text-[10px] font-black tracking-[0.25em] text-primary uppercase sm:text-xs">
                Green University Computer Club
              </p>
              <p className="mt-0.5 text-[10px] tracking-wider text-muted-foreground/60 uppercase">
                Dhaka, Bangladesh
              </p>
            </div>
          </div>

          {/* ── Glass card ── */}
          <div className="overflow-hidden rounded-3xl border border-border/50 bg-card/55 shadow-2xl shadow-black/25 backdrop-blur-2xl">

            {/* Gradient top edge */}
            <div className="h-px bg-linear-to-r from-transparent via-primary/60 to-transparent" />

            <div className="px-5 py-8 sm:px-10 sm:py-12">

              {/* Status badge */}
              <div className="slide-2 mb-7 flex justify-center">
                <div
                  className="inline-flex items-center gap-2.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-4 py-1.5"
                  style={{ animation: "badgePing 2.5s ease-in-out infinite" }}
                >
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
                  </span>
                  <span className="text-[11px] font-bold tracking-[0.15em] text-amber-400 uppercase">
                    Recruitment Closed
                  </span>
                </div>
              </div>

              {/* Animated clock visual */}
              <div className="slide-3 mb-8 flex justify-center">
                <ClockVisual />
              </div>

              {/* Headline */}
              <div className="slide-4 mb-5 text-center">
                <h1 className="text-4xl font-black leading-tight tracking-tight sm:text-5xl lg:text-6xl">
                  <span className="shimmer-text">Recruitment</span>
                  <br />
                  <span className="text-foreground/90">is Closed</span>
                </h1>
              </div>

              {/* Subtitle */}
              <div className="slide-5 mb-8 text-center">
                <p className="mx-auto max-w-md text-sm leading-7 text-muted-foreground sm:text-base sm:leading-8">
                  The GUCC recruitment window has ended for this cycle.{" "}
                  <span className="font-semibold text-foreground/80">
                    A new session opens every semester
                  </span>{" "}
                  — follow our social channels to be the first to know!
                </p>
              </div>

              {/* Decorative divider */}
              <div className="slide-5 mb-8 flex items-center gap-4">
                <div className="h-px flex-1 bg-linear-to-r from-transparent to-border/70" />
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
                <div className="h-px flex-1 bg-linear-to-l from-transparent to-border/70" />
              </div>

              {/* Info cards — 3-col on sm+, 1-col on mobile */}
              <div className="slide-6 mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <InfoCard
                  icon={<Bell className="h-4 w-4" />}
                  title="Stay Notified"
                  description="Follow our social channels for instant alerts when recruitment opens."
                  animDelay="0.55s"
                />
                <InfoCard
                  icon={<Users className="h-4 w-4" />}
                  title="Open to All"
                  description="Any enrolled student of Green University is welcome to apply."
                  animDelay="0.62s"
                />
                <InfoCard
                  icon={<Zap className="h-4 w-4" />}
                  title="Next Cycle"
                  description="Recruitment typically reopens at the start of each new semester."
                  animDelay="0.69s"
                />
              </div>

              {/* CTA Buttons */}
              <div className="slide-7 mb-8 flex flex-col gap-3 sm:flex-row">
                <Button
                  asChild
                  size="lg"
                  className="flex-1 gap-2 font-semibold shadow-lg shadow-primary/20 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-primary/30"
                >
                  <Link href="/">
                    <Home className="h-4 w-4" />
                    Back to Home
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="lg"
                  className="flex-1 gap-2 font-semibold border-border/60 transition-all duration-300 hover:scale-[1.02] hover:border-primary/50 hover:bg-primary/5 hover:shadow-lg hover:shadow-primary/10"
                >
                  <Link href="/events">
                    View Events
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>

              {/* Social links */}
              <div className="slide-7 flex flex-col items-center gap-3">
                <p className="text-[11px] font-medium tracking-widest text-muted-foreground/60 uppercase">
                  Follow us
                </p>
                <div className="flex items-center gap-2.5">
                  <SocialButton
                    href="https://www.facebook.com/GreenUniversityComputerClub"
                    icon={<Facebook className="h-4 w-4" />}
                    label="Facebook Page"
                  />
                  <SocialButton
                    href="https://www.facebook.com/groups/1455061688068622"
                    icon={<Users className="h-4 w-4" />}
                    label="Facebook Group"
                  />
                  <SocialButton
                    href="https://www.linkedin.com/company/greenuniversitycomputerclub/"
                    icon={<Linkedin className="h-4 w-4" />}
                    label="LinkedIn"
                  />
                  <SocialButton
                    href="https://www.instagram.com/GreenUniversityComputerClub/"
                    icon={<Instagram className="h-4 w-4" />}
                    label="Instagram"
                  />
                  <SocialButton
                    href="https://gucc.green.edu.bd"
                    icon={<Globe className="h-4 w-4" />}
                    label="Website"
                  />
                </div>
              </div>
            </div>

            {/* Gradient bottom edge */}
            <div className="h-px bg-linear-to-r from-transparent via-primary/30 to-transparent" />
          </div>

          {/* Footer note */}
          <p className="slide-7 mt-6 text-center text-[11px] text-muted-foreground/50">
            © {new Date().getFullYear()} Green University Computer Club · All rights reserved
          </p>
        </div>
      </div>
    </>
  );
}
