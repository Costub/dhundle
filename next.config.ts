import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow parallel builds (CI/verification) without clobbering a running dev
  // server's .next directory: NEXT_DIST_DIR=.next-verify npm run build
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
