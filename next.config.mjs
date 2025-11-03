/** @type {import('next').NextConfig} */
const nextConfig = {
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
    ],
  },
  // Performance optimizations
  compress: true,
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
