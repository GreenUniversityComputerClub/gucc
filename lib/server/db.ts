/**
 * Typed helpers over a D1 database.
 *
 * Every query goes through prepare().bind(): values are never interpolated
 * into SQL. The interface is the subset of D1Database we use, so tests can
 * supply an in-memory SQLite shim with the same behaviour.
 */

export interface D1Like {
  prepare(sql: string): D1StatementLike;
  batch<T = unknown>(statements: D1StatementLike[]): Promise<Array<{ results?: T[]; meta?: { changes?: number } }>>;
}

export interface D1StatementLike {
  bind(...values: unknown[]): D1StatementLike;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<{ meta: { changes?: number; last_row_id?: number } }>;
}

export type Param = string | number | null | boolean | undefined;

const clean = (params: Param[]) => params.map((p) => (p === undefined ? null : typeof p === "boolean" ? (p ? 1 : 0) : p));

export class Db {
  /**
   * D1 statements run through this instance (each statement in a batch counts). The free plan
   * allows 50 per Worker invocation, so request paths are written to stay well below that.
   */
  queries = 0;

  constructor(readonly raw: D1Like) {}

  stmt(sql: string, ...params: Param[]): D1StatementLike {
    return this.raw.prepare(sql).bind(...clean(params));
  }

  async all<T = Record<string, unknown>>(sql: string, ...params: Param[]): Promise<T[]> {
    this.queries++;
    const res = await this.stmt(sql, ...params).all<T>();
    return res.results ?? [];
  }

  async first<T = Record<string, unknown>>(sql: string, ...params: Param[]): Promise<T | null> {
    this.queries++;
    return (await this.stmt(sql, ...params).first<T>()) ?? null;
  }

  async value<T = number>(sql: string, ...params: Param[]): Promise<T | null> {
    const row = await this.first<Record<string, T>>(sql, ...params);
    if (!row) return null;
    const key = Object.keys(row)[0];
    return key ? row[key] : null;
  }

  async run(sql: string, ...params: Param[]): Promise<number> {
    this.queries++;
    const res = await this.stmt(sql, ...params).run();
    return res.meta?.changes ?? 0;
  }

  /** Several reads in one round trip; returns each statement's rows. */
  async batchAll(statements: D1StatementLike[]): Promise<Array<{ results?: unknown[] }>> {
    this.queries += statements.length;
    return this.raw.batch(statements);
  }

  /** Atomic: D1 runs a batch as one transaction. */
  async batch(statements: D1StatementLike[]): Promise<void> {
    if (statements.length === 0) return;
    this.queries += statements.length;
    await this.raw.batch(statements);
  }
}

export const nowIso = () => new Date().toISOString();

export function newId(prefix?: string): string {
  const id = crypto.randomUUID();
  return prefix ? `${prefix}_${id}` : id;
}

/** Build "a = ?, b = ?" assignments from a patch object, skipping undefined. */
export function assignments(patch: Record<string, Param>, allowed: readonly string[]): { sql: string; params: Param[] } {
  const cols = Object.keys(patch).filter((k) => patch[k] !== undefined && allowed.includes(k));
  for (const c of cols) if (!/^[a-z_]+$/.test(c)) throw new Error(`Unsafe column ${c}`);
  return { sql: cols.map((c) => `${c} = ?`).join(", "), params: cols.map((c) => patch[c]) };
}
