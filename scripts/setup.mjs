#!/usr/bin/env node
// Zero-dependency interactive setup: gets a free Gemini API key into .env.
// Modes:
//   node scripts/setup.mjs              interactive, always runs
//   node scripts/setup.mjs --if-needed  silent no-op if a key is already set;
//                                        runs before every `npm run dev`
//
// Node ESM only: node:readline, node:fs, node:path, global fetch.
//
// Note: exits are done via `process.exitCode = N; return;` rather than
// `process.exit()`. Calling process.exit() while a readline interface on a
// piped/non-TTY stdin is mid-teardown can race libuv's handle close on
// Windows and crash the process natively. Setting exitCode and returning
// lets Node drain the event loop and exit on its own, which is safe.
//
// Note: prompts are read via a manual 'line'-event queue rather than
// readline/promises' rl.question(). With piped stdin, all buffered lines can
// arrive and be parsed into 'line' events before we're back around to ask for
// the next one (e.g. while awaiting the network key-verification call); a
// second question() call after that has nothing left to listen to and either
// throws or hangs. Queuing every line as it arrives means nothing is lost.

import { createInterface } from "node:readline";
import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseEnv, readEnvFile, setEnvVar, verifyGeminiKey, mask } from "./gemini-key.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(scriptDir, "..");

const args = process.argv.slice(2);
const ifNeeded = args.includes("--if-needed");
const envFileFlagIndex = args.indexOf("--env-file");
const envPath =
  envFileFlagIndex !== -1 && args[envFileFlagIndex + 1]
    ? path.resolve(args[envFileFlagIndex + 1])
    : path.join(repoRoot, ".env");
const envExamplePath = path.join(repoRoot, ".env.example");

const MAX_ATTEMPTS = 3;

/** A line reader that queues every 'line' event as it arrives, so buffered
 * piped input isn't lost while we're busy doing something else (like
 * awaiting a network call) between prompts. `ask()` resolves with the next
 * queued line, or null once input is exhausted / the interface is closed. */
function makeLineReader(rl) {
  const queue = [];
  const waiters = [];
  let closed = false;

  rl.on("line", (line) => {
    if (waiters.length) waiters.shift()(line);
    else queue.push(line);
  });
  rl.on("close", () => {
    closed = true;
    while (waiters.length) waiters.shift()(null);
  });

  function nextLine() {
    if (queue.length) return Promise.resolve(queue.shift());
    if (closed) return Promise.resolve(null);
    return new Promise((resolve) => waiters.push(resolve));
  }

  async function ask(prompt) {
    if (!closed) {
      rl.setPrompt(prompt);
      rl.prompt();
    }
    return nextLine();
  }

  return { ask, isClosed: () => closed };
}

function printNonInteractiveHint() {
  console.log("No Gemini API key found yet.");
  console.log("Run `npm run setup` to add one (it's free), or edit .env directly:");
  console.log("  GEMINI_API_KEY=<your key from https://aistudio.google.com/apikey>");
}

async function main() {
  const existingText = readEnvFile(envPath);

  if (ifNeeded) {
    if (existingText) {
      const { values } = parseEnv(existingText);
      const hasKey = Boolean(values.GEMINI_API_KEY?.trim()) || Boolean(values.OPENAI_API_KEY?.trim());
      if (hasKey) return;
    }
    if (!process.stdin.isTTY) {
      printNonInteractiveHint();
      return;
    }
    // TTY and no key: fall through to interactive flow.
  }

  // Ensure .env exists, seeded from .env.example.
  let text = existingText;
  if (text === null) {
    if (existsSync(envExamplePath)) {
      copyFileSync(envExamplePath, envPath);
      text = readFileSync(envPath, "utf8");
    } else {
      text = "";
    }
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const { ask } = makeLineReader(rl);
  let interrupted = false;
  const onSigint = () => {
    interrupted = true;
    rl.close();
  };
  rl.on("SIGINT", onSigint);

  try {
    console.log("");
    console.log("== Québec French Voice Tutor — setup ==");
    console.log("");
    console.log("You need a free Google Gemini API key to run the tutor:");
    console.log("  1. Open https://aistudio.google.com/apikey");
    console.log("  2. Sign in with a Google account");
    console.log('  3. Click "Create API key" and copy it');
    console.log("     (new keys start with \"AQ.\"; older keys start with \"AIza\" — either works)");
    console.log("");
    console.log("(To paste: right-click in this window, or press Ctrl+V — on a Mac, Cmd+V — then press Enter.)");

    let savedKey = null;
    let outOfInput = false;
    let failedAllAttempts = false;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const raw = await ask("Paste your Gemini API key: ");
      if (raw === null) {
        outOfInput = true;
        break;
      }
      const key = raw.trim().replace(/^['"]|['"]$/g, "");
      if (!key) {
        console.log("That was empty — please paste the key you copied.");
        attempt--; // an empty answer doesn't count as a real attempt
        continue;
      }

      console.log("Checking your key with Google…");
      const result = await verifyGeminiKey(key);
      if (result.ok) {
        console.log(`Key looks good (${mask(key)}).`);
        savedKey = key;
        break;
      }
      if (result.rejected) {
        console.log("Google rejected that key. Double-check you copied the whole thing.");
        if (attempt < MAX_ATTEMPTS) continue;
        console.log("");
        console.log("Still no luck after 3 tries. Get a fresh key at https://aistudio.google.com/apikey");
        console.log("and run `npm run setup` again, or add GEMINI_API_KEY to .env by hand.");
        failedAllAttempts = true;
        break;
      }
      console.log("Couldn't verify the key over the network (it may still be valid) — saving it anyway.");
      savedKey = key;
      break;
    }

    if (interrupted) {
      console.log("\nSetup cancelled. Nothing more was saved.");
      process.exitCode = 0;
      return;
    }
    if (outOfInput) {
      console.log("");
      console.log("No more input — stopping. Run `npm run setup` again when you have your key.");
      process.exitCode = 0;
      return;
    }
    if (failedAllAttempts) {
      process.exitCode = 1;
      return;
    }

    if (savedKey) {
      text = setEnvVar(text, "GEMINI_API_KEY", savedKey);
      writeFileSync(envPath, text, "utf8");
      console.log(`Saved GEMINI_API_KEY (${mask(savedKey)}) to .env`);
    }

    console.log("");
    if (ifNeeded) {
      console.log("Starting the tutor…");
    } else {
      console.log("All set. Your key is saved. Start the tutor with the \"Start Tutor\" launcher");
      console.log("(double-click it), or run npm run dev — it'll ask for your name and level the first time.");
    }
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error("Setup failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
