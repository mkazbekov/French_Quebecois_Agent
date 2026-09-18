import "dotenv/config";
import { getLearnerStore } from "../src/lib/learner";

/**
 * Runs in a SEPARATE process from verify-persistence.ts. Opens its own
 * store (so it cannot see anything cached in the parent's memory) and
 * checks that the parent's mutation actually made it to durable storage.
 */
async function main() {
  const marker = process.argv[2];
  if (!marker) {
    console.error("[verify-child] missing marker argument");
    process.exit(1);
  }

  const store = await getLearnerStore();
  await store.init();
  const state = await store.load();

  const hasError = state.errors.items.some((e) => e.pattern === marker);
  if (!hasError) {
    console.error(`[verify-child] error with pattern "${marker}" not found after reload`);
    process.exit(1);
  }

  const records = await store.recentSessionRecords(20);
  const hasSession = records.some((r) => r.session_id.includes(marker) || r.markdown.includes(marker));
  if (!hasSession) {
    console.error(`[verify-child] session record containing marker "${marker}" not found after reload`);
    process.exit(1);
  }

  console.log(`[verify-child] found error and session record for marker "${marker}" via ${store.kind} store`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[verify-child] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
