"use client";

/** One-shot messages that survive a page reload (e.g. "Saved." after an admin action). */
const KEY = "gucc:flash";

export function setFlash(message: string) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ message, at: Date.now() }));
  } catch {
    /* storage unavailable: the message is simply not shown */
  }
}

export function takeFlash(): string | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    const { message, at } = JSON.parse(raw) as { message: string; at: number };
    return Date.now() - at < 30_000 ? message : null;
  } catch {
    return null;
  }
}

/** Show a message now, without a reload (the page's FlashMessage listens). */
export function showFlash(message: string) {
  try {
    window.dispatchEvent(new CustomEvent("gucc:flash", { detail: message }));
  } catch {
    /* no window: nothing to show */
  }
}

/** Reload the current page (fresh server render) and show a message afterwards. */
export function reloadWith(message?: string, url?: string) {
  if (message) setFlash(message);
  if (url) window.location.assign(url);
  else window.location.reload();
}
