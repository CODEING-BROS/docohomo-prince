import type { NextConfig } from "next";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

// `next start` serves the folder `next build` wrote (.next). So that a second build can run, or `next dev`,
// while a built copy is being used on port 3000, those write somewhere else:
//   npm run build:new, npm run start:new   build and serve a second copy from .next-new on port 3001 (to compare)
//   npm run dev                            always works in .next-dev
const distDir = process.env.NEXT_DIST_DIR ?? (process.env.NODE_ENV === "development" ? ".next-dev" : ".next");

const nextConfig: NextConfig = {
  distDir,
  // The browser only ever talks to this app; /api/* is passed on to the backend.
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${API_URL}/api/:path*` },
      { source: "/uploads/:path*", destination: `${API_URL}/uploads/:path*` },
    ];
  },
};

export default nextConfig;
