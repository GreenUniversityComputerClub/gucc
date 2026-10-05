"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Mail } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Getting around a long sponsorship page: chips under the site's header that follow the reader,
 * and on phones a bar at the bottom with the one thing to do ("Become a sponsor") and a way to
 * reach the club. Both are plain links, so they work before JavaScript too.
 */
export function SectionNav({ items, cta, contact }: { items: Array<{ id: string; label: string }>; cta: { label: string; href: string }; contact: string }) {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      const seen = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (seen) setActive(seen.target.id);
    }, { rootMargin: "-30% 0px -60% 0px" });
    for (const it of items) {
      const el = document.getElementById(it.id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [items]);

  return (
    <>
      {items.length > 1 && (
        <nav aria-label="On this page" className="sticky top-16 z-30 border-b bg-background/85 backdrop-blur supports-backdrop-filter:bg-background/70">
          <ul className="container mx-auto flex max-w-7xl gap-1.5 overflow-x-auto px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {items.map((it) => (
              <li key={it.id} className="shrink-0">
                <a href={`#${it.id}`} aria-current={active === it.id ? "true" : undefined}
                  className={cn("inline-flex min-h-9 items-center rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active === it.id ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground")}>
                  {it.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
      {/* Phones: the next step is always one tap away. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_-12px_rgb(0_0_0/0.35)] backdrop-blur md:hidden">
        <div className="flex gap-2">
          <a href={cta.href} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm active:scale-[0.98]">
            {cta.label}<ArrowRight className="h-4 w-4" aria-hidden />
          </a>
          <a href={contact} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-medium" aria-label="Contact the club">
            <Mail className="h-4 w-4" aria-hidden />Contact
          </a>
        </div>
      </div>
    </>
  );
}
