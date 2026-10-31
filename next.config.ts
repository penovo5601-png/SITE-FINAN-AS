import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp"],
  experimental: {
    serverActions: { bodySizeLimit: "14mb" },
  },
};

export default nextConfig;
