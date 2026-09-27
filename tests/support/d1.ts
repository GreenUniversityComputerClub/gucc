/**
 * In-memory D1 stand-in on node:sqlite, with the real migrations applied.
 * Same SQL dialect (SQLite), same foreign-key enforcement, same triggers — so
 * services are tested against the schema that ships.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { D1Like, D1StatementLike } from "@/lib/server/db";
import { Db } from "@/lib/server/db";
import type { Ctx, BucketLike } from "@/lib/server/context";
import { loadActor } from "@/lib/server/authz";

class Stmt implements D1StatementLike {
  constructor(private readonly sqlite: DatabaseSync, readonly sql: string, private readonly params: unknown[] = []) {}
  bind(...values: unknown[]) {
    return new Stmt(this.sqlite, this.sql, values);
  }
  private prep() {
    return this.sqlite.prepare(this.sql);
  }
  async all<T>() {
    return { results: this.prep().all(...(this.params as never[])) as T[] };
  }
  async first<T>() {
    return (this.prep().get(...(this.params as never[])) as T) ?? null;
  }
  async run() {
    const r = this.prep().run(...(this.params as never[]));
    return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
  execSync() {
    return { results: this.prep().all(...(this.params as never[])) };
  }
}

export function createTestDb(): { db: Db; sqlite: DatabaseSync } {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  const dir = path.join(process.cwd(), "migrations");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) sqlite.exec(readFileSync(path.join(dir, f), "utf8"));
  const raw: D1Like = {
    prepare: (sql: string) => new Stmt(sqlite, sql),
    async batch<T>(statements: D1StatementLike[]) {
      sqlite.exec("BEGIN");
      try {
        const out = statements.map((s) => (s as Stmt).execSync());
        sqlite.exec("COMMIT");
        return out as Array<{ results?: T[] }>;
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    },
  };
  return { db: new Db(raw), sqlite };
}

export function memoryBucket(): BucketLike & { objects: Map<string, { data: Uint8Array; type?: string }> } {
  const objects = new Map<string, { data: Uint8Array; type?: string }>();
  return {
    objects,
    async put(key, value, options) {
      const data = typeof value === "string" ? new TextEncoder().encode(value) : value instanceof Uint8Array ? value : new Uint8Array(value as ArrayBuffer);
      objects.set(key, { data, type: options?.httpMetadata?.contentType });
      return {};
    },
    async get(key) {
      const o = objects.get(key);
      if (!o) return null;
      return { body: new Blob([o.data as BlobPart]).stream(), httpMetadata: { contentType: o.type }, size: o.data.length };
    },
    async delete(key) {
      for (const k of Array.isArray(key) ? key : [key]) objects.delete(k);
    },
    async head(key) {
      const o = objects.get(key);
      return o ? { size: o.data.length } : null;
    },
  };
}

export interface TestWorld {
  db: Db;
  sqlite: DatabaseSync;
  emails: Array<{ to: string; subject: string; text: string }>;
  /** Public bucket (legacy name kept for existing tests). */
  bucket: ReturnType<typeof memoryBucket>;
  privateBucket: ReturnType<typeof memoryBucket>;
  ctx(userId?: string | null, meta?: Partial<Ctx["meta"]>): Promise<Ctx>;
  /** Create an ACTIVE user with optional roles and current-committee positions. */
  user(opts: { email: string; roles?: string[]; positions?: string[]; status?: string; name?: string }): Promise<string>;
  committeeId: string;
}

let counter = 0;

export async function createWorld(): Promise<TestWorld> {
  const { db, sqlite } = createTestDb();
  const emails: TestWorld["emails"] = [];
  const bucket = memoryBucket();
  const privateBucket = memoryBucket();
  const committeeId = "cmt_current";
  sqlite.exec(`INSERT INTO committees (id, slug, name, term_label, status) VALUES ('${committeeId}', '2026', 'GUCC 2026', '2026', 'CURRENT')`);

  const world: TestWorld = {
    db, sqlite, emails, bucket, privateBucket, committeeId,
    async ctx(userId, meta) {
      counter++;
      return {
        db,
        env: { APP_ENV: "test", PUBLIC_BASE_URL: "http://test.local", AUTH_SECRET: "test-auth-secret-0123456789abcdef", PASSWORD_PEPPER: "test-pepper-0123456789" },
        meta: { requestId: `req_${counter}`, ipHash: "iphash", userAgent: "vitest", origin: "http://test.local", ...meta },
        actor: userId ? await loadActor(db, userId) : null,
        media: { public: bucket, private: privateBucket },
        sendEmail: async (m) => void emails.push(m),
      };
    },
    async user({ email, roles = [], positions = [], status = "ACTIVE", name }) {
      counter++;
      const id = `usr_${counter}`;
      const profile = `prf_${counter}`;
      sqlite.prepare("INSERT INTO users (id, email, status, email_verified_at) VALUES (?, ?, ?, '2026-01-01')").run(id, email, status);
      sqlite.prepare("INSERT INTO profiles (id, user_id, full_name) VALUES (?, ?, ?)").run(profile, id, name ?? email.split("@")[0]);
      for (const r of roles) sqlite.prepare("INSERT INTO user_roles (id, user_id, role_id) VALUES (?, ?, ?)").run(`ur_${counter}_${r}`, id, `role:${r}`);
      positions.forEach((p, i) =>
        sqlite.prepare("INSERT INTO committee_members (id, committee_id, profile_id, position_id, position_title, section, display_order, is_active) VALUES (?, ?, ?, ?, ?, 'STUDENT', ?, 1)")
          .run(`cm_${counter}_${i}`, committeeId, profile, `pos:${p}`, p, i),
      );
      return id;
    },
  };
  return world;
}
