/**
 * Helping someone whose form doesn't show. The page never gives out a form's own address, so when
 * the frame stays blank (a blocked cookie, a missing Google sign-in, an app's built-in browser)
 * all it can do is say what to change: these pure helpers pick the words for the visitor's browser.
 */
import type { FormProvider } from "./providers";

export type BrowserKind = "safari" | "chrome" | "edge" | "firefox" | "other";

export interface Visitor {
  browser: BrowserKind;
  ios: boolean;
  android: boolean;
}

export function visitorOf(userAgent: string): Visitor {
  const ios = /iPhone|iPad|iPod/i.test(userAgent);
  const android = /Android/i.test(userAgent);
  let browser: BrowserKind = "other";
  if (/Edg(e|A|iOS)?\//.test(userAgent)) browser = "edge";
  else if (/Firefox|FxiOS/i.test(userAgent)) browser = "firefox";
  else if (/Chrome|CriOS|Chromium/i.test(userAgent)) browser = "chrome";
  else if (/Safari/i.test(userAgent) || ios) browser = "safari";
  return { browser, ios, android };
}

/** Where to sign in to the account a form needs (the provider's own sign-in page, not the form). */
export const SIGN_IN_PAGE: Partial<Record<FormProvider, { account: string; url: string }>> = {
  google: { account: "Google account", url: "https://accounts.google.com/" },
  microsoft: { account: "Microsoft account", url: "https://login.microsoftonline.com/" },
};

/** What to change so the provider can recognise a signed-in visitor inside the page. */
export function cookieAdvice(v: Visitor): string {
  if (v.ios) return "Open Settings → Safari (on newer iPhones: Settings → Apps → Safari) and turn off “Prevent Cross-Site Tracking”, then come back to this page in Safari.";
  switch (v.browser) {
    case "safari":
      return "In Safari: Settings → Privacy → untick “Prevent cross-site tracking”, then reload this page.";
    case "firefox":
      return "In Firefox: click the shield beside the address → turn off Enhanced Tracking Protection for this site, then reload.";
    case "edge":
      return "In Edge: click the lock beside the address → Cookies and site permissions → allow third-party cookies for this site, then reload.";
    case "chrome":
      return "In Chrome: click the icon beside the address (an eye, a lock or a tune icon) → allow third-party cookies for this site, then reload.";
    default:
      return "Allow third-party cookies for this site in your browser's privacy settings (or turn its tracking protection off for this site), then reload.";
  }
}

/** Android: an address that opens this page in Chrome instead of an app's own browser. */
export function chromeIntent(href: string): string | null {
  try {
    const u = new URL(href);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=${u.protocol.slice(0, -1)};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(href)};end`;
  } catch {
    return null;
  }
}
