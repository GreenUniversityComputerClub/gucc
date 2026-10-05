/** Numbered pages: the first, the last, and the current page with its neighbours ("1 … 4 5 6 … 9"). */
export function pageItems(current: number, total: number): Array<number | "gap"> {
  const pages = new Set([1, total, current - 1, current, current + 1].filter((p) => p >= 1 && p <= total));
  const sorted = [...pages].sort((a, b) => a - b);
  const out: Array<number | "gap"> = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1]! > 1) out.push("gap");
    out.push(p);
  });
  return out;
}

/** Page sizes a list offers, and the one used when the address doesn't say. */
export const PAGE_SIZES = [10, 25, 50, 100] as const;

/** `?size=` from the address, limited to the offered sizes. */
export function pageSizeOf(raw: string | undefined | null, fallback = 25): number {
  const n = Number(raw);
  return (PAGE_SIZES as readonly number[]).includes(n) ? n : fallback;
}

/** `?page=` from the address (1 when missing or not a number). */
export const pageOf = (raw: string | undefined | null) => Math.max(1, Math.floor(Number(raw)) || 1);
