#!/usr/bin/env node
// Seamless in-place updater for the one-click install. Run as:
//   node scripts/update.mjs --check   (print status only, never changes anything, exit 0)
//   node scripts/update.mjs --apply   (download + apply the latest version)
//
// Zero-dependency Node ESM: node:fs, node:path, node:os, node:child_process,
// node:url, global fetch. Node >= 18 APIs only.
//
// Apply algorithm:
//   1. Download the archive (zip on Windows, tar.gz elsewhere) to a temp dir.
//   2. Extract it (Windows: System32\tar.exe, then tar on PATH, then
//      Expand-Archive; elsewhere: tar -xzf).
//   3. Find the single extracted top-level folder.
//   4. Copy its contents OVER the install folder, then delete local files
//      that are gone from the new version.
// Steps 1-2 happen entirely in a temp directory, so any failure there
// (no internet, corrupt download, missing `tar`) leaves the install
// untouched and exits 1.
//
// CRITICAL (Windows): never delete or move the install folder itself - the
// running cmd.exe window and this very process hold open handles on it.
// Only ever copy files into it and delete individual stale files.
//
// CRITICAL (launcher scripts): "Start Tutor (Windows).bat" and
// "Start Tutor (Mac).command" at the install root may be mid-execution -
// the shell reads them by byte offset as it goes. If the new version
// differs, we write it as "<name>.new" instead of overwriting in place.
// scripts/launch.mjs applies any pending ".new" file as its very first
// action on the next start.

import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync, chmodSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import os from "node:os";
import path from "node:path";
import {
  readLocalVersion,
  isNewer,
  fetchRemoteVersion,
  fetchChangelogHighlights,
  ARCHIVE_URL_WINDOWS,
  ARCHIVE_URL_UNIX,
} from "./version.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(scriptDir, "..");

// Names at the install root that are never touched by an update - a
// learner's saved key, progress, downloaded runtime state, and installed
// dependencies.
const PRESERVE_ROOT_NAMES = new Set([".env", "data", ".runtime", "node_modules", ".git"]);

// Root files that may be mid-execution while we update; write "<name>.new"
// instead of overwriting them directly.
const LIVE_LAUNCHER_NAMES = new Set(["Start Tutor (Windows).bat", "Start Tutor (Mac).command"]);

const DOWNLOAD_TIMEOUT_MS = 30_000;

function log(msg) {
  console.log(msg);
}

/** Read/write .runtime/update-state.json, creating .runtime/ if needed. */
function readUpdateState() {
  try {
    const p = path.join(repoRoot, ".runtime", "update-state.json");
    if (!existsSync(p)) return {};
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return {};
  }
}

function writeUpdateState(patch) {
  try {
    const dir = path.join(repoRoot, ".runtime");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const p = path.join(dir, "update-state.json");
    const current = readUpdateState();
    writeFileSync(p, JSON.stringify({ ...current, ...patch }, null, 2) + "\n", "utf8");
  } catch {
    // Non-fatal: the state file is informational only.
  }
}

/** Download `url` to `destPath`. Never throws; returns true/false. */
async function download(url, destPath) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(destPath, buf);
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract the downloaded archive.
 *
 * Windows ships bsdtar as %SystemRoot%\System32\tar.exe (Windows 10 1803+),
 * which reads .zip - but a plain `tar` on PATH can just as easily be GNU tar
 * (Git for Windows, MSYS, WSL interop), which cannot. So try the system one by
 * full path first, then whatever is on PATH, then PowerShell's Expand-Archive,
 * which exists on every supported Windows. Elsewhere, tar -xzf is enough.
 */
function extractArchive(archivePath, destDir) {
  const run = (exe, args) => spawnSync(exe, args, { stdio: ["ignore", "pipe", "pipe"] });

  if (process.platform !== "win32") {
    return run("tar", ["-xzf", archivePath, "-C", destDir]).status === 0;
  }

  const systemTar = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe");
  const tarCandidates = existsSync(systemTar) ? [systemTar, "tar"] : ["tar"];
  for (const exe of tarCandidates) {
    if (run(exe, ["-xf", archivePath, "-C", destDir]).status === 0) return true;
  }

  // PowerShell string literals escape a single quote by doubling it.
  const q = (s) => "'" + String(s).split("'").join("''") + "'";
  const ps = run("powershell", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    `Expand-Archive -LiteralPath ${q(archivePath)} -DestinationPath ${q(destDir)} -Force`,
  ]);
  return ps.status === 0;
}

/** Find the single top-level directory a GitHub archive extracts into. */
function findExtractedRoot(destDir) {
  const entries = readdirSync(destDir, { withFileTypes: true }).filter((e) => e.isDirectory());
  return entries.length > 0 ? path.join(destDir, entries[0].name) : null;
}

/** Recursively list files (relative posix-style paths) under `dir`. */
function listFiles(dir, base = dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    const rel = path.relative(base, abs).split(path.sep).join("/");
    if (entry.isDirectory()) {
      listFiles(abs, base, out);
    } else {
      out.push(rel);
    }
  }
  return out;
}

function filesIdentical(a, b) {
  try {
    return Buffer.compare(readFileSync(a), readFileSync(b)) === 0;
  } catch {
    return false;
  }
}

/** Copy the new archive's contents over the install folder, in place. */
export function copyOver(srcRoot, destRoot) {
  const files = listFiles(srcRoot);
  for (const rel of files) {
    const topSegment = rel.split("/")[0];
    if (PRESERVE_ROOT_NAMES.has(topSegment)) continue; // never overwrite these

    const srcPath = path.join(srcRoot, ...rel.split("/"));
    const destPath = path.join(destRoot, ...rel.split("/"));

    if (rel.indexOf("/") === -1 && LIVE_LAUNCHER_NAMES.has(rel)) {
      // Root-level launcher scripts may be mid-execution: never overwrite
      // in place. Write "<name>.new" and let launch.mjs swap it in on the
      // next start.
      if (!existsSync(destPath)) {
        writeFileSync(destPath, readFileSync(srcPath));
      } else if (!filesIdentical(srcPath, destPath)) {
        writeFileSync(destPath + ".new", readFileSync(srcPath));
      }
      continue;
    }

    const destDir = path.dirname(destPath);
    if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
    writeFileSync(destPath, readFileSync(srcPath));
    // A ZIP/tar copy loses the executable bit; the shell launchers need it
    // back or a double-click on macOS just opens them in a text editor.
    if (destPath.endsWith(".command") || destPath.endsWith(".sh")) {
      try {
        chmodSync(destPath, 0o755);
      } catch {
        // Non-fatal (Windows has no executable bit).
      }
    }
  }
}

/**
 * Files a previous run of this updater installed, so the next update knows
 * exactly what it may remove. Absent on the first update (and on a Git
 * install), in which case nothing is deleted at all - we never guess.
 */
function readInstalledManifest() {
  try {
    const p = path.join(repoRoot, ".runtime", "installed-files.json");
    if (!existsSync(p)) return null;
    const parsed = JSON.parse(readFileSync(p, "utf8"));
    return Array.isArray(parsed.files) ? parsed.files : null;
  } catch {
    return null;
  }
}

function writeInstalledManifest(files) {
  try {
    const dir = path.join(repoRoot, ".runtime");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(
      path.join(dir, "installed-files.json"),
      JSON.stringify({ written_at: new Date().toISOString(), files }, null, 2) + "\n",
      "utf8",
    );
  } catch {
    // Non-fatal: without the manifest the next update simply deletes nothing.
  }
}

/**
 * Delete files that a previous update installed and that the new version no
 * longer ships. Only files listed in our own manifest are ever considered,
 * so anything the learner put in the folder themselves is untouchable, and
 * the very first update deletes nothing.
 */
export function deleteStale(srcRoot, destRoot, previousFiles) {
  if (!previousFiles) return;
  const archiveFiles = new Set(listFiles(srcRoot));

  for (const rel of previousFiles) {
    if (typeof rel !== "string" || !rel || rel.includes("..")) continue;
    const topSegment = rel.split("/")[0];
    if (PRESERVE_ROOT_NAMES.has(topSegment)) continue;
    if (rel.endsWith(".new")) continue; // a pending launcher swap - never ours to delete
    if (rel.indexOf("/") === -1 && LIVE_LAUNCHER_NAMES.has(rel)) continue; // handled by copyOver above
    if (archiveFiles.has(rel)) continue; // still shipped, already overwritten

    try {
      rmSync(path.join(destRoot, ...rel.split("/")), { force: true });
    } catch {
      // Conservative: a delete failure is not fatal to the update.
    }
  }
}

async function doCheck() {
  const local = readLocalVersion(repoRoot);
  const { version: remote, error } = await fetchRemoteVersion({ timeoutMs: 3000 });
  writeUpdateState({ last_check_at: new Date().toISOString() });

  if (!remote) {
    log(`You have v${local}. Couldn't check for updates right now${error ? ` (${error})` : ""}.`);
    return 0;
  }
  if (isNewer(remote, local)) {
    log(`A new version is available: v${remote} (you have v${local}).`);
    const highlights = await fetchChangelogHighlights({ version: remote, timeoutMs: 3000 });
    for (const line of highlights) log(`  - ${line}`);
    log(`Run "npm run update" to update now.`);
  } else {
    log(`You're up to date (v${local}).`);
  }
  return 0;
}

async function doApply() {
  const local = readLocalVersion(repoRoot);
  const { version: remote, error } = await fetchRemoteVersion({ timeoutMs: 3000 });

  if (!remote) {
    log(`Couldn't check for a new version right now${error ? ` (${error})` : ""}. The tutor is unchanged.`);
    writeUpdateState({ last_check_at: new Date().toISOString() });
    return 1;
  }
  if (!isNewer(remote, local)) {
    log(`Already up to date (v${local}).`);
    writeUpdateState({ last_check_at: new Date().toISOString() });
    return 0;
  }

  log(`Updating to v${remote}…`);

  const archiveUrl = process.platform === "win32" ? ARCHIVE_URL_WINDOWS : ARCHIVE_URL_UNIX;
  const tmpDir = path.join(os.tmpdir(), `tutor-update-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpDir, { recursive: true });
  const archiveFile = path.join(tmpDir, process.platform === "win32" ? "source.zip" : "source.tar.gz");

  try {
    log("Downloading the new version…");
    const ok = await download(archiveUrl, archiveFile);
    if (!ok) {
      log("Could not download the update. Check your internet connection and try again later.");
      return 1;
    }

    log("Extracting…");
    const extractDestDir = path.join(tmpDir, "extracted");
    mkdirSync(extractDestDir, { recursive: true });
    if (!extractArchive(archiveFile, extractDestDir)) {
      log("Could not extract the downloaded update. The tutor is unchanged.");
      return 1;
    }

    const extractedRoot = findExtractedRoot(extractDestDir);
    if (!extractedRoot) {
      log("The downloaded update did not contain the expected files. The tutor is unchanged.");
      return 1;
    }

    // Everything above this line only touched the temp directory - the
    // install folder has not been modified yet. From here on we are
    // applying the update, and we do so in place (never deleting or moving
    // the install folder itself, since this process and its parent shell
    // may hold open handles on it).
    const previousFiles = readInstalledManifest();
    copyOver(extractedRoot, repoRoot);
    deleteStale(extractedRoot, repoRoot, previousFiles);
    writeInstalledManifest(listFiles(extractedRoot));

    writeUpdateState({
      version: remote,
      updated_at: new Date().toISOString(),
      last_check_at: new Date().toISOString(),
    });

    log(`Updated to v${remote}.`);
    return 0;
  } finally {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Best effort cleanup only.
    }
  }
}

async function main() {
  const mode = process.argv.includes("--apply") ? "apply" : process.argv.includes("--check") ? "check" : null;
  if (!mode) {
    console.error("Usage: node scripts/update.mjs --check | --apply");
    process.exitCode = 1;
    return;
  }
  const code = mode === "apply" ? await doApply() : await doCheck();
  process.exitCode = code;
}

// Only run as a CLI: the helpers above are imported directly by tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error("Update failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
