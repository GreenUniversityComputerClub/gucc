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
  images: {
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
};

export default nextConfig;
