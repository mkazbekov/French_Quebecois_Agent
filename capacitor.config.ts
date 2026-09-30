import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.quebectutor.app",
  appName: "Québec French Tutor",
  // The static export written by `TUTOR_TARGET=android next build` (scripts/android-build.mjs).
  webDir: "out",
  server: { androidScheme: "https" },
};

export default config;
