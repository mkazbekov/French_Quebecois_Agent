import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
// Zero-dependency launcher script (allowJs): imported directly, types inferred.
import { copyOver, deleteStale } from "../scripts/update.mjs";

/**
 * The updater runs on learners' machines and deletes files, so the rules that
 * keep it safe are pinned here: it never touches the key/progress/runtime, it
 * never overwrites a launcher that may be mid-execution, and it only removes
 * files a previous update installed — never anything the learner put there.
 */

const LAUNCHER = "Start Tutor (Windows).bat";

let root: string;
let src: string;
let dest: string;

function write(base: string, rel: string, content: string) {
  const p = path.join(base, ...rel.split("/"));
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, content, "utf8");
}

function read(base: string, rel: string) {
  return readFileSync(path.join(base, ...rel.split("/")), "utf8");
}

function has(base: string, rel: string) {
  return existsSync(path.join(base, ...rel.split("/")));
}

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "tutor-update-test-"));
  src = path.join(root, "new");
  dest = path.join(root, "install");
  mkdirSync(src, { recursive: true });
  mkdirSync(dest, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("update copyOver", () => {
  it("replaces app files but never the key, progress, runtime or node_modules", () => {
    write(src, "package.json", '{"version":"0.3.0"}');
    write(src, "src/app/page.tsx", "new page");
    write(src, ".env.example", "GEMINI_API_KEY=");

    write(dest, "package.json", '{"version":"0.2.0"}');
    write(dest, "src/app/page.tsx", "old page");
    write(dest, ".env", "GEMINI_API_KEY=secret");
    write(dest, "data/learner.json", '{"progress":true}');
    write(dest, ".runtime/node/node.exe", "binary");
    write(dest, "node_modules/next/index.js", "dep");

    copyOver(src, dest);

    expect(read(dest, "package.json")).toBe('{"version":"0.3.0"}');
    expect(read(dest, "src/app/page.tsx")).toBe("new page");
    expect(read(dest, ".env")).toBe("GEMINI_API_KEY=secret");
    expect(read(dest, "data/learner.json")).toBe('{"progress":true}');
    expect(read(dest, ".runtime/node/node.exe")).toBe("binary");
    expect(read(dest, "node_modules/next/index.js")).toBe("dep");
  });

  it("writes a changed launcher as .new instead of overwriting a file that may be running", () => {
    write(src, LAUNCHER, "@echo new launcher");
    write(dest, LAUNCHER, "@echo old launcher");

    copyOver(src, dest);

    expect(read(dest, LAUNCHER)).toBe("@echo old launcher");
    expect(read(dest, `${LAUNCHER}.new`)).toBe("@echo new launcher");
  });

  it("writes the launcher directly when it is missing, and skips the .new when unchanged", () => {
    write(src, LAUNCHER, "@echo same");
    copyOver(src, dest);
    expect(read(dest, LAUNCHER)).toBe("@echo same");
    expect(has(dest, `${LAUNCHER}.new`)).toBe(false);

    copyOver(src, dest);
    expect(has(dest, `${LAUNCHER}.new`)).toBe(false);
  });
});

describe("update deleteStale", () => {
  it("deletes only files a previous update installed that the new version dropped", () => {
    write(src, "package.json", "new");
    write(dest, "package.json", "old");
    write(dest, "src/lib/removed.ts", "gone in the new version");
    write(dest, "my-notes.txt", "the learner put this here");

    deleteStale(src, dest, ["package.json", "src/lib/removed.ts"]);

    expect(has(dest, "src/lib/removed.ts")).toBe(false);
    expect(has(dest, "my-notes.txt")).toBe(true);
    expect(has(dest, "package.json")).toBe(true);
  });

  it("deletes nothing at all without a manifest (first update, or a Git install)", () => {
    write(src, "package.json", "new");
    write(dest, "src/lib/removed.ts", "still here");
    write(dest, "my-notes.txt", "learner file");

    deleteStale(src, dest, null);

    expect(has(dest, "src/lib/removed.ts")).toBe(true);
    expect(has(dest, "my-notes.txt")).toBe(true);
  });

  it("never deletes preserved paths, launchers or pending .new files, even if listed", () => {
    write(dest, ".env", "GEMINI_API_KEY=secret");
    write(dest, "data/learner.json", "progress");
    write(dest, LAUNCHER, "@echo launcher");
    write(dest, `${LAUNCHER}.new`, "@echo pending");

    deleteStale(src, dest, [".env", "data/learner.json", LAUNCHER, `${LAUNCHER}.new`]);

    expect(has(dest, ".env")).toBe(true);
    expect(has(dest, "data/learner.json")).toBe(true);
    expect(has(dest, LAUNCHER)).toBe(true);
    expect(has(dest, `${LAUNCHER}.new`)).toBe(true);
  });

  it("ignores manifest entries that try to escape the install folder", () => {
    write(root, "outside.txt", "must survive");
    deleteStale(src, dest, ["../outside.txt", "", 42 as unknown as string]);
    expect(has(root, "outside.txt")).toBe(true);
  });
});
