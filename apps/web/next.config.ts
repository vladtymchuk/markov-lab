import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  agentRules: false,
  devIndicators: false,
  turbopack: { root: new URL("../..", import.meta.url).pathname },
  async rewrites() {
    const origin = process.env.API_ORIGIN ?? "http://127.0.0.1:8000";
    return [
      { source: "/lab-api/:path*", destination: `${origin}/api/v1/:path*` },
    ];
  },
};
export default config;
