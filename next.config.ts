import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Basic hardening: no framing by other sites (clickjacking on the approve button), no MIME sniffing,
  // and no full URLs leaked to other origins.
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      ],
    }];
  },
};

export default nextConfig;
