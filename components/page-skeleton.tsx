/** A calm placeholder while a page loads: a title, a few lines and cards, no layout jump. */
export function PageSkeleton({ variant = "article" }: { variant?: "article" | "cards" | "profile" }) {
  const bar = "animate-pulse rounded-md bg-muted";
  return (
    <div className="container max-w-5xl py-8 sm:py-10" role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>
      {variant === "profile" ? (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <div className="h-28 animate-pulse bg-muted sm:h-36" />
          <div className="space-y-3 px-4 pb-6 sm:px-8">
            <div className="-mt-12 h-24 w-24 animate-pulse rounded-full border-4 border-card bg-muted sm:-mt-14 sm:h-28 sm:w-28" />
            <div className={`${bar} h-7 w-56`} />
            <div className={`${bar} h-4 w-72 max-w-full`} />
          </div>
        </div>
      ) : (
        <>
          <div className={`${bar} h-9 w-2/3`} />
          <div className={`${bar} mt-3 h-4 w-1/2`} />
          {variant === "cards" ? (
            <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => <div key={i} className={`${bar} h-72`} />)}
            </div>
          ) : (
            <div className="mt-8 space-y-3">
              <div className={`${bar} aspect-[2/1] w-full`} />
              {Array.from({ length: 6 }, (_, i) => <div key={i} className={`${bar} h-4`} style={{ width: `${95 - (i % 3) * 12}%` }} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
