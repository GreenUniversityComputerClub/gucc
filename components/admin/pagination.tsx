import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { pageItems, PAGE_SIZES } from "@/lib/pagination";
import { cn } from "@/lib/utils";
import { PageSizeSelect } from "./page-size-select";

const box = "inline-flex h-10 min-w-10 items-center justify-center rounded-md border px-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Pages of a dashboard list. With the total it shows "Showing 51–100 of 342", numbered pages
 * (1 … 4 5 [6] 7 8 … 20), a page size and a jump box; without it, Previous and Next. Plain links
 * and a GET form: it works before (and without) JavaScript, and every page has its own address.
 */
export function Pager({ page, hasMore, base, params, total, pageSize, sizes }: {
  page: number;
  hasMore: boolean;
  base: string;
  params?: Record<string, string | undefined>;
  /** How many rows the whole list has (when it's cheap to count). */
  total?: number;
  /** Rows per page (with `total`). */
  pageSize?: number;
  /** Offer these page sizes (`?size=`). */
  sizes?: readonly number[];
}) {
  const href = (p: number, extra: Record<string, string> = {}) => {
    const s = new URLSearchParams(Object.entries({ ...params, ...(pageSize && sizes ? { size: String(pageSize) } : {}), ...extra, page: String(p) }).filter(([, v]) => v) as Array<[string, string]>);
    if (p === 1) s.delete("page");
    const q = s.toString();
    return q ? `${base}?${q}` : base;
  };
  if (total === undefined || !pageSize) {
    if (page <= 1 && !hasMore) return null;
    return (
      <nav aria-label="Pages" className="mt-4 flex items-center justify-between gap-2 text-sm">
        {page > 1 ? <Link prefetch={false} href={href(page - 1)} className={box}><ChevronLeft className="mr-1 h-4 w-4" aria-hidden />Previous</Link> : <span />}
        <span className="text-muted-foreground">Page {page}</span>
        {hasMore ? <Link prefetch={false} href={href(page + 1)} className={box}>Next<ChevronRight className="ml-1 h-4 w-4" aria-hidden /></Link> : <span />}
      </nav>
    );
  }
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pages);
  const first = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const last = Math.min(total, current * pageSize);
  return (
    <nav aria-label="Pages" className="mt-4 flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="text-muted-foreground" aria-live="polite">
        {total === 0 ? "Nothing to show" : <>Showing <span className="font-medium text-foreground">{first.toLocaleString("en-US")}–{last.toLocaleString("en-US")}</span> of <span className="font-medium text-foreground">{total.toLocaleString("en-US")}</span></>}
      </p>
      {pages > 1 && (
        <ul className="flex flex-wrap items-center gap-1">
          <li>
            {current > 1
              ? <Link prefetch={false} href={href(current - 1)} className={box} aria-label="Previous page"><ChevronLeft className="h-4 w-4" aria-hidden /></Link>
              : <span className={cn(box, "pointer-events-none opacity-40")} aria-hidden><ChevronLeft className="h-4 w-4" /></span>}
          </li>
          {pageItems(current, pages).map((item, i) => (
            <li key={item === "gap" ? `gap-${i}` : item}>
              {item === "gap"
                ? <span className="px-1 text-muted-foreground" aria-hidden>…</span>
                : <Link prefetch={false} href={href(item)} aria-label={`Page ${item}`} aria-current={item === current ? "page" : undefined}
                    className={cn(box, item === current && "border-primary bg-primary text-primary-foreground hover:bg-primary")}>{item}</Link>}
            </li>
          ))}
          <li>
            {current < pages
              ? <Link prefetch={false} href={href(current + 1)} className={box} aria-label="Next page"><ChevronRight className="h-4 w-4" aria-hidden /></Link>
              : <span className={cn(box, "pointer-events-none opacity-40")} aria-hidden><ChevronRight className="h-4 w-4" /></span>}
          </li>
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {sizes && <PageSizeSelect value={pageSize} sizes={sizes ?? PAGE_SIZES} />}
        {pages > 5 && (
          <form action={base} className="flex items-center gap-1.5">
            {Object.entries({ ...params, ...(sizes ? { size: String(pageSize) } : {}) }).filter(([, v]) => v).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
            <label htmlFor="jump-page" className="text-muted-foreground">Go to</label>
            <input id="jump-page" name="page" type="number" min={1} max={pages} placeholder={String(current)} inputMode="numeric"
              className="h-10 w-16 rounded-md border bg-background px-2 text-base md:text-sm" />
          </form>
        )}
      </div>
    </nav>
  );
}
