import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Turns the two shapes stored in `data/executives.json` — a bare address and
 * the malformed `mailto::address` — into a usable `mailto:` href.
 * Returns undefined for anything that is not an email address.
 */
export function mailtoHref(mail?: string | null): string | undefined {
  if (!mail) return undefined;
  const address = mail.replace(/^mailto:+/i, "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)
    ? `mailto:${address}`
    : undefined;
}
