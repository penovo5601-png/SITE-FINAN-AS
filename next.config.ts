import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp"],
  outputFileTracingIncludes: {
    "/*": ["./public/data/universe.tsv.gz", "./site.config.json"],
  },
  experimental: {
    serverActions: { bodySizeLimit: "14mb" },
  },
};

export default nextConfig;
