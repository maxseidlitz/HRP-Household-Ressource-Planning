import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Eigenständiger Server-Build für das Docker-Image (siehe Dockerfile).
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
  experimental: {
    // Feedback-Screenshots bis 5 MB plus Formular-Overhead (Spez. 9.2)
    serverActions: { bodySizeLimit: "6mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
