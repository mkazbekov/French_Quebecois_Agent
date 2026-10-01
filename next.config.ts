import { readFileSync } from "node:fs";
import type { NextConfig } from "next";

/**
 * TUTOR_TARGET=android builds the static bundle that Capacitor wraps into the
 * Android app (see scripts/android-build.mjs). The API routes are not part of it:
 * `pageExtensions: ["tsx"]` drops every route.ts, and the app serves /api/* on the
 * device instead (src/lib/device/local-api.ts). Without TUTOR_TARGET the config is
 * the desktop one, unchanged.
 */
const isAndroid = process.env.TUTOR_TARGET === "android";

function appVersion(): string {
  try {
    return (JSON.parse(readFileSync("package.json", "utf8")) as { version?: string }).version ?? "unknown";
  } catch {
    return "unknown";
  }
}

const nextConfig: NextConfig = {
  // Hide the floating dev-mode route indicator: it's meaningless to a
  // non-technical learner and easy to mistake for a bug. Real compile/runtime
  // errors are still surfaced regardless of this setting.
  devIndicators: false,
  ...(isAndroid
    ? {
        output: "export",
        // Where the finished export is copied. Next still compiles in .next, which is why
        // scripts/android-build.mjs moves the desktop .next aside for the duration.
        distDir: ".next-android",
        pageExtensions: ["tsx"],
        trailingSlash: true,
        images: { unoptimized: true },
        env: { NEXT_PUBLIC_TUTOR_TARGET: "android", NEXT_PUBLIC_APP_VERSION: appVersion() },
      }
    : {}),
};

export default nextConfig;
