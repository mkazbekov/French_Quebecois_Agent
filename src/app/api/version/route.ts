import { NextResponse } from "next/server";
import path from "node:path";
import { readLocalVersion, fetchRemoteVersion, isNewer } from "../../../../scripts/version.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// scripts/version.mjs has no type declarations (plain .mjs); the repo's
// tsconfig has allowJs: true so Next can still bundle and typecheck this
// import, but the values below need help from `any` at the boundary.
/* eslint-disable @typescript-eslint/no-explicit-any */

const repoRoot = path.join(process.cwd());

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

let cachedLatest: string | null = null;
let cachedAt = 0;

async function getLatestVersion(): Promise<string | null> {
  const now = Date.now();
  if (cachedAt && now - cachedAt < CACHE_TTL_MS) {
    return cachedLatest;
  }
  try {
    const { version } = await (fetchRemoteVersion as any)({ timeoutMs: 3000 });
    cachedLatest = version ?? null;
    cachedAt = now;
    return cachedLatest;
  } catch {
    // fetchRemoteVersion already swallows its own errors, but this route
    // must never throw regardless.
    return null;
  }
}

const HOW_TO_UPDATE =
  "Close the tutor window, then double-click the Quebec French Tutor icon again — it will offer the update.";

export async function GET() {
  const current = (readLocalVersion as any)(repoRoot) as string;

  let latest: string | null = null;
  try {
    latest = await getLatestVersion();
  } catch {
    latest = null;
  }

  const updateAvailable = Boolean(latest && (isNewer as any)(latest, current));

  return NextResponse.json({
    current,
    latest,
    updateAvailable,
    checkedAt: new Date().toISOString(),
    howToUpdate: HOW_TO_UPDATE,
  });
}
