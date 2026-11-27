/**
 * A path on this site, or the fallback. Browsers ignore tabs and newlines inside URLs and treat
 * "\" like "/", so "/\tevil.com", "/\\evil.com" and "//evil.com" would all leave the site; any
 * control character or backslash is refused, and the result must resolve to this origin.
 */
export function safeLocalPath(path: unknown, fallback: string): string {
  if (typeof path !== "string" || path.length === 0 || path.length > 500) return fallback;
  // eslint-disable-next-line no-control-regex -- control characters are exactly what's refused
  if (/[\u0000-\u001f\u007f\\]/.test(path)) return fallback;
  if (!path.startsWith("/") || path.startsWith("//")) return fallback;
  try {
    const base = "https://site.invalid";
    const url = new URL(path, base);
    return url.origin === base ? `${url.pathname}${url.search}${url.hash}` : fallback;
  } catch {
    return fallback;
  }
}

/**
 * A safe `src` URL for client-rendered media coming from API or WebSocket snapshots. Allows only
 * normalized same-origin paths (`/media/...`, `/events/...`) or `http(s)` URLs whose origin
 * matches one of `allowedBases` (or the current browser origin), blocking control characters,
 * backslashes, credentials, `//...` protocol-relative paths, `javascript:`, and `data:`.
 */
export function safeMediaSrc(raw: unknown, ...allowedBases: (string | undefined)[]): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  // eslint-disable-next-line no-control-regex -- control characters and backslashes are explicitly refused
  if (trimmed.length === 0 || trimmed.length > 500 || /[\u0000-\u001f\u007f\\]/.test(trimmed)) {
    return null;
  }

  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    const local = safeLocalPath(trimmed, "");
    return local && local.startsWith("/") && !local.startsWith("//") ? local : null;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if ((parsed.protocol !== "https:" && parsed.protocol !== "http:") || parsed.username || parsed.password) {
    return null;
  }

  const trustedOrigins: string[] = [];
  const runtimeOrigin = (globalThis as { location?: { origin?: unknown } }).location?.origin;
  if (typeof runtimeOrigin === "string" && (runtimeOrigin.startsWith("https://") || runtimeOrigin.startsWith("http://"))) {
    trustedOrigins.push(runtimeOrigin);
  }
  for (const base of allowedBases) {
    if (!base) continue;
    try {
      const origin = new URL(base).origin;
      if ((origin.startsWith("https://") || origin.startsWith("http://")) && !trustedOrigins.includes(origin)) {
        trustedOrigins.push(origin);
      }
    } catch {
      // ignore malformed base URL
    }
  }

  for (const origin of trustedOrigins) {
    if (parsed.origin === origin && parsed.href.startsWith(`${origin}/`)) {
      const safeHref = `${origin}${parsed.pathname}${parsed.search}`;
      return safeHref.startsWith(`${origin}/`) ? safeHref : null;
    }
  }
  return null;
}
