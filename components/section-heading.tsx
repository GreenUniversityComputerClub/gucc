import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A section's title block: a numbered mono eyebrow ("01 / About"), the heading, and an optional
 * line under it. `align="center"` for sections that stand alone, left otherwise.
 */
export function SectionHeading({
  index,
  eyebrow,
  title,
  description,
  id,
  align = "left",
  className,
  children,
}: {
  index?: string;
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  id?: string;
  align?: "left" | "center";
  className?: string;
  /** Shown beside the title on wide screens (a "View all" link). */
  children?: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-6 md:flex-row md:items-end md:justify-between", align === "center" && "items-center text-center md:flex-col md:items-center", className)}>
      <div className={cn("max-w-2xl", align === "center" && "mx-auto")}>
        <p className={cn("inline-flex items-center gap-3 font-mono text-xs font-medium uppercase tracking-[0.25em] text-secondary", align === "center" && "justify-center")}>
          {index && <span className="text-primary">{index}</span>}
          <span className="h-px w-8 bg-gradient-to-r from-primary to-secondary" aria-hidden />
          {eyebrow}
        </p>
        <h2 id={id} className="mt-4 font-display text-3xl font-bold tracking-tight text-balance sm:text-4xl lg:text-5xl">
          {title}
        </h2>
        {description && <p className="mt-4 text-base leading-relaxed text-muted-foreground md:text-lg">{description}</p>}
      </div>
      {children}
    </div>
  );
}
