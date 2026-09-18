import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the floating dev-mode route indicator: it's meaningless to a
  // non-technical learner and easy to mistake for a bug. Real compile/runtime
  // errors are still surfaced regardless of this setting.
  devIndicators: false,
};

export default nextConfig;
