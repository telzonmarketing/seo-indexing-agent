import type { NextConfig } from "next";

// In Docker production Nginx handles /api/* routing — Next.js should NOT rewrite
// those requests (they'd hit localhost:8000 inside the frontend container, not the
// api service). NEXT_INTERNAL_API_URL is the Docker-internal address used for SSR.
const internalApiUrl =
  process.env.NEXT_INTERNAL_API_URL ||   // Docker: http://api:8000
  process.env.NEXT_PUBLIC_API_URL ||     // explicit override
  "http://localhost:8000";               // local dev fallback

const nextConfig: NextConfig = {
  // Required for the multi-stage Dockerfile (COPY .next/standalone)
  output: "standalone",

  async rewrites() {
    // In production the env var DISABLE_REWRITES=1 is set so Nginx handles /api/*
    if (process.env.DISABLE_REWRITES === "1") return [];
    return [
      {
        source: "/api/:path*",
        destination: `${internalApiUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
