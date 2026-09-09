import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
  allowedDevOrigins: ["192.168.0.198"],
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    viewTransition: true,
    serverActions: {
      bodySizeLimit: "50mb",
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
    // Executive portraits and event covers are large PNG/JPEGs; AVIF/WebP cut
    // them enough to matter for Largest Contentful Paint, which feeds ranking.
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 30,
    remotePatterns: [
      {
        hostname: "hebbkx1anhila5yf.public.blob.vercel-storage.com",
      },
      {
        hostname: "avatars.githubusercontent.com",
      },
      {
        hostname: "github.com",
      },
    ],
  },
  // Performance optimizations
  compress: true,
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        // Deploy-time assets: cached hard, revalidated in the background.
        source: "/:dir(executives|events|sponsors|collaborators|blog)/:file*",
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
