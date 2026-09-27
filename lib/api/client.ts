import "server-only";
/**
 * The frontend's only way to reach data: HTTPS calls to the API Worker,
 * authenticated with a shared secret that never leaves the server.
 *
 *  publicGet()  published data, cached in Next's data cache under tags that
 *               admin actions revalidate (ISR pages stay fresh and cheap).
 *  rpc()        everything else; forwards the visitor's session token, IP and
 *               user agent so the Worker can authorize, rate-limit and audit.
 */
import net from "node:net";
import { absolutizeMedia, API_PUBLIC_BASE_URL } from "./config";

// Node tries each of the API's addresses for only 250 ms before giving up on it. On slow or
// IPv4-only networks that drops some of the parallel connections a build or busy page makes
// (ETIMEDOUT); a longer window costs nothing when the network is fast.
net.setDefaultAutoSelectFamilyAttemptTimeout(2000);

export type RpcResult<T> =
  | { ok: true; data: T; revalidate?: string[] }
  | { ok: false; error: string; code: string; fields?: Record<string, string>; trace?: string[]; status?: number };

const API_BASE_URL = (process.env.API_BASE_URL || API_PUBLIC_BASE_URL).replace(/\/+$/, "");

function secret(): string | null {
  return process.env.API_SHARED_SECRET || null;
}

export function apiConfigured(): boolean {
  return Boolean(secret());
}

export class ApiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiUnavailableError";
  }
}

/**
 * GET /v1/public/<path>. Returns null on 404. When the API is not configured
 * at all (CI builds without secrets) it returns `fallback` so the build still
 * produces pages; a configured-but-failing API throws, so a broken deployment
 * never silently publishes empty pages.
 */
export async function publicGet<T>(path: string, opts: { tags: string[]; revalidate?: number; fallback: T | null }): Promise<T | null> {
  const key = secret();
  if (!key) {
    if (process.env.NODE_ENV === "production" && process.env.VERCEL) throw new ApiUnavailableError("API_SHARED_SECRET is not set for this deployment.");
    return opts.fallback;
  }
  // Reads are safe to repeat: retry dropped connections and brief outages (a build opens
  // hundreds of connections at once) before failing the page.
  let res: Response | null = null;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch(`${API_BASE_URL}/v1/public/${path}`, {
        headers: { "X-Api-Key": key },
        next: { tags: opts.tags, revalidate: opts.revalidate ?? 3600 },
      });
      if ((res.status < 500 && res.status !== 429) || attempt >= 2) break;
    } catch (e) {
      if (attempt >= 2) throw e;
    }
    await new Promise((r) => setTimeout(r, 400 * 3 ** attempt));
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new ApiUnavailableError(`API ${path} responded ${res.status}`);
  const body = (await res.json()) as { ok: boolean; data: T };
  return absolutizeMedia(body.data);
}

export interface RpcContext {
  sessionToken?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

export async function callApi<T>(name: string, input: unknown, c: RpcContext = {}): Promise<RpcResult<T>> {
  const key = secret();
  if (!key) return { ok: false, error: "The service is not configured yet.", code: "MISCONFIGURED", status: 503 };
  const headers: Record<string, string> = { "Content-Type": "application/json", "X-Api-Key": key };
  if (c.sessionToken) headers.Authorization = `Bearer ${c.sessionToken}`;
  if (c.ip) headers["X-Client-IP"] = c.ip;
  if (c.userAgent) headers["X-User-Agent"] = c.userAgent.slice(0, 300);
  if (c.requestId) headers["X-Request-Id"] = c.requestId;
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/v1/rpc/${name}`, { method: "POST", headers, body: JSON.stringify({ input: input ?? {} }), cache: "no-store" });
  } catch (e) {
    console.error(`[api] ${name} unreachable`, e);
    return { ok: false, error: "The service is temporarily unavailable. Please try again.", code: "UNAVAILABLE", status: 503 };
  }
  const body = (await res.json().catch(() => null)) as RpcResult<T> | null;
  if (!body) return { ok: false, error: "The service returned an invalid response.", code: "BAD_RESPONSE", status: res.status };
  if (!body.ok) return { ...body, status: res.status };
  return { ...body, data: absolutizeMedia(body.data) };
}
