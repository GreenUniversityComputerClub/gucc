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
