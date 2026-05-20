import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["siwe"],
  transpilePackages: [
    "@walletconnect",
    "@reown",
    "@coinbase",
    "@base-org",
    "@metamask",
    "uint8arrays",
    "multiformats",
    "unstorage",
    "pino",
    "pino-pretty",
  ],
  webpack: (config, { isServer }) => {
    // Ensure browser builds can handle all imports properly
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        net: false,
        tls: false,
        http: false,
        https: false,
        zlib: false,
        stream: false,
        crypto: false,
        buffer: false,
        util: false,
        os: false,
        "node:*": false,
        // MetaMask SDK optionally imports React Native storage — not needed in browser builds
        "@react-native-async-storage/async-storage": false,
      };
    }
    return config;
  },
};

export default nextConfig;
