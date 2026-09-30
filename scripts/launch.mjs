#!/usr/bin/env node
// One-click launcher for non-technical users: checks the Gemini key, installs
// dependencies if needed, starts `next dev`, waits for it to answer, then
// opens the browser. Meant to be run by the "Start Tutor" scripts at the repo
// root, but `npm run start:app` works too once Node/deps are already there.
//
// Zero-dependency Node ESM: node:fs, node:path, node:child_process, node:url,
// global fetch. Node >= 18 APIs only (this repo requires >=20.9, but we try
// to fail with a clear message rather than a stack trace on anything older).

import {
  existsSync,
  statSync,
  readdirSync,
  renameSync,
  chmodSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  openSync,
  closeSync,
  rmSync,
} from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import readline from "node:readline";
import { readEnvFile, parseEnv, verifyGeminiKey, mask } from "./gemini-key.mjs";
import { readLocalVersion, isNewer, fetchRemoteVersion, fetchChangelogHighlights } from "./version.mjs";
import { findAppBrowser, openAppWindow, openWindowWithoutPipe, openInDefaultBrowser } from "./app-window.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(scriptDir, "..");
const envPath = path.join(repoRoot, ".env");
const setupScript = path.join(scriptDir, "setup.mjs");
const updateScript = path.join(scriptDir, "update.mjs");
const runtimeDir = path.join(repoRoot, ".runtime");
const logDir = path.join(runtimeDir, "logs");
const logPath = path.join(logDir, "tutor.log");
const hostReadyPath = path.join(runtimeDir, "host-ready.json");
const buildStampPath = path.join(runtimeDir, "build-stamp.json");
const appProfileDir = path.join(runtimeDir, "app-window").replace(/\\/g, "/");
const nextBin = path.join(repoRoot, "node_modules", "next", "dist", "bin", "next");

const NO_BROWSER = process.env.NO_BROWSER === "1";
const BASE_PORT = Number(process.env.PORT) > 0 ? Number(process.env.PORT) : 3000;
const NO_UPDATE_CHECK = process.env.TUTOR_NO_UPDATE_CHECK === "1";
const ALREADY_UPDATED = process.env.TUTOR_UPDATED === "1";
const DEV_MODE = process.env.TUTOR_DEV === "1";
const WANT_WINDOW = !NO_BROWSER && process.env.TUTOR_WINDOW !== "browser";

function log(msg) {
  console.log(msg);
}

function box(lines) {
  const width = Math.max(...lines.map((l) => l.length)) + 4;
  const bar = "-".repeat(width);
  log(bar);
  for (const line of lines) {
    log("| " + line + " ".repeat(width - line.length - 4) + " |");
  }
  log(bar);
}

/** Run setup.mjs interactively (inherits this console's stdio) and return true if it exited 0. */
function runSetupInteractive() {
  const res = spawnSync(process.execPath, [setupScript, "--from-launcher"], { stdio: "inherit", cwd: repoRoot });
  return res.status === 0;
}

// ---------------------------------------------------------------------------
// Step 0 (unnumbered, silent, runs before anything else): swap in any
// pending updated launcher scripts.
// ---------------------------------------------------------------------------
// An update never overwrites "Start Tutor (Windows).bat" / "Start Tutor
// (Mac).command" in place - the shell running one of them may still be
// reading it by byte offset - it writes the new copy as "<name>.new"
// instead (see scripts/update.mjs). The very first thing a fresh launch
// does, before any other step, is swap that pending copy in, so the next
// run - and the shortcut icon - use the current script.
const LIVE_LAUNCHER_NAMES = new Set(["Start Tutor (Windows).bat", "Start Tutor (Mac).command"]);

function applyPendingLauncherFiles() {
  let entries;
  try {
    entries = readdirSync(repoRoot, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".new")) continue;
    const original = entry.name.slice(0, -".new".length);
    if (!LIVE_LAUNCHER_NAMES.has(original)) continue; // never swap in anything else
    const newPath = path.join(repoRoot, entry.name);
    const originalPath = path.join(repoRoot, original);
    try {
      renameSync(newPath, originalPath);
      if (original.endsWith(".command")) {
        try {
          chmodSync(originalPath, 0o755); // restore the executable bit
        } catch {
          /* best effort */
        }
      }
    } catch {
      // Leave the ".new" file for the next launch to retry.
    }
  }
}

// ---------------------------------------------------------------------------
// Step 1: check for a newer version
// ---------------------------------------------------------------------------
function readUpdateState() {
  try {
    return JSON.parse(readFileSync(path.join(repoRoot, ".runtime", "update-state.json"), "utf8"));
  } catch {
    return {};
  }
}

function writeUpdateState(patch) {
  try {
    const dir = path.join(repoRoot, ".runtime");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(
      path.join(dir, "update-state.json"),
      JSON.stringify({ ...readUpdateState(), ...patch }, null, 2) + "\n",
      "utf8",
    );
  } catch {
    // The state file is informational only.
  }
}

function promptYesNo(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      const a = answer.trim().toLowerCase();
      resolve(a === "" || a === "y" || a === "yes");
    });
  });
}

async function checkForUpdate() {
  // Skipped entirely (no output, no network call) when explicitly disabled,
  // or when this is the re-exec right after applying an update - we just
  // updated, no need to check again a second later.
  if (NO_UPDATE_CHECK || ALREADY_UPDATED) return;

  log("[1/5] Checking for updates…");

  const local = readLocalVersion(repoRoot);
  const { version: remote } = await fetchRemoteVersion({ timeoutMs: 3000 });
  writeUpdateState({ last_check_at: new Date().toISOString() });

  if (!remote) {
    // Offline, GitHub unreachable, or the version file 404s (e.g. testing
    // against a fork with no releases pushed yet) - never block a launch
    // over this.
    log("Couldn't check for updates right now — continuing.");
    return;
  }
  if (!isNewer(remote, local)) {
    return;
  }

  log(`A new version is available (v${remote} — you have v${local}).`);
  const highlights = await fetchChangelogHighlights({ version: remote, timeoutMs: 3000 });
  for (const line of highlights) log(`  - ${line}`);

  if (!process.stdin.isTTY) {
    log('Not an interactive terminal — run "npm run update" any time to update.');
    return;
  }

  const wantsUpdate = await promptYesNo("Update now? [Y/n] ");
  if (!wantsUpdate) {
    log("Continuing on the current version.");
    return;
  }

  log("Updating — this can take a minute…");
  const applyResult = spawnSync(process.execPath, [updateScript, "--apply"], { stdio: "inherit", cwd: repoRoot });
  if (applyResult.status !== 0) {
    log("The update did not complete — the tutor will start on the current version.");
    return;
  }

  // The rest of this file, already loaded into memory, is still the OLD
  // version's code. Re-exec ourselves so the launch continues on the
  // freshly-updated scripts/launch.mjs (this also re-applies step 0 above,
  // which swaps in the updated "Start Tutor" scripts if they changed).
  const reExec = spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
    stdio: "inherit",
    cwd: repoRoot,
    env: { ...process.env, TUTOR_UPDATED: "1" },
  });
  process.exit(reExec.status ?? 0);
}

// ---------------------------------------------------------------------------
// Step 2: Gemini / OpenAI key
// ---------------------------------------------------------------------------
async function ensureKey() {
  log("[2/5] Checking your Gemini API key…");

  let text = readEnvFile(envPath);
  let values = text ? parseEnv(text).values : {};
  let geminiKey = values.GEMINI_API_KEY?.trim();
  const openaiKey = values.OPENAI_API_KEY?.trim();

  if (!geminiKey && !openaiKey) {
    log("No API key found yet — let's set one up.");
    const ok = runSetupInteractive();
    text = readEnvFile(envPath);
    values = text ? parseEnv(text).values : {};
    geminiKey = values.GEMINI_API_KEY?.trim();
    const openaiKey2 = values.OPENAI_API_KEY?.trim();
    if (!ok || (!geminiKey && !openaiKey2)) {
      console.error("");
      console.error("No API key was saved, so the tutor can't start.");
      console.error("Run this launcher again when you have a free Gemini key from https://aistudio.google.com/apikey");
      process.exitCode = 1;
      return false;
    }
    return true;
  }

  if (geminiKey) {
    const result = await verifyGeminiKey(geminiKey);
    if (result.ok) {
      log(`Gemini key looks good (${mask(geminiKey)}).`);
      return true;
    }
    if (result.rejected) {
      console.error("");
      console.error("Google rejected the saved Gemini API key (it may be mistyped, deleted, or restricted).");
      console.error("Let's get a fresh one — this replaces the saved key.");
      const ok = runSetupInteractive();
      const text2 = readEnvFile(envPath);
      const values2 = text2 ? parseEnv(text2).values : {};
      const newKey = values2.GEMINI_API_KEY?.trim();
      // setup.mjs only saves a key it could verify (or couldn't reach the
      // network for) — but it may also exit 0 having saved nothing (e.g. the
      // learner cancelled). Don't just check "is there a key string": the old
      // rejected key is still sitting in .env either way, so re-verify it.
      if (!ok || !newKey) {
        console.error("No working Gemini key was saved, so the tutor can't start.");
        process.exitCode = 1;
        return false;
      }
      const reverify = await verifyGeminiKey(newKey);
      if (reverify.rejected) {
        console.error("Google still rejects that key, so the tutor can't start.");
        console.error("Run this launcher again when you have a working key from https://aistudio.google.com/apikey");
        process.exitCode = 1;
        return false;
      }
      // reverify.ok, or a network hiccup while re-checking: proceed either way.
      return true;
    }
    // Network failure verifying the key: warn and continue, the key may be fine.
    log("Couldn't reach Google to check the key right now — continuing anyway.");
    return true;
  }

  // Only an OpenAI key is set; nothing to verify here, the app will use it.
  log("Using the saved OpenAI key.");
  return true;
}

// ---------------------------------------------------------------------------
// Step 3: dependencies
// ---------------------------------------------------------------------------
function findNpmCli() {
  // npm-cli.js ships next to node inside the Node install.
  const nodeDir = path.dirname(process.execPath);
  const candidates =
    process.platform === "win32"
      ? [path.join(nodeDir, "node_modules", "npm", "bin", "npm-cli.js")]
      : [path.join(nodeDir, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js")];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

function runNpm(args) {
  const npmCli = findNpmCli();
  if (npmCli) {
    return spawnSync(process.execPath, [npmCli, ...args], { stdio: "inherit", cwd: repoRoot });
  }
  // Fall back to whatever `npm` is on PATH.
  const cmd = process.platform === "win32" ? "npm.cmd" : "npm";
  return spawnSync(cmd, args, { stdio: "inherit", cwd: repoRoot, shell: process.platform === "win32" });
}

function needsInstall() {
  const nextPkg = path.join(repoRoot, "node_modules", "next", "package.json");
  if (!existsSync(nextPkg)) return true;
  const lockPath = path.join(repoRoot, "package-lock.json");
  const stampPath = path.join(repoRoot, "node_modules", ".package-lock.json");
  if (!existsSync(lockPath)) return false;
  if (!existsSync(stampPath)) return true;
  return statSync(lockPath).mtimeMs > statSync(stampPath).mtimeMs;
}

function ensureDependencies() {
  log("[3/5] Checking dependencies…");
  if (!needsInstall()) {
    log("Dependencies already installed.");
    return true;
  }
  log("Installing dependencies — this can take a few minutes the first time…");
  // --loglevel=error: npm's normal deprecation/allow-scripts warnings read
  // like failures to someone who isn't a developer. Real errors still print.
  let res = runNpm(["ci", "--no-audit", "--no-fund", "--loglevel=error"]);
  if (res.status !== 0) {
    log("`npm ci` didn't work — trying `npm install` instead…");
    res = runNpm(["install", "--no-audit", "--no-fund", "--loglevel=error"]);
  }
  if (res.status !== 0) {
    console.error("");
    console.error("Could not install dependencies.");
    console.error("Check your internet connection, and that antivirus / a firewall isn't blocking npm.");
    process.exitCode = 1;
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Step 4: pick a port
// ---------------------------------------------------------------------------
async function isTutorAlreadyRunning(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/learner`, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return false;
    const data = await res.json().catch(() => null);
    return Boolean(data && typeof data === "object" && "storeKind" in data);
  } catch {
    return false;
  }
}

async function isPortFree(port) {
  try {
    // If anything answers an HTTP request here, the port is busy.
    await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(700) });
    return false;
  } catch {
    // Connection refused / timeout => nothing listening => free.
    return true;
  }
}

async function pickPort() {
  log("[4/5] Finding a free port…");
  if (await isTutorAlreadyRunning(BASE_PORT)) {
    return { port: BASE_PORT, alreadyRunning: true };
  }
  for (let port = BASE_PORT; port <= BASE_PORT + 10; port++) {
    if (await isPortFree(port)) return { port, alreadyRunning: false };
  }
  return { port: BASE_PORT, alreadyRunning: false };
}

// ---------------------------------------------------------------------------
// Step 5: build (first time / after an update), start the server, open the app
// ---------------------------------------------------------------------------

/** sha1 over everything that changes what `next build` would produce. */
export function computeBuildFingerprint(root) {
  const hash = createHash("sha1");
  const add = (label, value) => hash.update(`${label}\0${value}\0`);
  try {
    add("version", JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version);
  } catch {
    add("version", "?");
  }
  for (const name of ["package-lock.json", "next.config.ts", "postcss.config.mjs", "tsconfig.json"]) {
    try {
      const st = statSync(path.join(root, name));
      add(name, `${st.size}:${st.mtimeMs}`);
    } catch {
      add(name, "missing");
    }
  }
  const walk = (rel) => {
    let entries;
    try {
      entries = readdirSync(path.join(root, rel), { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      const childRel = rel + "/" + entry.name;
      if (entry.isDirectory()) walk(childRel);
      else if (entry.isFile()) {
        try {
          const st = statSync(path.join(root, childRel));
          add(childRel, `${st.size}:${st.mtimeMs}`);
        } catch {
          /* vanished */
        }
      }
    }
  };
  walk("src");
  walk("public");
  return hash.digest("hex");
}

function ensureBuild() {
  if (DEV_MODE) {
    // `next dev` rewrites .next; make sure a later production start rebuilds.
    try {
      rmSync(buildStampPath, { force: true });
    } catch {
      /* ignore */
    }
    return true;
  }
  const fingerprint = computeBuildFingerprint(repoRoot);
  let stamp = null;
  try {
    stamp = JSON.parse(readFileSync(buildStampPath, "utf8")).fingerprint;
  } catch {
    /* no stamp */
  }
  if (existsSync(path.join(repoRoot, ".next", "BUILD_ID")) && stamp === fingerprint) return true;

  log("Preparing the app — only after an install or update, about a minute…");
  const res = spawnSync(process.execPath, [nextBin, "build"], {
    stdio: "inherit",
    cwd: repoRoot,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  });
  if (res.status !== 0) {
    console.error("");
    console.error("The app could not be prepared (see the messages above).");
    console.error("Try running this launcher again; if it keeps failing, tell whoever sent you the tutor.");
    process.exitCode = 1;
    return false;
  }
  try {
    mkdirSync(runtimeDir, { recursive: true });
    writeFileSync(buildStampPath, JSON.stringify({ fingerprint, builtAt: new Date().toISOString() }) + "\n", "utf8");
  } catch {
    /* the next start will just rebuild */
  }
  return true;
}

function spawnServer(port, stdio) {
  const cmd = DEV_MODE ? "dev" : "start";
  return spawn(process.execPath, [nextBin, cmd, "-p", String(port), "-H", "127.0.0.1"], {
    cwd: repoRoot,
    stdio,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    detached: process.platform !== "win32",
    windowsHide: true,
  });
}

async function waitForServer(port, child, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  let childExited = child.exitCode !== null;
  child.once("exit", () => {
    childExited = true;
  });
  while (Date.now() < deadline) {
    if (childExited) return false;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(2000) });
      if (res.status === 200) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function killTree(child) {
  if (!child || child.killed || child.exitCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
    }
  }
}

function tailLog(lines = 30) {
  try {
    return readFileSync(logPath, "utf8").split(/\r?\n/).slice(-lines).join("\n");
  } catch {
    return "(no log was written)";
  }
}

function rotateLog() {
  try {
    mkdirSync(logDir, { recursive: true });
    if (existsSync(logPath)) {
      rmSync(logPath + ".1", { force: true });
      renameSync(logPath, logPath + ".1");
    }
  } catch {
    /* best effort */
  }
}

function errorPage(message, detail) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return (
    '<!doctype html><meta charset="utf-8"><title>Quebec French Tutor</title>' +
    '<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem;line-height:1.5">' +
    `<h1 style="font-size:1.4rem">${esc(message)}</h1>` +
    `<p>Close this window and open the tutor again.</p><p style="color:#666;font-size:.9rem">Details: ${esc(detail)}</p>`
  );
}

// --- background host: runs the server and owns the app window -------------

async function runHost(port) {
  const url = `http://127.0.0.1:${port}`;
  const browser = findAppBrowser();
  if (!browser) {
    console.error("No Chromium-based browser found for the app window.");
    process.exit(1);
  }
  const server = spawnServer(port, ["ignore", "inherit", "inherit"]);
  let win = null;
  let stopping = false;
  const cleanup = () => {
    killTree(server);
    try {
      rmSync(hostReadyPath, { force: true });
    } catch {
      /* ignore */
    }
  };
  const stop = (code) => {
    if (stopping) return;
    stopping = true;
    cleanup();
    if (win) void win.close();
    process.exit(code);
  };
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => stop(0));
  process.on("exit", cleanup);

  const up = await waitForServer(port, server, DEV_MODE ? 180_000 : 90_000);
  if (!up) {
    console.error("The tutor server did not start in time (or it crashed).");
    stop(1);
    return;
  }

  try {
    mkdirSync(appProfileDir, { recursive: true });
    win = openAppWindow({ browserPath: browser.path, url, profileDir: appProfileDir });
  } catch (err) {
    console.error("Could not open the app window:", err instanceof Error ? err.message : err);
    stop(1);
    return;
  }
  // A window that vanishes within a moment means the browser refused to start.
  const early = await Promise.race([win.closed, new Promise((r) => setTimeout(() => r("ok"), 1500))]);
  if (early !== "ok") {
    console.error("The app window closed immediately (browser exit code " + early + ").");
    stop(1);
    return;
  }

  server.on("exit", () => {
    if (stopping) return;
    console.error("The tutor server stopped unexpectedly.");
    void win.showError(errorPage("The tutor stopped unexpectedly.", logPath));
  });

  writeFileSync(
    hostReadyPath,
    JSON.stringify({ pid: process.pid, port, url, startedAt: new Date().toISOString() }) + "\n",
    "utf8",
  );
  await win.closed;
  stop(0);
}

/** Spawn this script as a detached background host and wait until it reports ready. */
async function startWindowHost(port) {
  rotateLog();
  try {
    rmSync(hostReadyPath, { force: true });
  } catch {
    /* ignore */
  }
  const fd = openSync(logPath, "a");
  const host = spawn(process.execPath, [fileURLToPath(import.meta.url), "--host", "--port", String(port)], {
    cwd: repoRoot,
    stdio: ["ignore", fd, fd],
    detached: true,
    windowsHide: true,
    env: process.env,
  });
  closeSync(fd);
  let hostExited = false;
  host.once("exit", () => {
    hostExited = true;
  });
  host.unref();

  const deadline = Date.now() + (DEV_MODE ? 180_000 : 90_000);
  while (Date.now() < deadline && !hostExited) {
    if (existsSync(hostReadyPath)) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  if (existsSync(hostReadyPath)) return true;
  console.error("");
  console.error("The tutor did not open. The last lines of its log:");
  console.error("-".repeat(40));
  console.error(tailLog(30));
  console.error("-".repeat(40));
  console.error(`Full log: ${logPath}`);
  console.error("Try opening the tutor again. If it keeps failing, send that log to whoever gave you the tutor.");
  if (!hostExited) {
    try {
      process.kill(host.pid);
    } catch {
      /* ignore */
    }
  }
  process.exitCode = 1;
  return false;
}

async function runForeground(port, url) {
  log(`[5/5] Starting the tutor at ${url} …`);
  const child = spawnServer(port, ["ignore", "pipe", "pipe"]);
  child.stdout.on("data", (d) => process.stdout.write(d));
  child.stderr.on("data", (d) => process.stderr.write(d));

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    killTree(child);
    process.exit(signal === "exit" ? process.exitCode ?? 0 : 0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  // On macOS/Linux the server child runs detached (its own process group), so
  // closing the Terminal window (SIGHUP to us only) would otherwise orphan it.
  process.on("SIGHUP", () => shutdown("SIGHUP"));
  // Last-resort net; killTree() is idempotent.
  process.on("exit", () => killTree(child));

  const up = await waitForServer(port, child);
  if (!up) {
    console.error("");
    console.error("The tutor server did not start in time (or it crashed). See the output above for details.");
    killTree(child);
    process.exitCode = 1;
    return;
  }

  if (!NO_BROWSER) openInDefaultBrowser(url);

  // Set the console title once the server answered; nothing sets it again after this.
  process.title = "Quebec French Tutor - keep this window open";

  box([
    `The tutor is running at ${url}`,
    "Keep this window open while you practise.",
    "To stop the tutor, close this window (or press Ctrl+C).",
  ]);
  log(`If the browser didn't open, open ${url} yourself.`);

  child.on("exit", (code) => {
    if (!shuttingDown) {
      process.exitCode = code ?? 0;
    }
  });

  await new Promise((resolve) => child.on("exit", resolve));
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--host")) {
    const i = argv.indexOf("--port");
    await runHost(Number(argv[i + 1]) || BASE_PORT);
    return;
  }

  // Very first action, before any output: swap in an updated launcher
  // script left behind by a previous update, if any.
  applyPendingLauncherFiles();

  log("");
  log("== Québec French Voice Tutor ==");
  log("");

  await checkForUpdate();

  if (!(await ensureKey())) return;
  if (!ensureDependencies()) return;

  const { port, alreadyRunning } = await pickPort();
  const url = `http://127.0.0.1:${port}`;
  const browser = WANT_WINDOW ? findAppBrowser() : null;

  // Checked before building: a rebuild under a live `next start` would break it.
  if (alreadyRunning) {
    log(`The tutor is already running at ${url}`);
    if (browser) openWindowWithoutPipe({ browserPath: browser.path, url, profileDir: appProfileDir });
    else if (!NO_BROWSER) openInDefaultBrowser(url);
    return;
  }

  if (!ensureBuild()) return;

  if (browser) {
    log("[5/5] Starting the tutor …");
    if (await startWindowHost(port)) {
      log("The tutor is open in its own window. You can close this window.");
    }
    return;
  }

  await runForeground(port, url);
}

function isEntryModule() {
  if (!process.argv[1]) return false;
  const a = path.resolve(process.argv[1]);
  const b = fileURLToPath(import.meta.url);
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

if (isEntryModule()) {
  main().catch((err) => {
    console.error("Launcher failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
