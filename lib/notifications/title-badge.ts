/**
 * What's waiting, where people look for it, as Facebook shows it: "(3) " in front of the tab's
 * title, a red count on the tab's icon, and the app badge of an installed site. Browser-only.
 *
 * Next.js sets the title itself on every navigation (and again when a page refreshes), so the
 * count is kept with an observer instead of being written once.
 */

const PREFIX = /^\(\d+\+?\)\s*/;

/** The title without a count. */
export const stripCount = (title: string) => title.replace(PREFIX, "");

/** The title with `n` in front ("(3) Events | GUCC"), or without a count at 0. */
export function withCount(title: string, n: number): string {
  const base = stripCount(title);
  return n > 0 ? `(${n > 99 ? "99+" : n}) ${base}` : base;
}

/** Keeps "(N) " on the title while running. */
export function titleKeeper() {
  let n = 0;
  let applying = false;
  const apply = () => {
    if (applying) return;
    const want = withCount(document.title, n);
    if (document.title === want) return;
    applying = true;
    document.title = want;
    applying = false;
  };
  const observer = new MutationObserver(apply);
  observer.observe(document.head, { childList: true, subtree: true, characterData: true });
  return {
    set(count: number) {
      n = Math.max(0, count);
      apply();
    },
    stop() {
      observer.disconnect();
      n = 0;
      document.title = stripCount(document.title);
    },
  };
}

/** A red count drawn on the site's icon, and the app badge where the browser has one. */
export function iconBadge(src = "/favicon-32x32.png") {
  let original: Map<HTMLLinkElement, string> | null = null;
  let image: HTMLImageElement | null = null;
  let current = 0;
  const links = () => [...document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')];
  const draw = (n: number) => {
    if (!image?.complete || !image.naturalWidth) return;
    const size = 32;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const g = c.getContext("2d");
    if (!g) return;
    g.drawImage(image, 0, 0, size, size);
    const label = n > 9 ? "9+" : String(n);
    const r = 9;
    g.beginPath();
    g.arc(size - r, r, r, 0, Math.PI * 2);
    g.fillStyle = "#e11d48";
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = "#ffffff";
    g.stroke();
    g.fillStyle = "#ffffff";
    g.font = `bold ${label.length > 1 ? 10 : 12}px system-ui, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(label, size - r, r + 0.5);
    const url = c.toDataURL("image/png");
    original ??= new Map(links().map((l) => [l, l.href]));
    for (const l of links()) l.href = url;
  };
  const restore = () => {
    if (!original) return;
    for (const [l, href] of original) l.href = href;
    original = null;
  };
  return {
    set(n: number) {
      current = n;
      const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
      if (n > 0) void nav.setAppBadge?.(n).catch(() => undefined);
      else void nav.clearAppBadge?.().catch(() => undefined);
      if (n <= 0) return restore();
      if (!image) {
        image = new Image();
        image.onload = () => draw(current);
        image.src = src;
      } else draw(n);
    },
    stop() {
      restore();
      const nav = navigator as Navigator & { clearAppBadge?: () => Promise<void> };
      void nav.clearAppBadge?.().catch(() => undefined);
    },
  };
}
