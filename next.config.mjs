/** @type {import('next').NextConfig} */
const nextConfig = {
    images: {
        remotePatterns: [
            {
                hostname: "hebbkx1anhila5yf.public.blob.vercel-storage.com",
            },
        ],
    },
};

export default nextConfig;
