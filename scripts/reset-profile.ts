import "dotenv/config";
import readline from "node:readline";
import path from "node:path";
import { env, lettaConfigured } from "../src/lib/env";

/**
 * Deletes everything stored for the current LEARNER_ID: the Letta agent
 * (french-tutor-<id>) or the local JSON file (data/learner-<id>.json). The
 * next `npm run dev` load shows onboarding again.
 *
 * Note: a running dev server caches its LearnerStore (and, for Letta, the
 * agent id) in a process-wide singleton. This script runs in a separate
 * process, so if `npm run dev` is running, restart it after this finishes.
 */
async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => rl.question(question, resolve));
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

async function main() {
  const skipPrompt = process.argv.includes("--yes") || process.argv.includes("-y");

  const target = lettaConfigured()
    ? `letta agent french-tutor-${env.LEARNER_ID}`
    : `file ${path.join(env.DATA_DIR, `learner-${env.LEARNER_ID}.json`)}`;
  console.log(`[reset-profile] this will permanently delete the ${target}`);

  if (!skipPrompt && process.stdin.isTTY) {
    const ok = await confirm("Delete this learner profile? [y/N] ");
    if (!ok) {
      console.log("Cancelled.");
      process.exit(0);
    }
  }

  const { getLearnerStore } = await import("../src/lib/learner");
  const store = await getLearnerStore();
  await store.reset();

  console.log("Learner profile deleted. Open http://localhost:3000 to onboard again.");
  console.log("Restart `npm run dev` if it is running.");
}

main().catch((err) => {
  console.error("[reset-profile] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
