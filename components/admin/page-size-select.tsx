"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** "Show 25 per page": changing it starts again from the first page, keeping the filters. */
export function PageSizeSelect({ value, sizes }: { value: number; sizes: readonly number[] }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  return (
    <label className="flex items-center gap-1.5 text-muted-foreground">
      Show
      <select value={value} aria-label="Rows per page"
        onChange={(e) => {
          const next = new URLSearchParams(params.toString());
          next.set("size", e.target.value);
          next.delete("page");
          router.push(`${path}?${next.toString()}`);
        }}
        className="h-10 rounded-md border bg-background px-2 text-base text-foreground md:text-sm">
        {sizes.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      per page
    </label>
  );
}
