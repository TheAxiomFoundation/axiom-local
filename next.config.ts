import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The whole app is a static export: every byte is served as-is and the
  // calculation runs in the visitor's browser. There is no server component
  // to this product — that is the point.
  output: "export",
};

export default nextConfig;
