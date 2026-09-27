/**
 * Atomic budgets. A reservation is one conditional upsert on usage_counters: D1 runs statements
 * one at a time per database, so two concurrent requests can never both take the last unit.
 * Used for everything that could cost money past a free tier (R2 writes and storage) or that a
 * provider limits per day (AI answers, emails).
 */
import type { Ctx } from "./context";
import { nowIso } from "./db";

/** The UTC day (Cloudflare's and Resend's daily limits reset at 00:00 UTC). */
export const utcDay = (d = new Date()) => d.toISOString().slice(0, 10);

/**
 * Take `n` units of `key` for `day` if that keeps the total at or under `limit`.
 * Returns false (and changes nothing) when it wouldn't.
 */
export async function reserve(ctx: Ctx, key: string, n: number, limit: number, day = utcDay()): Promise<boolean> {
  if (n <= 0) return true;
  const row = await ctx.db.first<{ count: number }>(
    `INSERT INTO usage_counters (day, key, count, updated_at) SELECT ?1, ?2, ?3, ?5 WHERE ?3 <= ?4
     ON CONFLICT(day, key) DO UPDATE SET count = usage_counters.count + excluded.count, updated_at = excluded.updated_at
       WHERE usage_counters.count + excluded.count <= ?4
     RETURNING count`,
    day, key, n, limit, nowIso());
  return row !== null;
}

/** Give back units taken for an action that then failed. Never goes below zero. */
export async function release(ctx: Ctx, key: string, n: number, day = utcDay()): Promise<void> {
  if (n <= 0) return;
  await ctx.db.run("UPDATE usage_counters SET count = MAX(0, count - ?3), updated_at = ?4 WHERE day = ?1 AND key = ?2", day, key, n, nowIso());
}

export async function usageOf(ctx: Ctx, keys: string[], day = utcDay()): Promise<Record<string, number>> {
  const rows = await ctx.db.all<{ key: string; count: number }>(
    "SELECT key, count FROM usage_counters WHERE day = ?1 AND key IN (SELECT value FROM json_each(?2))", day, JSON.stringify(keys));
  return Object.fromEntries(keys.map((k) => [k, rows.find((r) => r.key === k)?.count ?? 0]));
}

/** Bytes kept in R2 by every stored file (deleted ones too until their objects are gone): conservative. */
export const STORED_BYTES_SQL = `SELECT COALESCE(SUM(json_extract(v.value, '$.size')), 0) FROM media m, json_each(COALESCE(m.variants_json, '{}')) v
  WHERE m.storage = 'R2' AND m.purged_at IS NULL`;

/** Running total of stored bytes, created from the files themselves the first time it's needed. */
export async function ensureStoredBytes(ctx: Ctx): Promise<number> {
  const row = await ctx.db.first<{ count: number }>("SELECT count FROM usage_counters WHERE day = 'total' AND key = 'r2.stored_bytes'");
  if (row) return row.count;
  const total = (await ctx.db.value<number>(STORED_BYTES_SQL)) ?? 0;
  await ctx.db.run("INSERT INTO usage_counters (day, key, count, updated_at) VALUES ('total', 'r2.stored_bytes', ?1, ?2) ON CONFLICT(day, key) DO NOTHING", total, nowIso());
  return total;
}

/** Recount stored bytes from the files (hourly), correcting any drift from deletions. */
export async function reconcileStoredBytes(ctx: Ctx): Promise<number> {
  const total = (await ctx.db.value<number>(STORED_BYTES_SQL)) ?? 0;
  await ctx.db.run(
    `INSERT INTO usage_counters (day, key, count, updated_at) VALUES ('total', 'r2.stored_bytes', ?1, ?2)
     ON CONFLICT(day, key) DO UPDATE SET count = excluded.count, updated_at = excluded.updated_at`, total, nowIso());
  return total;
}
