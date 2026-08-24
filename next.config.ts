import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for Railway: bundles a minimal server + only the deps that are
  // actually used into .next/standalone, instead of shipping node_modules.
  output: "standalone",

  eslint: {
    // We run lint as its own CI/local step; don't let it block `next build`.
    ignoreDuringBuilds: true,
  },

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
};

export default nextConfig;
