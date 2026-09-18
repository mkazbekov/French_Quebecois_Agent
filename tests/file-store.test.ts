import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileLearnerStore } from "@/lib/learner/file-store";

let dataDir: string;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "file-store-test-"));
});

afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("FileLearnerStore", () => {
  it("creates the file on init and loads default state", async () => {
    const store = new FileLearnerStore({ dataDir, learnerId: "alice", learnerName: "Alice" });
    await store.init();
    expect(fs.existsSync(path.join(dataDir, "learner-alice.json"))).toBe(true);
    const state = await store.load();
    expect(state.profile.name).toBe("Alice");
    expect(state.profile.sessions_completed).toBe(0);
  });

  it("round-trips a save", async () => {
    const store = new FileLearnerStore({ dataDir, learnerId: "bob", learnerName: "Bob" });
    await store.init();
    const state = await store.load();
    state.profile.sessions_completed = 5;
    state.profile.notes.push("likes hockey");
    await store.save({ profile: state.profile });

    const store2 = new FileLearnerStore({ dataDir, learnerId: "bob", learnerName: "Bob" });
    const reloaded = await store2.load();
    expect(reloaded.profile.sessions_completed).toBe(5);
    expect(reloaded.profile.notes).toContain("likes hockey");
  });

  it("falls back to defaults when a document is corrupt", async () => {
    const filePath = path.join(dataDir, "learner-carol.json");
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        version: 1,
        state: { profile: { not: "valid" }, competencies: {}, errors: {}, vocabulary: {}, grammar: {}, pronunciation: {}, roadmap: {}, progress: {} },
        sessions: [],
      }),
    );
    const store = new FileLearnerStore({ dataDir, learnerId: "carol", learnerName: "Carol" });
    const state = await store.load();
    expect(state.profile.name).toBe("Carol");
    expect(state.profile.sessions_completed).toBe(0);
  });

  it("falls back to defaults entirely when the JSON itself is malformed", async () => {
    const filePath = path.join(dataDir, "learner-dave.json");
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(filePath, "{ not valid json");
    const store = new FileLearnerStore({ dataDir, learnerId: "dave", learnerName: "Dave" });
    const state = await store.load();
    expect(state.profile.name).toBe("Dave");
  });

  it("keeps session records newest first and caps at 200", async () => {
    const store = new FileLearnerStore({ dataDir, learnerId: "erin", learnerName: "Erin" });
    await store.init();
    await store.addSessionRecord({ session_id: "s1", date: "2026-01-01T00:00:00.000Z", markdown: "first" });
    await store.addSessionRecord({ session_id: "s2", date: "2026-01-02T00:00:00.000Z", markdown: "second" });
    const records = await store.recentSessionRecords(10);
    expect(records[0].session_id).toBe("s2");
    expect(records[1].session_id).toBe("s1");
  });
});
