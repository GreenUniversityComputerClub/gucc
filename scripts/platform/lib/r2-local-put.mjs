#!/usr/bin/env node
/**
 * Writes files into the LOCAL R2 bucket (Miniflare state in .wrangler/state)
 * through wrangler's getPlatformProxy. Runs under Node because Bun cannot host
 * workerd. Input: a JSON manifest [{ key, file, type, cacheControl }].
 * Legacy media are public, so they go to the MEDIA_PUBLIC binding.
 */
import { readFileSync } from "node:fs";
import { getPlatformProxy } from "wrangler";

const manifest = JSON.parse(readFileSync(process.argv[2], "utf8"));
// Same state directory as `wrangler --persist-to $GUCC_LOCAL_STATE` (Wrangler appends v3).
const proxy = await getPlatformProxy({ persist: process.env.GUCC_LOCAL_STATE ? { path: `${process.env.GUCC_LOCAL_STATE}/v3` } : true });
let n = 0;
for (const item of manifest) {
  await (proxy.env.MEDIA_PUBLIC ?? proxy.env.MEDIA).put(item.key, readFileSync(item.file), { httpMetadata: { contentType: item.type, cacheControl: item.cacheControl } });
  n++;
}
await proxy.dispose();
console.log(`local R2: wrote ${n} objects`);
