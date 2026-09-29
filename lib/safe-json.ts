/** JSON.parse that answers null instead of throwing, for stored values a page only displays. */
export function safeJson<T = unknown>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
