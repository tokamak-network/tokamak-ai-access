import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel KV / Upstash requires Node.js runtime for API routes
  experimental: {
    serverComponentsExternalPackages: ["siwe"],
  },
};

export default nextConfig;
