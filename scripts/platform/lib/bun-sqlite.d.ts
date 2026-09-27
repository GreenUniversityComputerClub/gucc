/** The part of Bun's built-in SQLite the platform scripts use (the root tsconfig has no Bun types). */
declare module "bun:sqlite" {
  export class Database {
    constructor(filename?: string);
    exec(sql: string): void;
    query<T = unknown, P extends unknown[] = []>(sql: string): { all(...params: P): T[]; get(...params: P): T | null };
    close(): void;
  }
}
