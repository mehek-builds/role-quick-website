import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.trylitos.com" }],
        destination: "https://trylitos.com/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
