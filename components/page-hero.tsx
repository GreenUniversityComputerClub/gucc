import Image from "next/image";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Stars at fixed positions (the same on the server and in the browser). */
const STARS = (() => {
  let seed = 23;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  return Array.from({ length: 46 }, () => ({
    top: rand() * 90,
    left: rand() * 100,
    size: rand() < 0.85 ? 1 + rand() : 2.2 + rand(),
    delay: rand() * 6,
    duration: 3 + rand() * 4,
  }));
})();

/**
 * The opening band of an inner page: the campus night sky, faint, under the floating header, with
 * a mono eyebrow, a gradient headline and a line of description. Always dark, whatever the theme,
 * so it reads as the same sky as the home page. `aside` sits beside the copy on wide screens (a
 * "next up" card, actions); `children` sit under the copy (search, filters, breadcrumbs).
 */
export function PageHero({
  eyebrow,
  icon,
  title,
  description,
  aside,
  children,
  breadcrumb,
  className,
  size = "md",
}: {
  eyebrow: ReactNode;
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  aside?: ReactNode;
  children?: ReactNode;
  /** A trail above the eyebrow (the Executives section). */
  breadcrumb?: ReactNode;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <section className={cn("dark dark-surface relative isolate -mt-16 overflow-hidden bg-background text-foreground", className)}>
      <Sky />

      <div className={cn("container relative px-4 md:px-6", size === "md" ? "pb-14 pt-32 md:pb-20 md:pt-40" : "pb-10 pt-28 md:pb-14 md:pt-32")}>
        <div className={cn("grid gap-8", aside && "lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-end")}>
          <div className="max-w-3xl">
            {breadcrumb && <div className="animate-rise mb-6">{breadcrumb}</div>}
            <p className="animate-rise inline-flex items-center gap-2 font-mono text-xs font-medium uppercase tracking-[0.25em] text-aurora-300">
              {icon && <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-aurora-200 ring-1 ring-white/15 [&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span>}
              {eyebrow}
            </p>
            <h1 className="animate-rise mt-4 font-display text-4xl font-bold leading-[1.05] tracking-tight text-white text-balance [animation-delay:0.1s] sm:text-5xl lg:text-6xl">
              {title}
            </h1>
            {description && (
              <p className="animate-rise mt-5 max-w-2xl text-base leading-relaxed text-white/75 [animation-delay:0.2s] md:text-lg">{description}</p>
            )}
          </div>
          {aside && <div className="animate-rise [animation-delay:0.3s]">{aside}</div>}
        </div>
        {children && <div className="animate-rise mt-8 [animation-delay:0.3s]">{children}</div>}
      </div>
    </section>
  );
}

/** The night sky behind a page's opening: the campus far away, aurora light, stars. */
function Sky() {
  return (
    <>
      {/* The campus, far away */}
      <div aria-hidden className="absolute inset-0 -z-30">
        <Image src="/hero/campus-night.webp" alt="" fill sizes="100vw" className="scale-110 object-cover object-[50%_30%] opacity-35 blur-[2px]" />
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-20">
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-background/40" />
        <div className="absolute -left-[10%] -top-1/2 h-[120%] w-[55%] rounded-full bg-brand-600/25 blur-[120px] animate-aurora" />
        <div className="absolute -right-[10%] top-0 h-full w-[40%] rounded-full bg-aurora-500/15 blur-[120px] animate-aurora [animation-delay:-7s]" />
        <div className="absolute inset-0 bg-grid opacity-50" />
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        {STARS.map((s, i) => (
          <span key={i} className="absolute rounded-full bg-white animate-twinkle"
            style={{ top: `${s.top}%`, left: `${s.left}%`, width: s.size, height: s.size, animationDelay: `${s.delay}s`, animationDuration: `${s.duration}s` }} />
        ))}
        <span className="shooting-star right-[12%] top-[18%]" style={{ animationDelay: "3s", animationDuration: "12s" }} />
        {/* Melts into the page below, over the aurora */}
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background to-transparent" />
      </div>
    </>
  );
}

/**
 * A slim band of the same sky for pages whose own heading comes further down (a profile, an
 * article): it clears the floating header and carries a breadcrumb trail or a back link.
 */
export function PageBand({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <section className={cn("dark dark-surface relative isolate -mt-16 overflow-hidden bg-background text-foreground", className)}>
      <Sky />
      <div className="container relative px-4 pb-8 pt-24 md:px-6 md:pt-28">{children}</div>
    </section>
  );
}
