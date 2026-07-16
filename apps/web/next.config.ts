import type { NextConfig } from "next";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  turbopack: { root: resolve(projectRoot, "../..") },
  async rewrites() {
    const gameServer =
      process.env.GAME_SERVER_URL ??
      process.env.NEXT_PUBLIC_GAME_SERVER_URL ??
      "http://127.0.0.1:3001";
    return [
      {
        source: "/api/game/:path*",
        destination: `${gameServer}/:path*`,
      },
    ];
  },
};

export default nextConfig;
