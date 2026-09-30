// Copies MediaPipe's WebAssembly runtime (used for profile-photo background removal) from
// node_modules into public/mediapipe, so the site serves it itself: no third-party CDN, and the
// Content Security Policy stays 'self'. Runs after install and before builds; quick when current.
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";

const from = join("node_modules", "@mediapipe", "tasks-vision", "wasm");
const to = join("public", "mediapipe");
const files = ["vision_wasm_internal.js", "vision_wasm_internal.wasm", "vision_wasm_nosimd_internal.js", "vision_wasm_nosimd_internal.wasm"];

if (!existsSync(from)) {
  console.warn("copy-mediapipe: @mediapipe/tasks-vision isn't installed; background removal will be unavailable.");
  process.exit(0);
}
mkdirSync(to, { recursive: true });
let copied = 0;
for (const f of files) {
  const src = join(from, f);
  const dst = join(to, f);
  if (existsSync(dst) && statSync(dst).size === statSync(src).size) continue;
  copyFileSync(src, dst);
  copied++;
}
console.log(`copy-mediapipe: ${copied ? `copied ${copied} file(s)` : "up to date"} in ${to}`);
