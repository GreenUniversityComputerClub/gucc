/**
 * Race-free state changes.
 *
 * Two leaders pressing "Approve" at the same moment both read "pending". D1 runs batches one at a
 * time, so only the first batch's guarded UPDATE changes the row, and that UPDATE stamps the row
 * with its request's token (last_transition). The statement after it asserts the stamp. In the
 * second batch the assertion fails, which aborts that whole batch (a D1 batch is one
 * transaction): no second audit entry, role, notification or email. The service then says who got
 * there first.
 *
 * The assertion is an insert into batch_assertions, a table that refuses every row.
 */
import type { Ctx } from "./context";
import type { D1StatementLike, Param } from "./db";
import { AppError } from "./errors";

export type TransitionTable = "users" | "approval_requests" | "posts" | "events";

export const newTransition = () => `tr_${crypto.randomUUID()}`;

/** Aborts the batch unless the row carries this token, i.e. the guarded update before it applied. */
export function assertTransition(ctx: Ctx, table: TransitionTable, id: string, token: string): D1StatementLike {
  return ctx.db.stmt(`INSERT INTO batch_assertions (failed) SELECT ?3 WHERE NOT EXISTS (SELECT 1 FROM ${table} WHERE id = ?1 AND last_transition = ?2)`, id, token, `${table}:${id}`);
}

/** Aborts the batch unless `condition` (an SQL boolean expression) holds when this statement runs. */
export function assertStmt(ctx: Ctx, condition: string, ...params: Param[]): D1StatementLike {
  return ctx.db.stmt(`INSERT INTO batch_assertions (failed) SELECT 'assertion' WHERE NOT (${condition})`, ...params);
}

export const isAssertionFailure = (e: unknown): boolean => /transition_lost/.test(e instanceof Error ? e.message : String(e));

/** Run the batch; when an assertion aborted it (someone else was first), throw `lost()` instead. */
export async function batchTransition(ctx: Ctx, stmts: D1StatementLike[], lost: () => Promise<AppError> | AppError): Promise<void> {
  try {
    await ctx.db.batch(stmts);
  } catch (e) {
    if (isAssertionFailure(e)) throw await lost();
    throw e;
  }
}

/** "Already approved by Rafi": who last changed the row, for the answer to the slower request. */
export async function alreadyDone(ctx: Ctx, table: "users" | "posts" | "events", id: string, what: string): Promise<AppError> {
  const row = await ctx.db.first<{ status: string; name: string | null }>(
    `SELECT t.status, COALESCE(p.full_name, u.email) AS name FROM ${table} t
       LEFT JOIN users u ON u.id = t.updated_by LEFT JOIN profiles p ON p.user_id = u.id AND p.deleted_at IS NULL
     WHERE t.id = ?1`, id);
  const status = row?.status ? row.status.replace(/_/g, " ").toLowerCase() : "changed";
  return new AppError(409, "ALREADY_DONE", `${what} was just ${status === "active" ? "approved" : status}${row?.name ? ` by ${row.name}` : ""}. Reload to see it.`);
}

/** Tables whose edit forms send back the `updated_at` they loaded (optimistic locking). */
export type StampedTable = "posts" | "events" | "profiles" | "positions" | "roles" | "rules" | "committees" | "committee_members" | "system_settings" | "organization_settings" | "tasks" | "meetings";
const KEY_COLUMN: Partial<Record<StampedTable, string>> = { system_settings: "key", organization_settings: "key" };

function staleError(row: { updated_at: string; name: string | null }): AppError {
  const when = new Date(row.updated_at).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short" });
  return new AppError(409, "STALE", `This was changed at ${when}${row.name ? ` (last saved by ${row.name})` : " (automatically, e.g. an event that started)"} after you opened it. Reload the page to see the change, then make yours again.`);
}

/**
 * Optimistic locking. Edit forms send the `updated_at` they were loaded with. If the row changed
 * since, nothing is saved and the person is told who changed it and when. Returns a guard
 * statement to put first in the batch (run it with batchTransition): it catches a change that
 * lands between this check and the save. Forms that don't send a stamp (older pages, API
 * callers) aren't checked.
 */
export async function unchangedSince(ctx: Ctx, table: StampedTable, id: string, expected: unknown): Promise<D1StatementLike[]> {
  if (typeof expected !== "string" || !expected) return [];
  const col = KEY_COLUMN[table] ?? "id";
  const row = await ctx.db.first<{ updated_at: string; name: string | null }>(
    `SELECT t.updated_at, COALESCE(p.full_name, u.email) AS name FROM ${table} t
       LEFT JOIN users u ON u.id = t.updated_by LEFT JOIN profiles p ON p.user_id = u.id AND p.deleted_at IS NULL
     WHERE t.${col} = ?1`, id);
  if (row && row.updated_at !== expected) throw staleError(row);
  return [assertStmt(ctx, `EXISTS (SELECT 1 FROM ${table} WHERE ${col} = ?1 AND updated_at = ?2)`, id, expected)];
}

/** The answer when the guard from unchangedSince aborted a batch. */
export async function staleAnswer(ctx: Ctx, table: StampedTable, id: string): Promise<AppError> {
  const col = KEY_COLUMN[table] ?? "id";
  const row = await ctx.db.first<{ updated_at: string; name: string | null }>(
    `SELECT t.updated_at, COALESCE(p.full_name, u.email) AS name FROM ${table} t
       LEFT JOIN users u ON u.id = t.updated_by LEFT JOIN profiles p ON p.user_id = u.id AND p.deleted_at IS NULL
     WHERE t.${col} = ?1`, id);
  return row ? staleError(row) : new AppError(409, "STALE", "This changed after you opened it. Reload the page, then make your change again.");
}
