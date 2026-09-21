// Single source of truth for version comparison and remote version/changelog
// lookups. Used by scripts/update.mjs (Node CLI), scripts/launch.mjs (Node
// CLI) and src/app/api/version/route.ts (Next.js server route — Next can
// bundle a .mjs file, and this repo's tsconfig has allowJs: true).
//
// Zero-dependency Node ESM: node:fs, node:path, global fetch. No throws from
// any exported function that touches the network or the filesystem — a
// missing file, a timeout, or a malformed response must always resolve to a
// safe fallback value, never an exception, so a launch or a page load is
// never blocked by being offline.

import { readFileSync } from "node:fs";
import path from "node:path";

export const REPO_SLUG = "mkazbekov/French_Quebecois_Agent";
export const REPO_BRANCH = "main";

const RAW_BASE = `https://raw.githubusercontent.com/${REPO_SLUG}/${REPO_BRANCH}`;

/** Default location of the remote package.json (raw, on the main branch). */
export const DEFAULT_REMOTE_PACKAGE_URL = `${RAW_BASE}/package.json`;

/** Default location of the remote CHANGELOG.md (raw, on the main branch). */
export const DEFAULT_REMOTE_CHANGELOG_URL = `${RAW_BASE}/CHANGELOG.md`;

/** Windows update archive: a .zip (tar.exe on Windows 10+ can extract .zip). */
export const ARCHIVE_URL_WINDOWS =
  process.env.TUTOR_ARCHIVE_URL || `https://github.com/${REPO_SLUG}/archive/refs/heads/${REPO_BRANCH}.zip`;

/** macOS/Linux update archive: a .tar.gz. */
export const ARCHIVE_URL_UNIX =
  process.env.TUTOR_ARCHIVE_URL || `https://github.com/${REPO_SLUG}/archive/refs/heads/${REPO_BRANCH}.tar.gz`;

/**
 * Read the version string out of a local package.json. Returns "0.0.0" if
 * the file is missing, unreadable, or has no usable version field — never
 * throws.
 */
export function readLocalVersion(repoRoot) {
  try {
    const pkgPath = path.join(repoRoot, "package.json");
    const text = readFileSync(pkgPath, "utf8");
    const pkg = JSON.parse(text);
    if (typeof pkg.version === "string" && pkg.version.trim()) {
      return pkg.version.trim();
    }
    return "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/**
 * Pull up to 3 numeric-ish parts out of a version string. Non-numeric junk
 * (pre-release tags, "v" prefixes, garbage) becomes 0 for that part rather
 * than throwing or producing NaN comparisons.
 */
function parseParts(version) {
  const str = String(version ?? "").trim().replace(/^v/i, "");
  const parts = str.split(".").slice(0, 3);
  const nums = [0, 0, 0];
  for (let i = 0; i < parts.length; i++) {
    const n = parseInt(parts[i], 10);
    nums[i] = Number.isFinite(n) && n >= 0 ? n : 0;
  }
  return nums;
}

/**
 * Compare two version strings numerically, part by part (major.minor.patch).
 * Tolerant of missing parts ("1.2" == "1.2.0") and non-numeric junk (treated
 * as 0). Returns -1 if a < b, 0 if equal, 1 if a > b.
 */
export function compareVersions(a, b) {
  const pa = parseParts(a);
  const pb = parseParts(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] < pb[i]) return -1;
    if (pa[i] > pb[i]) return 1;
  }
  return 0;
}

/** True if `remote` is a strictly newer version than `local`. */
export function isNewer(remote, local) {
  return compareVersions(remote, local) > 0;
}

// raw.githubusercontent.com serves these files with `Cache-Control: max-age=300`
// and its CDN ignores query strings, so a just-published version can take a few
// minutes to show up here - that is fine for an update check, and the launcher
// asks again on the next start. These options only stop anything BETWEEN us and
// the CDN (a corporate proxy, a local HTTP cache) adding staleness of its own.
const FETCH_OPTIONS = { cache: "no-store", headers: { "cache-control": "no-cache" } };

/**
 * Fetch the remote version from GitHub's raw package.json on main. Never
 * throws: resolves to { version: string|null, error: string|null }. Respects
 * `timeoutMs` so an offline machine or a slow network never blocks a caller
 * for longer than the timeout.
 */
export async function fetchRemoteVersion({ timeoutMs = 3000, url = DEFAULT_REMOTE_PACKAGE_URL } = {}) {
  try {
    const res = await fetch(url, { ...FETCH_OPTIONS, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) {
      return { version: null, error: `HTTP ${res.status}` };
    }
    const text = await res.text();
    let pkg;
    try {
      pkg = JSON.parse(text);
    } catch {
      return { version: null, error: "malformed package.json" };
    }
    if (typeof pkg.version === "string" && pkg.version.trim()) {
      return { version: pkg.version.trim(), error: null };
    }
    return { version: null, error: "no version field" };
  } catch (err) {
    return { version: null, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Fetch up to 5 changelog bullet lines for a given version from the raw
 * CHANGELOG.md on main. Returns [] on any failure (network, missing
 * section, malformed file) — never throws.
 */
export async function fetchChangelogHighlights({
  version,
  timeoutMs = 3000,
  url = DEFAULT_REMOTE_CHANGELOG_URL,
} = {}) {
  if (!version) return [];
  try {
    const res = await fetch(url, { ...FETCH_OPTIONS, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return [];
    const text = await res.text();
    return extractHighlights(text, version);
  } catch {
    return [];
  }
}

/**
 * Pull bullet lines out of a CHANGELOG.md section for `version`. The
 * changelog is expected to have "## <version>" (or "## <version> (date)")
 * headings with "- " bullet lines under each; this is deliberately loose so
 * small formatting drift doesn't break it.
 */
function extractHighlights(text, version) {
  const lines = text.split(/\r?\n/);
  const headingRe = new RegExp(`^##\\s+\\[?${escapeRegExp(version)}\\]?\\b`);
  let inSection = false;
  const bullets = [];
  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      if (inSection) break; // reached the next version's heading
      inSection = headingRe.test(line);
      continue;
    }
    if (!inSection) continue;
    const m = line.match(/^\s*-\s+(.*\S)\s*$/);
    if (m) {
      bullets.push(m[1]);
      if (bullets.length >= 5) break;
    }
  }
  return bullets;
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
