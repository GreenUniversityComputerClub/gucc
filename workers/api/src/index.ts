/**
 * GUCC API Worker — the whole backend (Cloudflare free plan).
 *
 *   GET  /health                   liveness + database reachability
 *   GET  /v1/public/...            published data for the site (API key)
 *   POST /v1/rpc/:procedure        everything else, from the Next.js server only (API key
 *                                  + optional user session as a bearer token)
 *   POST /v1/upload                browser → Worker file upload with a short-lived signed token
 *   GET  /v1/live                  browser WebSocket to the live hub (signed two-minute ticket)
 *   GET  /media/<key>              R2 objects: public ones cached for a year, private ones
 *                                  only with a valid expiring signature
 *   cron (hourly)                  housekeeping
 *
 * The Next.js frontend (Vercel) holds the API key; browsers never see it.
 */
import { Db } from "../../../lib/server/db";
import { AppError, AuthRequiredError, ValidationError } from "../../../lib/server/errors";
import { readCommittees, readContests, readCertificate, readCertificateByStudent, readProfileCertificates, readEvent, readEvents, readForm, readFormSource, readForms, readPost, readPosts, readSetting, readSitemap, readSponsorship, readSponsorships } from "../../../lib/public/read";
import type { VariantName } from "../../../lib/media/bytes";
import { forgetMediaLookup, resolveMediaAccess, uploadMedia, uploadsOpen, MAX_BYTES_PER_REQUEST } from "../../../lib/server/services/media";
import { recordHeartbeat, runDailyHousekeeping, runMaintenance } from "../../../lib/server/services/maintenance";
import { remindStaleApprovals } from "../../../lib/server/services/approvals";
import { runRetention } from "../../../lib/server/services/retention";
import { sealAuditLog } from "../../../lib/server/services/audit-seal";
import { guardFreeTier } from "../../../lib/server/services/cloudflare-usage";
import { MAX_UPLOADS_PER_SESSION, publicCampaign, type UploadTokenPayload } from "../../../lib/server/services/recruitment";
import { verificationSecrets, verifyToken } from "../../../lib/server/signing";
import { buildCtx } from "./context";
import type { Ctx } from "../../../lib/server/context";
import type { Env } from "./env";
import { allowedOrigins, corsHeaders, errorResponse, json, notFound, safeEqual, statusOf } from "./http";
import { allow, clientIp, EDGE_LIMITS, tooMany } from "./guard";
import { beginIdempotent, isIdempotent } from "../../../lib/server/idempotency";
import { limit } from "../../../lib/server/limits";
import { flushOutbox, sendDigests } from "../../../lib/server/email-outbox";
import { runCampaignTick } from "../../../lib/server/services/campaigns";
import { procedures, STEP_UP } from "./rpc";
import { requireRecentAuth } from "../../../lib/server/security";
import { API_VERSION } from "../../../lib/version";
import { emitLive, handleLiveConnect } from "./live";

/** The live hub's Durable Object class (wrangler.jsonc "exports"). */
export { LiveHub } from "./live-hub";

const VARIANTS: VariantName[] = ["master", "lg", "md", "sm", "thumb"];
/** The daily cron in wrangler.jsonc (data retention and media lifecycle); the other one is hourly. */
const DAILY_CRON = "43 21 * * *";

/** Work that finishes after the response (Workers keep the invocation alive for it). */
function background(ectx: ExecutionContext | undefined, work: Promise<unknown>): void {
  const safe = work.catch((e) => console.error("background work failed", e));
  if (ectx && typeof ectx.waitUntil === "function") ectx.waitUntil(safe);
}

/** The current key, or the next one while a rotation is in progress (docs/platform/DEPLOYMENT.md). */
function apiKeyOk(env: Env, req: Request): boolean {
  const key = req.headers.get("x-api-key");
  return safeEqual(key, env.API_SHARED_SECRET) || Boolean(env.API_SHARED_SECRET_NEXT && safeEqual(key, env.API_SHARED_SECRET_NEXT));
}

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization");
  return h?.startsWith("Bearer ") ? h.slice(7).trim() || null : null;
}

async function handlePublic(env: Env, url: URL): Promise<Response> {
  const db = new Db(env.DB);
  const parts = url.pathname.replace(/^\/v1\/public\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const cache = { "Cache-Control": "public, max-age=60" };
  const ok = (data: unknown) => json({ ok: true, data }, { headers: cache });
  switch (parts[0]) {
    case "committees":
      return ok(await readCommittees(db));
    case "events":
      if (parts[1]) {
        const e = await readEvent(db, parts[1]);
        return e ? ok(e) : notFound();
      }
      return ok(await readEvents(db));
    case "contests":
      return ok(await readContests(db));
    case "posts":
      if (parts[1] && parts[2]) {
        const p = await readPost(db, parts[1].toUpperCase(), parts[2]);
        return p ? ok(p) : notFound();
      }
      return ok(await readPosts(db, (url.searchParams.get("type") ?? "BLOG").toUpperCase(), Number(url.searchParams.get("limit") ?? 50)));
    case "settings":
      return parts[1] ? ok(await readSetting(db, parts[1])) : notFound();
    case "sponsorships": {
      if (!parts[1]) return ok(await readSponsorships(db));
      const page = await readSponsorship(db, parts[1]);
      return page ? ok(page) : notFound();
    }
    case "certificates": {
      if (parts[1] === "of" && parts[2]) return ok(await readProfileCertificates(db, decodeURIComponent(parts[2]).slice(0, 120)));
      if (parts[1] === "by-student" && parts[2]) {
        const c = await readCertificateByStudent(db, parts[2]);
        return c ? ok(c) : notFound();
      }
      const code = parts[1] && /^[0-9A-Z]{16}$/.test(parts[1]) ? parts[1] : null;
      const cert = code ? await readCertificate(db, code) : null;
      return cert ? ok(cert) : notFound();
    }
    case "forms": {
      if (!parts[1]) return ok(await readForms(db));
      // The form's own address, for the website's server (never cached by anything in between).
      if (parts[2] === "source") {
        const src = await readFormSource(db, parts[1]);
        return src ? json({ ok: true, data: src }, { headers: { "Cache-Control": "private, no-store" } }) : notFound();
      }
      const f = await readForm(db, parts[1]);
      return f ? ok(f) : notFound();
    }
    case "recruitment": {
      const { ctx } = await buildCtx(env, new Request(url), { trusted: false });
      return json({ ok: true, data: await publicCampaign(ctx) }, { headers: { "Cache-Control": "no-store" } });
    }
    case "sitemap":
      return ok(await readSitemap(db));
    default:
      return notFound();
  }
}

/** Unexpected failures go to error_events (for System health). Never throws; no request data. */
async function recordError(env: Env, e: { requestId: string; procedure: string; error: unknown; actorId: string | null }): Promise<void> {
  const message = (e.error instanceof Error ? e.error.message : String(e.error)).slice(0, 300);
  const code = e.error && typeof e.error === "object" && "code" in e.error ? String((e.error as { code: unknown }).code).slice(0, 40) : "INTERNAL";
  try {
    await env.DB.prepare("INSERT INTO error_events (id, created_at, request_id, procedure, code, status, message, actor_user_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)")
      .bind(`err_${crypto.randomUUID()}`, new Date().toISOString(), e.requestId, e.procedure, code, statusOf(e.error), message, e.actorId)
      .run();
  } catch {
    // The database itself may be what failed; the Worker log still has the error.
  }
}

/** Frequent checks answered from the session alone (see buildCtx `light`). */
const LIGHT_PROCEDURES = new Set(["session.counts", "chat.pulse", "notifications.seenPath", "live.ticket", "posts.reactions", "notifications.list", "notifications.markRead", "notifications.markUnread"]);

async function handleRpc(env: Env, req: Request, name: string, ectx: ExecutionContext): Promise<Response> {
  const requestId = req.headers.get("x-request-id")?.slice(0, 64) || crypto.randomUUID();
  const proc = Object.prototype.hasOwnProperty.call(procedures, name) ? procedures[name] : undefined;
  if (!proc) return json({ ok: false, error: "This API doesn't have that procedure.", code: "UNKNOWN_PROCEDURE" }, { status: 404 });
  let actorId: string | null = null;
  let built: Ctx | null = null;
  try {
    const len = Number(req.headers.get("content-length") ?? 0);
    if (len > 1_000_000) throw new AppError(413, "TOO_LARGE", "Request too large.");
    const body = (await req.json().catch(() => {
      throw new ValidationError("Expected a JSON body.");
    })) as { input?: unknown };
    const input = body?.input && typeof body.input === "object" && !Array.isArray(body.input) ? (body.input as Record<string, unknown>) : {};
    const sessionToken = bearer(req);
    const { ctx, tags } = await buildCtx(env, req, { trusted: true, sessionToken, light: LIGHT_PROCEDURES.has(name) });
    built = ctx;
    actorId = ctx.actor?.user.id ?? null;
    // Signed-in mutations have a per-account ceiling too, so spreading requests over many
    // addresses doesn't get around the per-IP limits.
    if (ctx.actor && isIdempotent(name)) await limit(ctx, "account.mutations", ctx.actor.user.id);
    // Access changes and deletions by holders of sensitive permissions: password entered recently.
    if (ctx.actor?.security?.holdsSensitive && STEP_UP.has(name)) await requireRecentAuth(ctx);
    // A repeat of the same action (double-click, retry) returns the first result instead of running again.
    const idem = isIdempotent(name) ? await beginIdempotent(ctx, name, input, req.headers.get("idempotency-key")) : null;
    if (idem?.replay !== undefined) {
      // A repeat gets the first answer, including which public pages to refresh (the first
      // refresh may not have got through).
      const r = idem.replay as { __replay?: number; data?: unknown; tags?: string[] } | null;
      const envelope = r && typeof r === "object" && r.__replay === 2;
      return json({ ok: true, data: envelope ? r.data ?? null : r ?? null, revalidate: envelope ? r.tags ?? [] : [], replayed: true });
    }
    let data: unknown;
    try {
      data = await proc({ ctx, input, sessionToken });
    } catch (e) {
      await idem?.abort().catch(() => undefined);
      throw e;
    }
    await idem?.finish({ __replay: 2, data: data ?? null, tags: [...tags] }).catch(() => undefined);
    warnIfNearQueryLimit(name, requestId, ctx.db.queries);
    // Public pages that changed are also refreshed from here, so an update never depends on the
    // website's own refresh call alone getting through.
    if (tags.size) background(ectx, pingRevalidate(env, new Set(tags)));
    // Open tabs hear about it now; only for work that really happened.
    if (ctx.live?.length) background(ectx, emitLive(env, ctx.live.splice(0)));
    return json({ ok: true, data: data ?? null, revalidate: [...tags] });
  } catch (e) {
    if (statusOf(e) >= 500) background(ectx, recordError(env, { requestId, procedure: name, error: e, actorId }));
    return errorResponse(e, requestId);
  } finally {
    // Emails for the notifications this request really wrote. Also after an error: a failed
    // sign-in that locks the account writes its security notice, then answers with an error.
    if (built?.outbox?.length) background(ectx, flushOutbox(built));
    // Announcement emails just queued (or resumed): the first few go now, the rest hourly. The
    // request made few outgoing calls of its own, so this keeps well inside the 50 per invocation.
    if (built?.campaignTick) {
      built.campaignTick = false;
      built.fetchBudget ??= { left: 30 };
      background(ectx, runCampaignTick(built));
    }
  }
}

async function handleUpload(env: Env, req: Request, ectx: ExecutionContext): Promise<Response> {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin, allowedOrigins(env.FRONTEND_ORIGIN));
  const requestId = req.headers.get("cf-ray") ?? crypto.randomUUID();
  if (req.method === "OPTIONS") return new Response(null, { status: cors["Access-Control-Allow-Origin"] ? 204 : 403, headers: cors });
  try {
    // Browsers always send Origin on cross-site POSTs; anything else is not our frontend.
    if (!cors["Access-Control-Allow-Origin"]) throw new AppError(403, "ORIGIN", "Uploads are only accepted from the GUCC website.");
    const token = await verifyToken<UploadTokenPayload>(verificationSecrets(env), bearer(req));
    if (!token) throw new AuthRequiredError("Your upload link expired. Refresh the page and try again.");
    const len = Number(req.headers.get("content-length") ?? 0);
    if (!len || len > MAX_BYTES_PER_REQUEST) throw new AppError(413, "TOO_LARGE", "Files too large for one upload.");
    const { ctx, tags } = await buildCtx(env, req, { trusted: false, userId: token.p === "user" ? token.s : null });
    if (token.p === "user" && !ctx.actor) throw new AuthRequiredError();
    if (token.p === "recruitment") {
      const used = (await ctx.db.value<number>("SELECT COUNT(*) FROM media WHERE upload_session = ?1", token.s)) ?? 0;
      if (used >= MAX_UPLOADS_PER_SESSION) throw new AppError(429, "RATE_LIMITED", "Too many files for one application. Refresh the page to start again.");
    }
    // Cheap checks before reading the body: uploads open and allowance left today.
    await uploadsOpen(ctx);
    const form = await req.formData().catch(() => {
      throw new ValidationError("Expected a multipart upload.");
    });
    const files: Partial<Record<VariantName, Uint8Array>> = {};
    for (const v of VARIANTS) {
      const f = form.get(`file_${v}`);
      if (f && typeof f !== "string") files[v] = new Uint8Array(await f.arrayBuffer());
    }
    const str = (k: string) => {
      const v = form.get(k);
      return typeof v === "string" && v ? v.slice(0, 500) : null;
    };
    const record = await uploadMedia(ctx, {
      files,
      originalFilename: str("filename") ?? "upload",
      sourceChecksum: str("sourceSha"),
      altText: str("alt"),
      visibility: (str("visibility") as "PUBLIC" | "PRIVATE" | "RESTRICTED" | null) ?? undefined,
      eventId: token.p === "user" ? token.eventId ?? null : null,
      replaceId: token.p === "user" ? token.replaceId ?? null : null,
      purpose: token.p === "recruitment" ? "recruitment" : (token.purpose as never),
      uploadSession: token.p === "recruitment" ? token.s : null,
    });
    // Browsers upload here directly, so no server action refreshes the pages: do it from here.
    if (tags.size) background(ectx, pingRevalidate(env, tags));
    if (ctx.outbox?.length) background(ectx, flushOutbox(ctx));
    if (ctx.live?.length) background(ectx, emitLive(env, ctx.live.splice(0)));
    return json({ ok: true, data: record }, { headers: cors });
  } catch (e) {
    return errorResponse(e, requestId, cors);
  }
}

/** The free plan allows 50 D1 statements per invocation; flag procedures that get close. */
function warnIfNearQueryLimit(what: string, requestId: string, queries: number): void {
  if (queries > 40) console.warn(`[${requestId}] ${what} ran ${queries} D1 statements (free plan limit: 50 per request)`);
}

/** Ask the website to refresh cached pages behind these tags (its /api/revalidate route). */
async function pingRevalidate(env: Env, tags: Set<string>): Promise<void> {
  if (!env.API_SHARED_SECRET || !env.PUBLIC_BASE_URL) return;
  await fetch(`${env.PUBLIC_BASE_URL.replace(/\/+$/, "")}/api/revalidate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Api-Key": env.API_SHARED_SECRET },
    body: JSON.stringify({ tags: [...tags] }),
  }).catch((e) => console.error("revalidate ping failed", e));
}

async function handleMedia(env: Env, req: Request, url: URL): Promise<Response> {
  let key: string;
  try {
    key = decodeURIComponent(url.pathname.slice("/media/".length));
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const { ctx } = await buildCtx(env, req, { trusted: false });
  const signature = { exp: url.searchParams.get("exp"), sig: url.searchParams.get("sig") };
  try {
    return await serveMedia(env, req, ctx, key, signature);
  } catch (e) {
    // Storage or database unavailable: a plain 503 the browser retries later, never cached.
    console.error("media unavailable", e instanceof Error ? e.message : e);
    return new Response("Temporarily unavailable", { status: 503, headers: { "Retry-After": "30", "Cache-Control": "no-store" } });
  }
}

async function serveMedia(env: Env, req: Request, ctx: Ctx, key: string, signature: { exp: string | null; sig: string | null }): Promise<Response> {
  let access = await resolveMediaAccess(ctx, key, signature);
  if (!access) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  let obj = await (access.bucket === "public" ? env.MEDIA_PUBLIC : env.MEDIA_PRIVATE).get(access.key, { onlyIf: req.headers });
  if (!obj && access.cached) {
    // A remembered lookup went stale (file moved, replaced or deleted): ask the database again.
    forgetMediaLookup(key);
    access = await resolveMediaAccess(ctx, key, signature);
    if (!access) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
    obj = await (access.bucket === "public" ? env.MEDIA_PUBLIC : env.MEDIA_PRIVATE).get(access.key, { onlyIf: req.headers });
  }
  if (!obj) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  const type = obj.httpMetadata?.contentType ?? "application/octet-stream";
  const headers = new Headers({
    "Content-Type": type,
    "Cache-Control": access.cacheControl,
    ETag: obj.httpEtag,
    "X-Content-Type-Options": "nosniff",
    // Public images are embedded by the website on another origin. Private files are opened
    // with a signed, expiring link, and the dashboard shows applicant photos from it too.
    "Cross-Origin-Resource-Policy": "cross-origin",
    "Content-Security-Policy": type === "application/pdf" ? "default-src 'none'; object-src 'self'" : "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
  });
  if (type === "application/pdf") headers.set("Content-Disposition", "inline");
  if (access.bucket === "private") headers.set("Referrer-Policy", "no-referrer");
  if (!("body" in obj) || !obj.body) return new Response(null, { status: 304, headers });
  if (req.headers.get("if-none-match") === obj.httpEtag) return new Response(null, { status: 304, headers });
  return new Response(req.method === "HEAD" ? null : obj.body, { headers });
}

export default {
  async fetch(req: Request, env: Env, ectx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    // Local development (and the end-to-end suite, one browser loading many pages) gets roomier limits.
    const edge = env.APP_ENV === "development" ? 10 : 1;
    try {
      if (path === "/health") {
        if (!allow(`h:${clientIp(req)}`, EDGE_LIMITS.health * edge)) return tooMany();
        const ok = await Promise.resolve().then(() => env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>()).then((r) => r?.ok === 1).catch(() => false);
        return json({ ok, env: env.APP_ENV, version: API_VERSION, time: new Date().toISOString() }, { status: ok ? 200 : 503 });
      }
      if (path.startsWith("/media/")) {
        if (req.method !== "GET" && req.method !== "HEAD") return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
        if (path.length > 512 || url.search.length > 512) return new Response("Not found", { status: 404 });
        if (!allow(`m:${clientIp(req)}`, EDGE_LIMITS.media * edge)) return tooMany();
        return handleMedia(env, req, url);
      }
      if (path === "/v1/live" && req.method === "GET") {
        if (!allow(`l:${clientIp(req)}`, EDGE_LIMITS.live * edge)) return tooMany();
        return handleLiveConnect(env, req);
      }
      if (path === "/v1/upload" && (req.method === "POST" || req.method === "OPTIONS")) {
        if (req.method === "POST" && !allow(`u:${clientIp(req)}`, EDGE_LIMITS.upload * edge)) return tooMany();
        return handleUpload(env, req, ectx);
      }
      if (path.startsWith("/v1/")) {
        if (!env.API_SHARED_SECRET || !env.AUTH_SECRET) return json({ ok: false, error: "The API is not configured.", code: "MISCONFIGURED" }, { status: 503 });
        if (!apiKeyOk(env, req)) return json({ ok: false, error: "Unauthorized.", code: "UNAUTHORIZED" }, { status: 401 });
        if (path.startsWith("/v1/public/") && req.method === "GET") return handlePublic(env, url);
        const m = path.match(/^\/v1\/rpc\/([a-zA-Z]+\.[a-zA-Z]+)$/);
        if (m && req.method === "POST") return handleRpc(env, req, m[1], ectx);
      }
      if (path === "/" || path === "/robots.txt") {
        return new Response(path === "/" ? "GUCC API" : "User-agent: *\nDisallow: /\nAllow: /media/\n", { headers: { "Content-Type": "text/plain" } });
      }
      return notFound();
    } catch (e) {
      const requestId = req.headers.get("cf-ray") ?? crypto.randomUUID();
      if (statusOf(e) >= 500) background(ectx, recordError(env, { requestId, procedure: path.slice(0, 80), error: e, actorId: null }));
      return errorResponse(e, requestId);
    }
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    // The daily run gets its own invocation, so its statements don't share the hourly job's budget.
    if (controller.cron === DAILY_CRON) {
      ctx.waitUntil(
        (async () => {
          const { ctx: c } = await buildCtx(env, new Request("https://cron.internal/daily"), { trusted: false });
          try {
            const report = { ...(await runRetention(c)), housekeeping: await runDailyHousekeeping(c) };
            await recordHeartbeat(c, "retention", true, report);
            await flushOutbox(c);
            if (c.live?.length) await emitLive(env, c.live.splice(0));
            console.log("retention", JSON.stringify(report));
          } catch (e) {
            await recordHeartbeat(c, "retention", false, { error: (e instanceof Error ? e.message : "failed").slice(0, 200) }).catch(() => undefined);
            throw e;
          }
        })(),
      );
      return;
    }
    ctx.waitUntil(
      (async () => {
        const { ctx: c, tags } = await buildCtx(env, new Request("https://cron.internal/"), { trusted: false });
        // Workers Free allows 50 outgoing requests per run. Kept aside: the usage check (1), up to
        // two revalidation pings and a spare; the rest is shared by this run's emails, most
        // urgent first (immediate notices, then digests).
        c.fetchBudget = { left: 45 };
        let report;
        try {
          report = await runMaintenance(c);
          // Pages whose data just changed (e.g. an event that started) refresh now, even if a
          // later step of this run fails.
          if (tags.size) {
            await pingRevalidate(env, tags).catch((e) => console.error("revalidate ping failed", e));
            tags.clear();
          }
          report = { ...report, approvalReminders: await remindStaleApprovals(c).catch((e) => { console.error("approval reminders failed", e); return 0; }) };
          // Free-tier guard: warn Moderators, and pause uploads near R2's free limits.
          let guardFailed = false;
          const guard = await guardFreeTier(c).catch((e) => {
            guardFailed = true;
            console.error("free-tier guard failed", e);
            return { paused: false, alerts: [`guard failed: ${e instanceof Error ? e.message : "error"}`] };
          });
          const seal = await sealAuditLog(c);
          // The digest also goes to the Worker log, outside the database it protects.
          if (seal.digest) console.log("audit-seal", JSON.stringify(seal));
          // A guard that didn't run means uploads wouldn't pause near the free limit: System health shows the run as failed.
          await recordHeartbeat(c, "maintenance", !guardFailed, { ...report, auditSealed: seal.sealed, guard, ...(guardFailed ? { error: "The free-tier guard failed; see the Worker log." } : {}) });
          await flushOutbox(c);
          // One email per person for what's still unread (roles, tasks, events, messages).
          report = { ...report, digests: await sendDigests(c) };
          // Then announcement emails, with what's left of this run's requests and the hour's emails.
          report = { ...report, campaigns: await runCampaignTick(c) };
          // Reminders and other notices written by this run reach open tabs at once.
          if (c.live?.length) await emitLive(env, c.live.splice(0));
        } catch (e) {
          // Only the error's message is kept: no request data or secrets.
          await recordHeartbeat(c, "maintenance", false, { error: (e instanceof Error ? e.message : "failed").slice(0, 200) }).catch(() => undefined);
          throw e;
        }
        console.log("maintenance", JSON.stringify(report));
        // Tell the frontend to refresh pages whose data the cron changed (e.g. event status).
        if (tags.size) await pingRevalidate(env, tags);
      })(),
    );
  },
} satisfies ExportedHandler<Env>;
