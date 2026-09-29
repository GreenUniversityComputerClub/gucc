"use client";
import { useEffect, useRef, useState } from "react";
import CountUp from "react-countup";

/**
 * A home-page figure. The final number is in the page itself (search engines, screen readers and
 * people with animations turned off read it straight away); it counts up once when scrolled into
 * view.
 */
export function AnimatedStat({
  end,
  suffix = "",
  className = "",
}: {
  end: number;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [animate, setAnimate] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => {
      if (e?.isIntersecting) {
        setAnimate(true);
        io.disconnect();
      }
    }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`text-4xl font-bold text-primary ${className}`}>
      {animate ? <CountUp start={0} end={end} suffix={suffix} duration={2.5} /> : `${end.toLocaleString("en-US")}${suffix}`}
    </div>
  );
}
