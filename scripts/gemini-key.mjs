// Shared helpers for checking a saved Gemini API key. Used by both
// scripts/setup.mjs (interactive first-run key entry) and scripts/launch.mjs
// (the one-click launcher, which re-verifies a saved key before starting the
// server) so the two don't drift apart.
//
// Zero-dependency Node ESM: only node:fs/node:path/global fetch.

import { readFileSync, existsSync } from "node:fs";

export const GEMINI_VERIFY_URL = "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1";

/** Parse a .env-style file into an ordered list of lines plus a key->value map. */
export function parseEnv(text) {
  const lines = text.split(/\r?\n/);
  const values = {};
  for (const line of lines) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (m) values[m[1]] = m[2];
  }
  return { lines, values };
}

export function readEnvFile(p) {
  if (!existsSync(p)) return null;
  return readFileSync(p, "utf8");
}

/** Update or append KEY=value in the raw .env text, preserving everything else. */
export function setEnvVar(text, key, value) {
  const lines = text.split(/\r?\n/);
  const re = new RegExp(`^${key}=`);
  let found = false;
  const next = lines.map((line) => {
    if (re.test(line)) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });
  if (!found) {
    // Drop a single trailing empty line before appending, then restore it.
    if (next.length && next[next.length - 1] === "") next.pop();
    next.push(`${key}=${value}`);
    next.push("");
  }
  return next.join("\n");
}

// Mirrors src/lib/tutor/gemini-errors.ts#isGeminiKeyRejection — kept in sync
// by hand since scripts/ (plain JS) can't import from src/ (TypeScript).
// A 401/403 always means a bad key; a 400 only means a bad key when the body
// actually blames the key (other 400s are this *request's* problem, e.g. a
// malformed call — not something a new key would fix).
const KEY_REJECTION_MARKERS = ["API_KEY_INVALID", "API key not valid"];

export function isGeminiKeyRejection(status, bodyText) {
  if (status === 401 || status === 403) return true;
  if (status !== 400) return false;
  if (KEY_REJECTION_MARKERS.some((marker) => bodyText.includes(marker))) return true;
  try {
    const body = JSON.parse(bodyText);
    const reasons = (body.error?.details ?? []).map((d) => d.reason ?? "");
    if (reasons.some((r) => r.includes("API_KEY"))) return true;
  } catch {
    // not JSON — marker check above already covered it
  }
  return false;
}

/**
 * Ask Google whether a Gemini API key is valid. Returns:
 *   { ok: true }                        — key works
 *   { ok: false, rejected: true }       — Google rejected the key itself
 *   { ok: false, rejected: false }      — network problem, or a non-key error;
 *                                          key may still be fine
 */
export async function verifyGeminiKey(key) {
  try {
    const res = await fetch(GEMINI_VERIFY_URL, {
      headers: { "x-goog-api-key": key },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) return { ok: true };
    const bodyText = await res.text().catch(() => "");
    if (isGeminiKeyRejection(res.status, bodyText)) {
      return { ok: false, rejected: true };
    }
    return { ok: false, rejected: false };
  } catch {
    return { ok: false, rejected: false };
  }
}

export function mask(key) {
  if (!key) return "(empty)";
  return key.slice(0, 4) + "…";
}
