import "dotenv/config";
import { spawnSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { lettaConfigured } from "../src/lib/env";

/**
 * End-to-end persistence check: write a distinctive mutation through the
 * store in this process, then read it back from a completely separate
 * process to prove it actually reached durable storage (not just an
 * in-memory cache).
 */
async function main() {
  // Keep a plain file-store run from polluting the real ./data directory.
  if (!lettaConfigured()) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "verify-persistence-"));
    process.env.DATA_DIR = tmpDir;
  }

  const { getLearnerStore } = await import("../src/lib/learner");

  const store = await getLearnerStore();
  await store.init();

  const marker = `verify-${Date.now()}`;
  const state = await store.load();
  const now = new Date();

  const mutated = structuredClone(state);
  mutated.errors.items.push({
    id: `ERROR-${String(mutated.errors.next_id).padStart(3, "0")}`,
    category: "grammar",
    pattern: marker,
    observed: "(verify script)",
    preferred: "(verify script)",
    explanation: "Synthetic record written by scripts/verify-persistence.ts",
    frequency: 1,
    first_observed: now.toISOString(),
    last_observed: now.toISOString(),
    status: "new",
  });
  mutated.errors.next_id += 1;
  mutated.profile.sessions_completed += 1;

  await store.save({ errors: mutated.errors, profile: mutated.profile });
  await store.addSessionRecord({
    session_id: `verify-${marker}`,
    date: now.toISOString(),
    markdown: `# Persistence verification\nMarker: ${marker}`,
  });

  console.log(`[verify] wrote marker "${marker}" via ${store.kind} store, spawning child to re-read...`);

  const child = spawnSync("npx", ["tsx", "scripts/verify-persistence-child.ts", marker], {
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });

  // Best-effort cleanup: remove the synthetic error and undo the counter bump.
  try {
    const cleanupState = await store.load();
    cleanupState.errors.items = cleanupState.errors.items.filter((e) => e.pattern !== marker);
    cleanupState.profile.sessions_completed = Math.max(0, cleanupState.profile.sessions_completed - 1);
    await store.save({ errors: cleanupState.errors, profile: cleanupState.profile });
  } catch (err) {
    console.warn("[verify] cleanup failed (best effort, ignoring):", err instanceof Error ? err.message : err);
  }

  if (child.status === 0) {
    console.log(`PERSISTENCE VERIFIED via ${store.kind}`);
    process.exit(0);
  } else {
    console.error("PERSISTENCE FAILED");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("PERSISTENCE FAILED");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
