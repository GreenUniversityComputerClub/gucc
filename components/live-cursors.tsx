"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { animate, motion, motionValue, useAnimate, useScroll, useTransform, type MotionValue } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Content that arrives by being worked on. A small crew of cursors takes jobs from a queue: one drags
 * a selection over a card's area and the card pops up under the box, another types out a paragraph.
 * When a cursor runs out of work it shrinks away. Decoration only: hidden from screen readers, never
 * catches the pointer, and absent for people who prefer less motion. Without JavaScript, and for
 * search engines, all the content is simply there.
 */

const EASE = [0.65, 0, 0.35, 1] as const;

/** Roles, not people: nobody is really here. */
const CREW = [
  { label: "designer", color: "#a3e635", pace: 1 },
  { label: "frontend", color: "#34d399", pace: 0.8 },
  { label: "backend", color: "#4ade80", pace: 1.3 },
  { label: "editor", color: "#2dd4bf", pace: 1.1 },
];

/** Work starts once a thing's top has climbed past this line of the screen, so people see it happen. */
const START_LINE = "0px 0px -28% 0px";

type Worker = {
  color: string;
  glide: (x: number, y: number, duration: number) => Promise<unknown>;
  place: (x: number, y: number) => void;
  /** Where the page's coordinates start, right now (it moves as the page scrolls). */
  origin: () => DOMRect;
  stage: HTMLElement;
  /** Jobs are piling up: move quicker. */
  fast: boolean;
  /** This job's speed (above 1 is slower): each cursor has its own, varied a little per job. */
  pace: number;
};
type Job = (worker: Worker) => Promise<void>;
type JobOptions = {
  /** False once the page that asked has gone: the job is dropped, so it never holds a cursor up. */
  alive: () => boolean;
  /** A page's opening: next in line, with no pause before it starts. */
  first?: boolean;
};
type QueuedJob = JobOptions & { run: Job };

const StageContext = createContext<((job: Job, options: JobOptions) => void) | null>(null);

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const prefersLessMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The site's <main>, and the crew that works in it. */
export function SelectionStage({ id, className, children }: { id?: string; className?: string; children: ReactNode }) {
  const stage = useRef<HTMLElement>(null);
  const queue = useRef<QueuedJob[]>([]);
  const crew = useRef(CREW.map((c) => ({ ...c, x: motionValue(0), y: motionValue(0), opacity: motionValue(0), scale: motionValue(0.4), rotate: motionValue(-25), visible: false, shift: 0 })));
  const idle = useRef(crew.current.map((_, i) => i));

  const pump = useCallback(() => {
    queue.current = queue.current.filter((job) => job.alive());
    while (queue.current.length && idle.current.length && stage.current) {
      const c = crew.current[idle.current.shift()!]!;
      const index = crew.current.indexOf(c);
      const job = queue.current.shift()!;
      const shift = ++c.shift;
      const worker: Worker = {
        color: c.color,
        place: (x, y) => {
          c.x.set(x);
          c.y.set(y);
        },
        glide: (x, y, duration) => {
          // A cursor off duty flies in from just outside its first spot, growing as it comes.
          if (!c.visible) {
            c.visible = true;
            c.x.set(x - 90);
            c.y.set(y - 60);
            animate(c.opacity, 1, { duration: 0.25 });
            animate(c.scale, 1, { type: "spring", bounce: 0.4, duration: 0.5 });
            animate(c.rotate, 0, { duration: 0.4 });
          }
          return Promise.all([animate(c.x, x, { duration, ease: EASE }), animate(c.y, y, { duration, ease: EASE })]);
        },
        origin: () => stage.current!.getBoundingClientRect(),
        stage: stage.current,
        fast: queue.current.length >= 5,
        pace: c.pace * (0.8 + Math.random() * 0.5),
      };
      // Everyone starts in their own time, so a row of cards isn't worked on in lockstep.
      wait(job.first ? 0 : Math.random() * (worker.fast ? 250 : 500)).then(() => (job.alive() ? job.run(worker) : undefined)).finally(() => {
        idle.current.push(index);
        pump();
        // Nothing more to do shortly after: it bows out.
        setTimeout(() => {
          if (c.shift !== shift || !idle.current.includes(index) || !c.visible) return;
          c.visible = false;
          animate(c.opacity, 0, { duration: 0.45, ease: "easeIn" });
          animate(c.scale, 0.3, { duration: 0.45, ease: "easeIn" });
          animate(c.rotate, 35, { duration: 0.45, ease: "easeIn" });
          animate(c.y, c.y.get() + 34, { duration: 0.45, ease: "easeIn" });
        }, 500);
      });
    }
  }, []);
  const enqueue = useCallback(
    (run: Job, options: JobOptions) => {
      if (options.first) queue.current.unshift({ ...options, run });
      else queue.current.push({ ...options, run });
      pump();
    },
    [pump],
  );

  return (
    <StageContext.Provider value={enqueue}>
      <main ref={stage} id={id} className={cn("relative overflow-x-clip", className)}>
        {children}
        {crew.current.map((c) => (
          <motion.span key={c.label} aria-hidden className="pointer-events-none absolute left-0 top-0 z-40 origin-top-left print:hidden" style={{ x: c.x, y: c.y, opacity: c.opacity, scale: c.scale, rotate: c.rotate }}>
            <span className="flex items-start">
              <svg width="20" height="22" viewBox="0 0 18 20" className="drop-shadow-[0_2px_4px_rgb(0_0_0/0.45)]">
                <path d="M1.5 1.5 16 9.2l-6.3 1.9L6.6 18z" fill={c.color} stroke="#04130d" strokeWidth="1.4" strokeLinejoin="round" />
              </svg>
              <span className="-ml-0.5 mt-4 rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold text-[#04130d] shadow-md" style={{ backgroundColor: c.color }}>
                {c.label}
              </span>
            </span>
          </motion.span>
        ))}
      </main>
    </StageContext.Provider>
  );
}

/**
 * Empties an element's text so a cursor can write it back. Each piece keeps its place: the part not yet
 * written stays in the layout as an invisible twin beside the original text node, so nothing moves and
 * screen readers still have it all. React keeps owning the text node, which is restored afterwards.
 */
function blankText(el: HTMLElement) {
  const pieces: Array<{ node: Text; text: string; ghost: HTMLSpanElement; gap: number; last: string }> = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const node = n as Text;
    const parent = node.parentElement;
    const text = node.nodeValue ?? "";
    if (!parent || !text.trim()) continue;
    // Decoration, what writes itself, what can't be seen, and what's closed stay as they are.
    if (parent.closest("[aria-hidden],[data-no-write],[inert],.sr-only,svg,script,style,noscript")) continue;
    const closed = parent.closest("details:not([open])");
    if (closed && !parent.closest("summary")) continue;
    if (!parent.getClientRects().length) continue;
    pieces.push({ node, text, ghost: document.createElement("span"), gap: 0, last: "" });
  }
  for (const p of pieces) {
    const style = getComputedStyle(p.node.parentElement!);
    if (style.display.includes("flex")) p.gap = parseFloat(style.columnGap) || 0;
    p.ghost.style.opacity = "0";
    p.ghost.textContent = p.text;
    p.node.nodeValue = "";
    p.node.after(p.ghost);
  }
  const restore = () => {
    for (const p of pieces) {
      // (If React changed the text meanwhile, its value stands.)
      if (p.node.nodeValue === p.last) p.node.nodeValue = p.text;
      p.ghost.remove();
    }
    pieces.length = 0;
  };
  const total = pieces.reduce((sum, p) => sum + p.text.length, 0);
  /** Writes it all back, the cursor following the text. */
  const write = async ({ glide, place, origin, fast, pace }: Worker, alive: () => boolean) => {
    if (!pieces.length) return;
    const caret = (p: (typeof pieces)[number]) => {
      const c = p.ghost.getClientRects()[0] ?? p.ghost.getBoundingClientRect();
      const o = origin();
      return { x: c.left - o.left, y: c.top - o.top + c.height * 0.4 };
    };
    const first = caret(pieces[0]!);
    await glide(first.x, first.y, 0.3 * pace);
    const duration = Math.min(2600, Math.max(700, total * 16)) * pace * (fast ? 0.5 : 1);
    await new Promise<void>((done) => {
      const t0 = performance.now();
      const tick = (now: number) => {
        if (!alive() || !pieces.length) return done();
        let left = Math.ceil((total * (now - t0)) / duration);
        let at = pieces[0]!;
        for (const p of pieces) {
          const n = Math.max(0, Math.min(p.text.length, left));
          left -= p.text.length;
          const value = p.text.slice(0, n);
          if (value !== p.last) {
            p.node.nodeValue = value;
            p.last = value;
            p.ghost.textContent = p.text.slice(n);
            p.ghost.style.marginLeft = n > 0 && n < p.text.length && p.gap ? `-${p.gap}px` : "";
          }
          if (n > 0) at = p;
        }
        const c = caret(at);
        place(c.x, c.y);
        if (left < 0) requestAnimationFrame(tick);
        else done();
      };
      requestAnimationFrame(tick);
    });
  };
  return { restore, write };
}

/**
 * One subsection (a card, a tile, a panel): selected, popped up with its border and pictures, then its
 * text written in by the same cursor. Only those still below the start line when the page opens
 * are held back, and only after hydration, so the server's page has everything.
 */
export function SelectItem({ children, className }: { children: ReactNode; className?: string }) {
  const enqueue = useContext(StageContext);
  const [scope, run] = useAnimate<HTMLDivElement>();
  const outer = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ duration: number; color: string; leaving: boolean } | null>(null);

  useEffect(() => {
    const el = scope.current;
    const wrap = outer.current;
    if (!enqueue || !el || !wrap || prefersLessMotion()) return;
    if (wrap.getBoundingClientRect().top < window.innerHeight * 0.72) return;
    const closed = "inset(0% 100% 100% 0%)";
    el.style.clipPath = closed;
    const text = blankText(el);
    let alive = true;
    const finish = () => {
      el.style.clipPath = "";
      el.style.transform = "";
    };
    const finishAll = () => {
      finish();
      text.restore();
    };
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        io.disconnect();
        enqueue(async (worker: Worker) => {
          const { glide, origin, fast, color, pace } = worker;
          if (!alive) return;
          let r = wrap.getBoundingClientRect();
          // Scrolled past while it waited its turn: no one would see the selection.
          if (r.bottom < 0 || r.top > window.innerHeight) return finishAll();
          const o = origin();
          const left = r.left - o.left;
          const top = r.top - o.top;
          await glide(left, top, (fast ? 0.25 : 0.55) * pace);
          if (!alive) return;
          const drag = (fast ? 0.5 : 1) * pace;
          r = wrap.getBoundingClientRect();
          setBox({ duration: drag, color, leaving: false });
          await Promise.all([
            glide(left + r.width, top + r.height, drag),
            run(el, { clipPath: [closed, "inset(0% 0% 0% 0%)"], scale: [0.93, 1] }, { duration: drag, ease: EASE }),
          ]);
          // After a tick: the animation library writes its final frame just after it ends.
          await wait(220);
          finish();
          if (!alive) return;
          setBox((b) => b && { ...b, leaving: true });
          setTimeout(() => alive && setBox(null), 300);
          await text.write(worker, () => alive);
          text.restore();
        }, { alive: () => alive });
      },
      { rootMargin: START_LINE },
    );
    io.observe(wrap);
    return () => {
      alive = false;
      io.disconnect();
      finishAll();
    };
  }, [enqueue, run, scope]);

  return (
    <div ref={outer} className={cn("relative h-full", className)}>
      <div ref={scope} data-select-reveal className="h-full">
        {children}
      </div>
      {box && (
        <motion.span aria-hidden className="pointer-events-none absolute left-0 top-0 z-30 border border-dashed" style={{ borderColor: box.color, backgroundColor: `${box.color}12` }}
          initial={{ width: 0, height: 0, opacity: 1 }} animate={{ width: "100%", height: "100%", opacity: box.leaving ? 0 : 1 }}
          transition={{ duration: box.duration, ease: EASE, opacity: { duration: 0.28 } }}>
          {["-left-1 -top-1", "-right-1 -top-1", "-left-1 -bottom-1", "-right-1 -bottom-1"].map((pos) => (
            <span key={pos} className={cn("absolute h-2 w-2 border bg-background", pos)} style={{ borderColor: box.color }} />
          ))}
        </motion.span>
      )}
    </div>
  );
}

const CSS_EASE = "cubic-bezier(0.65, 0, 0.35, 1)";

/**
 * The same work for content that can't be wrapped (list items, links, a page's existing blocks): every
 * element matching `selector` inside is selected, popped up and written, in place. A wrapper that adds
 * nothing to the layout.
 */
export function SelectAll({ selector, children }: { selector: string; children: ReactNode }) {
  const enqueue = useContext(StageContext);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = root.current;
    if (!enqueue || !container || prefersLessMotion()) return;
    const stops: Array<() => void> = [];
    for (const el of Array.from(container.querySelectorAll<HTMLElement>(selector))) {
      // The outermost only, and only what's below the start line and displayed.
      if (el.parentElement?.closest(selector)) continue;
      const at = el.getBoundingClientRect();
      if (!el.getClientRects().length || at.top < window.innerHeight * 0.72) continue;
      // Off to the side in a swipe row: nobody would see it worked on, so it simply waits there, ready.
      if (at.left >= window.innerWidth || at.right <= 0) continue;
      const closed = "inset(0% 100% 100% 0%)";
      let alive = true;
      el.style.animation = "none"; // Any scroll-driven entrance of its own gives way while it's worked on.
      el.style.clipPath = closed;
      const text = blankText(el);
      let overlay: HTMLElement | null = null;
      const finish = () => {
        el.style.clipPath = "";
        el.style.animation = "";
      };
      const io = new IntersectionObserver(
        ([entry]) => {
          if (!entry?.isIntersecting) return;
          io.disconnect();
          enqueue(async (worker: Worker) => {
            const { glide, origin, stage, fast, color, pace } = worker;
            if (!alive) return;
            const r = el.getBoundingClientRect();
            if (r.bottom < 0 || r.top > window.innerHeight) {
              finish();
              return text.restore();
            }
            const o = origin();
            const left = r.left - o.left;
            const top = r.top - o.top;
            await glide(left, top, (fast ? 0.25 : 0.55) * pace);
            if (!alive) return;
            const drag = (fast ? 0.5 : 1) * pace * 1000;
            overlay = document.createElement("span");
            overlay.setAttribute("aria-hidden", "true");
            Object.assign(overlay.style, { position: "absolute", left: `${left}px`, top: `${top}px`, zIndex: "30", pointerEvents: "none", border: `1px dashed ${color}`, backgroundColor: `${color}12` });
            stage.append(overlay);
            const size = overlay.animate({ width: ["0px", `${r.width}px`], height: ["0px", `${r.height}px`] }, { duration: drag, easing: CSS_EASE, fill: "forwards" });
            const pop = el.animate({ clipPath: [closed, "inset(0% 0% 0% 0%)"], transform: ["scale(0.93)", "none"] }, { duration: drag, easing: CSS_EASE });
            await Promise.all([glide(left + r.width, top + r.height, drag / 1000), size.finished, pop.finished]);
            if (!alive) return;
            finish();
            const box = overlay;
            box.animate({ opacity: [1, 0] }, { duration: 280, fill: "forwards" }).finished.then(() => box.remove());
            await text.write(worker, () => alive);
            text.restore();
          }, { alive: () => alive });
        },
        { rootMargin: START_LINE },
      );
      io.observe(el);
      stops.push(() => {
        alive = false;
        io.disconnect();
        overlay?.remove();
        finish();
        text.restore();
      });
    }
    return () => stops.forEach((stop) => stop());
  }, [enqueue, selector]);

  return (
    <div ref={root} className="contents">
      {children}
    </div>
  );
}

/**
 * A paragraph a cursor writes out. The words not yet written stay in place, invisible, so the layout
 * doesn't move and screen readers and search engines always have the whole text. `immediate`: for the
 * opening of a page, where it is on screen from the start.
 */
export function WriteText({ text, className, immediate, msPerChar = 30 }: { text: string; className?: string; immediate?: boolean; msPerChar?: number }) {
  const enqueue = useContext(StageContext);
  const root = useRef<HTMLSpanElement>(null);
  const shown = useRef<HTMLSpanElement>(null);
  const caret = useRef<HTMLSpanElement>(null);
  const rest = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const [a, b, m, w] = [shown.current, rest.current, caret.current, root.current];
    if (!enqueue || !a || !b || !m || !w || prefersLessMotion()) return;
    if (!immediate && w.getBoundingClientRect().top < window.innerHeight * 0.72) return;
    const finish = () => {
      a.textContent = text;
      b.textContent = "";
    };
    a.textContent = "";
    b.textContent = text;
    let alive = true;
    const start = () =>
      enqueue(async ({ glide, place, origin, fast, pace }) => {
        const r = w.getBoundingClientRect();
        if (!alive) return;
        if (r.bottom < 0 || r.top > window.innerHeight) return finish();
        const at = () => {
          const c = m.getBoundingClientRect();
          const o = origin();
          return { x: c.left - o.left, y: c.top - o.top + c.height * 0.4 };
        };
        const first = at();
        await glide(first.x, first.y, immediate ? 0.15 : (fast ? 0.25 : 0.5) * pace);
        // A page's opening never keeps people waiting to read it.
        const duration = immediate ? Math.min(800, text.length * 6) : Math.max(1300, text.length * msPerChar) * pace * (fast ? 0.6 : 1);
        await new Promise<void>((done) => {
          const t0 = performance.now();
          const tick = (now: number) => {
            if (!alive) return done();
            const n = Math.min(text.length, Math.ceil((text.length * (now - t0)) / duration));
            a.textContent = text.slice(0, n);
            b.textContent = text.slice(n);
            const p = at();
            place(p.x, p.y);
            if (n < text.length) requestAnimationFrame(tick);
            else done();
          };
          requestAnimationFrame(tick);
        });
      }, { alive: () => alive, first: immediate });
    if (immediate) {
      start();
      return () => {
        alive = false;
        finish();
      };
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        io.disconnect();
        start();
      },
      { rootMargin: START_LINE },
    );
    io.observe(w);
    return () => {
      alive = false;
      io.disconnect();
      finish();
    };
  }, [enqueue, immediate, msPerChar, text]);

  return (
    <span ref={root} data-no-write className={className}>
      <span ref={shown}>{text}</span>
      <span ref={caret} />
      <span ref={rest} className="opacity-0" />
    </span>
  );
}

/** A section's stop on the thread: its node lights as the section comes into view. */
export function SectionStop({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [lit, setLit] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e?.isIntersecting) {
        setLit(true);
        io.disconnect();
      }
    }, { rootMargin: "0px 0px -30% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className="relative">
      <span aria-hidden className="absolute left-[14px] top-24 z-10 hidden xl:block">
        <span className={cn("block h-3 w-3 rounded-full border-2 transition-all duration-700", lit ? "border-bright bg-bright shadow-[0_0_14px_3px] shadow-bright/60" : "border-border bg-background")} />
      </span>
      {children}
    </div>
  );
}

/** The rail linking a page's sections: it fills as you scroll, with a spark at its leading edge. */
export function SectionThread({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 70%", "end 70%"] });
  return (
    <div ref={ref} className="relative">
      <div aria-hidden className="pointer-events-none absolute bottom-0 left-[19px] top-0 z-0 hidden w-0.5 bg-border/60 xl:block">
        <ThreadFill progress={scrollYProgress} />
      </div>
      {children}
    </div>
  );
}

function ThreadFill({ progress }: { progress: MotionValue<number> }) {
  const top = useTransform(progress, (p) => `${p * 100}%`);
  return (
    <>
      <motion.span className="absolute inset-x-0 top-0 h-full origin-top bg-gradient-to-b from-primary via-bright to-secondary shadow-[0_0_10px] shadow-bright/50" style={{ scaleY: progress }} />
      <motion.span className="absolute left-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-secondary shadow-[0_0_16px_4px] shadow-secondary/70" style={{ top }} />
    </>
  );
}
