import type { NextConfig } from "next";

// Fully static export: no server, no API routes, nothing stored. All math runs in the browser.
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
