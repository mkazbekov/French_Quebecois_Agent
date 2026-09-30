// Builds the Android app: static web export -> Capacitor sync -> (optional) debug APK.
//
//   node scripts/android-build.mjs          web export (out/) + `cap sync android`
//   node scripts/android-build.mjs --apk    ... then gradlew assembleDebug -> dist/QuebecFrenchTutor.apk
//
// The export uses its own Next build folder (.next-android), so it never disturbs the
// desktop build (.next) or the launcher's build stamp. JDK / Android SDK come from
// JAVA_HOME / ANDROID_HOME (or ANDROID_SDK_ROOT); if unset, %LOCALAPPDATA%\AndroidBuild is tried.
// Nothing here is hardcoded to a machine, and no key or learner data is ever involved.

import { spawnSync } from "node:child_process";
import { cpSync, rmSync, copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wantApk = process.argv.includes("--apk");
const isWin = process.platform === "win32";

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { cwd: root, stdio: "inherit", shell: false, ...opts, env: { ...process.env, ...(opts.env ?? {}) } });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    console.error(`\nFailed: ${cmd} ${args.join(" ")} (exit ${res.status})`);
    process.exit(res.status ?? 1);
  }
}

function bin(pkgPath) {
  const p = path.join(root, "node_modules", pkgPath);
  if (!existsSync(p)) {
    console.error(`Missing ${pkgPath}. Run "npm ci" first.`);
    process.exit(1);
  }
  return p;
}

/** Fail the build if anything that looks like a secret or learner data ended up in the export. */
function assertExportIsClean(dir) {
  const bad = [];
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "data" || entry.name === ".runtime") bad.push(full);
        else walk(full);
      } else if (/^\.env/i.test(entry.name) || /^learner-.*\.json$/i.test(entry.name)) bad.push(full);
    }
  };
  walk(dir);
  if (bad.length) {
    console.error("Refusing to continue: the web export contains files that must never ship:\n  " + bad.join("\n  "));
    process.exit(1);
  }
}

function firstDir(parent, prefix) {
  try {
    return readdirSync(parent)
      .filter((n) => n.startsWith(prefix) && statSync(path.join(parent, n)).isDirectory())
      .sort()
      .map((n) => path.join(parent, n))
      .pop();
  } catch {
    return undefined;
  }
}

function findToolchain() {
  const local = process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "AndroidBuild") : null;
  let javaHome = process.env.JAVA_HOME;
  if (!javaHome && local) javaHome = firstDir(local, "jdk");
  let sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (!sdk && local && existsSync(path.join(local, "sdk"))) sdk = path.join(local, "sdk");
  return { javaHome, sdk };
}

// 1. Static export of the web app for the phone.
console.log("== Building the web app for Android (static export)");
run(process.execPath, [bin("next/dist/bin/next"), "build"], {
  env: { TUTOR_TARGET: "android", NEXT_TELEMETRY_DISABLED: "1" },
});
// With a custom distDir, Next writes the static export there; Capacitor's webDir is out/.
const exportDir = path.join(root, ".next-android");
if (!existsSync(path.join(exportDir, "index.html"))) {
  console.error("The export did not produce .next-android/index.html.");
  process.exit(1);
}
const outDir = path.join(root, "out");
rmSync(outDir, { recursive: true, force: true });
cpSync(exportDir, outDir, { recursive: true });
assertExportIsClean(outDir);

// 2. Copy the export into the Android project.
console.log("\n== Syncing into the Android project");
run(process.execPath, [bin("@capacitor/cli/bin/capacitor"), "sync", "android"]);

if (!wantApk) {
  console.log("\nDone. Re-run with --apk to also build dist/QuebecFrenchTutor.apk.");
  process.exit(0);
}

// 3. Debug APK.
const { javaHome, sdk } = findToolchain();
if (!javaHome || !sdk) {
  console.error("\nCannot build the APK: set JAVA_HOME (JDK 21) and ANDROID_HOME (Android SDK, platform 36) first.");
  process.exit(1);
}
console.log(`\n== Building the debug APK\n   JDK: ${javaHome}\n   SDK: ${sdk}`);

const localProps = path.join(root, "android", "local.properties"); // git-ignored
const sdkLine = `sdk.dir=${sdk.replace(/\\/g, "\\\\")}\n`;
if (!existsSync(localProps) || !readFileSync(localProps, "utf8").includes("sdk.dir=")) writeFileSync(localProps, sdkLine);

const androidDir = path.join(root, "android");
const env = { JAVA_HOME: javaHome, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk };
// gradlew.bat has to go through cmd.exe on Windows (verbatim args so the quoted path survives).
const gradlew = path.join(androidDir, isWin ? "gradlew.bat" : "gradlew");
const g = isWin
  ? spawnSync("cmd.exe", ["/d", "/s", "/c", `""${gradlew}" assembleDebug"`], {
      cwd: androidDir,
      stdio: "inherit",
      windowsVerbatimArguments: true,
      env: { ...process.env, ...env },
    })
  : spawnSync(gradlew, ["assembleDebug"], { cwd: androidDir, stdio: "inherit", env: { ...process.env, ...env } });
if (g.status !== 0) process.exit(g.status ?? 1);

const apk = path.join(root, "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk");
if (!existsSync(apk)) {
  console.error("Gradle finished but app-debug.apk was not found.");
  process.exit(1);
}
const dist = path.join(root, "dist");
mkdirSync(dist, { recursive: true });
const target = path.join(dist, "QuebecFrenchTutor.apk");
copyFileSync(apk, target);
console.log(`\nAPK ready: ${target}`);
