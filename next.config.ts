import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "500mb",
    },
    // Cache visited/prefetched route RSC payloads client-side so switching
    // between tabs reuses them instead of a fresh ~1.3s server round-trip.
    staleTimes: {
      dynamic: 60,
      static: 300,
    },
  },
};

export default nextConfig;
