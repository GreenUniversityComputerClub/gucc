import type { NextConfig } from "next";

const nextConfig: NextConfig = {

  experimental: {
    viewTransition: true,
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
