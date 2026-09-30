import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
/** The API Worker (all backend logic) and where /media/* is served from. */
const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8787").replace(/\/+$/, "");
const MEDIA_BASE = (process.env.NEXT_PUBLIC_MEDIA_BASE_URL || API_BASE).replace(/\/+$/, "");
const origin = (u: string) => {
  try {
    return new URL(u).origin;
  } catch {
    return "";
  }
};

/**
 * Content Security Policy for production builds. Scripts are limited to this site and
 * Cloudflare Turnstile ('unsafe-inline' stays because Next.js inlines its bootstrap scripts and
 * pages are statically cached, so per-request nonces aren't possible). Browsers may talk only to
 * this site and the API Worker (uploads), and frame only Google Forms and Turnstile. Plugins,
 * <base> changes and cross-site form posts are blocked. Images may come from any https host
 * (older posts link images from many places). Development keeps no CSP for hot reload.
 */
const CSP = [
  "default-src 'self'",
  // 'wasm-unsafe-eval': compiling WebAssembly (the in-browser photo background remover); it allows
  // no string eval of JavaScript.
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  // The media origin by name too: it is plain http on local and test builds.
  `img-src 'self' data: blob: https: ${origin(MEDIA_BASE)}`.trim(),
  `media-src 'self' blob: https: ${origin(MEDIA_BASE)}`.trim(),
  // The API's ws(s):// origin too: dashboard tabs keep one live connection to it.
  `connect-src 'self' ${[...new Set([origin(API_BASE), origin(MEDIA_BASE), origin(API_BASE).replace(/^http/, "ws")].filter(Boolean))].join(" ")} https://challenges.cloudflare.com`,
  "frame-src 'self' https://docs.google.com https://forms.gle https://challenges.cloudflare.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  // Only on an https site: on plain-http local builds it would rewrite requests to https.
  ...((process.env.NEXT_PUBLIC_BASE_URL ?? "").startsWith("https://") ? ["upgrade-insecure-requests"] : []),
].join("; ");

const nextConfig: NextConfig = {
  // The end-to-end suite builds into its own folder so it never disturbs the dev build.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  turbopack: {
    root: projectRoot,
  },
  allowedDevOrigins: ["192.168.0.198"],
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    // Files go straight from the browser to the API Worker, so actions stay small.
    serverActions: {
      bodySizeLimit: "1mb",
    },
  },
  /*
   * Keep static assets out of every serverless function bundle.
   *
   * `public/` is uploaded to Vercel's static layer, not into functions, and
   * pages reference these images by string path, so nothing traces them today
   * (verified: /collaborations traces 0 public assets, largest function 5.5 MB).
   * This keeps it that way — a future `import logo from "../../public/…"` would
   * otherwise pull binaries into every function that touches it and eat into
   * the 250 MB limit.
   */
  outputFileTracingExcludes: {
    "*": ["public/**/*", "./public/**/*"],
  },
  images: {
    // R2 media are served in pre-built variants; see lib/media/image-loader.ts.
    loader: "custom",
    loaderFile: "./lib/media/image-loader.ts",
    // Executive portraits and event covers are large PNG/JPEGs; AVIF/WebP cut
    // them enough to matter for Largest Contentful Paint, which feeds ranking.
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 30,
    remotePatterns: [
      {
        hostname: "avatars.githubusercontent.com",
      },
      {
        hostname: "github.com",
      },
    ],
  },
  // Any /media/… path that reaches the site (e.g. images inside post bodies)
  // is served by the API Worker / R2.
  async rewrites() {
    return [{ source: "/media/:path*", destination: `${MEDIA_BASE}/media/:path*` }];
  },
  // Performance optimizations
  compress: true,
  poweredByHeader: false,
  reactStrictMode: true,
  // The admin area became the dashboard for everyone (members included); old links,
  // bookmarks and notification links keep working.
  async redirects() {
    return [
      { source: "/admin", destination: "/dashboard", permanent: true },
      { source: "/admin/:path*", destination: "/dashboard/:path*", permanent: true },
      { source: "/account", destination: "/dashboard/profile", permanent: true },
      // The course-routine maker was retired; old links land on the home page.
      { source: "/scheduler", destination: "/", permanent: true },
      { source: "/scheduler/:path*", destination: "/", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // The camera for this site only (QR check-in at events); nothing else, and never for embeds.
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          // Pages this site opens elsewhere can't reach back into it through window.opener.
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          // Which commit is live (public repository): the deploy workflow checks it after each release.
          { key: "X-Gucc-Build", value: process.env.GUCC_BUILD_ID || "local" },
          ...(process.env.NODE_ENV === "production" && process.env.DISABLE_CSP !== "1" ? [{ key: "Content-Security-Policy", value: CSP }] : []),
        ],
      },
      {
        // Signed-in areas: never framed, never cached by shared caches.
        source: "/:area(dashboard|admin|account|auth)/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          ...(process.env.NODE_ENV === "production" && process.env.DISABLE_CSP !== "1"
            ? [{ key: "Content-Security-Policy", value: CSP.replace("frame-ancestors 'self'", "frame-ancestors 'none'") }]
            : [{ key: "Content-Security-Policy", value: "frame-ancestors 'none'" }]),
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
      {
        // The photo background remover's runtime and model: large, fetched once, then from cache.
        source: "/:dir(mediapipe|models)/:file*",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=2592000" }],
      },
      {
        // Deploy-time images in public/: cached hard, revalidated in the background.
        // Images only — pages such as /executives/2026 must follow ISR revalidation.
        source: "/:dir(executives|events|sponsors|collaborators|blog|contests|certificates)/:file(.+\\.(?:jpg|jpeg|png|webp|avif|gif|svg))",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
