/**
 * Minimal SQL literal rendering for generated seed/import files.
 *
 * Generated files are executed by `wrangler d1 execute --file`, which has no
 * parameter binding, so values are escaped here. Only this module builds SQL
 * from data; application code always uses prepared statements with bind().
 */

export type SqlValue = string | number | boolean | null | undefined | Record<string, unknown> | unknown[];

export function sqlValue(v: SqlValue): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "boolean") return v ? "1" : "0";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "NULL";
    return String(v);
  }
  if (typeof v === "object") return quote(JSON.stringify(v));
  return quote(v);
}

function quote(s: string): string {
  // SQLite string literal: single quotes doubled. NUL bytes are not valid in TEXT.
  return `'${s.replace(/\u0000/g, "").replace(/'/g, "''")}'`;
}

export function ident(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) throw new Error(`Unsafe identifier: ${name}`);
  return name;
}

export interface InsertOptions {
  /** Columns forming the conflict target. Defaults to ["id"]. */
  conflict?: string[];
  /**
   * "nothing": leave existing rows untouched (safe default for re-runs).
   * "refresh": update existing rows, but only those no human has edited
   *            (updated_by IS NULL), so admin changes are never overwritten.
   * "update":  always update (join tables without human edits).
   */
  mode?: "nothing" | "refresh" | "update";
  /** Columns not to overwrite on refresh/update (e.g. created_at). */
  preserve?: string[];
}

export function insertSql(table: string, row: Record<string, SqlValue>, opts: InsertOptions = {}): string {
  const cols = Object.keys(row).filter((k) => row[k] !== undefined);
  const conflict = opts.conflict ?? ["id"];
  const values = cols.map((c) => sqlValue(row[c]));
  let sql = `INSERT INTO ${ident(table)} (${cols.map(ident).join(", ")}) VALUES (${values.join(", ")})`;
  const mode = opts.mode ?? "nothing";
  const preserve = new Set(["id", "created_at", ...(opts.preserve ?? []), ...conflict]);
  const updatable = cols.filter((c) => !preserve.has(c));
  if (mode === "nothing" || updatable.length === 0) {
    sql += ` ON CONFLICT(${conflict.map(ident).join(", ")}) DO NOTHING`;
  } else {
    const sets = updatable.map((c) => `${ident(c)} = excluded.${ident(c)}`).join(", ");
    sql += ` ON CONFLICT(${conflict.map(ident).join(", ")}) DO UPDATE SET ${sets}`;
    if (mode === "refresh") sql += ` WHERE ${ident(table)}.updated_by IS NULL`;
  }
  return `${sql};`;
}
