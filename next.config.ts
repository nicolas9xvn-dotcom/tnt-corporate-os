import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Default 1MB is too small for image attachments on "Giao việc".
    serverActions: { bodySizeLimit: "8mb" },
  },
};

export default nextConfig;
