/**
 * Minimal shapes for the Cloudflare binding types named in cloudflare-env.d.ts.
 *
 * Wrangler's full runtime types redeclare global fetch/Request/Response for
 * the Workers runtime, which conflicts with the DOM types that client
 * components need, so the env file is generated with --include-runtime=false
 * and the few binding types it references are declared here. Application code
 * talks to bindings through lib/server/db.ts (D1Like) and BucketLike, which
 * are fully typed.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
interface D1Database {
  prepare(query: string): any;
  batch(statements: any[]): Promise<any[]>;
  exec(query: string): Promise<any>;
}
interface R2Bucket {
  get(key: string): Promise<any>;
  put(key: string, value: any, options?: any): Promise<any>;
  delete(keys: string | string[]): Promise<void>;
  head(key: string): Promise<any>;
  list(options?: any): Promise<any>;
}
interface Fetcher {
  fetch(input: any, init?: any): Promise<any>;
}
interface ImagesBinding {
  input(stream: any): any;
}
