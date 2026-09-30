import { describe, expect, it, vi } from "vitest";
import { DeviceLearnerStore, SESSIONS_KEY, STATE_KEY, type PreferencesLike } from "@/lib/device/device-store";

function memoryPrefs(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  const prefs: PreferencesLike = {
    get: async ({ key }) => ({ value: map.get(key) ?? null }),
    set: async ({ key, value }) => void map.set(key, value),
    remove: async ({ key }) => void map.delete(key),
  };
  return { prefs, map };
}

describe("DeviceLearnerStore", () => {
  it("loads defaults when nothing is stored", async () => {
    const store = new DeviceLearnerStore(memoryPrefs().prefs);
    expect(store.kind).toBe("device");
    const state = await store.load();
    expect(state.profile.name).toBe("");
    expect(state.profile.onboarded_at).toBeNull();
  });

  it("round-trips a save through a second store on the same preferences", async () => {
    const { prefs } = memoryPrefs();
    const a = new DeviceLearnerStore(prefs);
    const state = await a.load();
    state.profile.sessions_completed = 4;
    state.profile.notes.push("likes hockey");
    await a.save({ profile: state.profile });
    const b = await new DeviceLearnerStore(prefs).load();
    expect(b.profile.sessions_completed).toBe(4);
    expect(b.profile.notes).toContain("likes hockey");
  });

  it("falls back per document when one is invalid, keeping the others", async () => {
    const good = await new DeviceLearnerStore(memoryPrefs().prefs).load();
    good.profile.name = "Sam";
    const { prefs } = memoryPrefs({ [STATE_KEY]: JSON.stringify({ ...good, errors: { nonsense: true } }) });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const state = await new DeviceLearnerStore(prefs).load();
    expect(state.profile.name).toBe("Sam");
    expect(state.errors.items).toEqual([]);
  });

  it("survives a corrupt state string", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const store = new DeviceLearnerStore(memoryPrefs({ [STATE_KEY]: "{not json" }).prefs);
    expect((await store.load()).profile.sessions_completed).toBe(0);
  });

  it("keeps session records newest first, capped at 200", async () => {
    const { prefs, map } = memoryPrefs();
    const store = new DeviceLearnerStore(prefs);
    for (let i = 0; i < 205; i++) {
      await store.addSessionRecord({ session_id: `s${i}`, date: "2026-01-01T00:00:00Z", markdown: `m${i}` });
    }
    const recent = await store.recentSessionRecords(3);
    expect(recent.map((r) => r.session_id)).toEqual(["s204", "s203", "s202"]);
    expect(JSON.parse(map.get(SESSIONS_KEY)!)).toHaveLength(200);
  });

  it("does not lose writes that start at the same time", async () => {
    const store = new DeviceLearnerStore(memoryPrefs().prefs);
    const state = await store.load();
    await Promise.all([
      store.save({ profile: { ...state.profile, name: "Ana" } }),
      store.save({ roadmap: { ...state.roadmap, current_focus: "Les verbes" } }),
    ]);
    const after = await store.load();
    expect(after.profile.name).toBe("Ana");
    expect(after.roadmap.current_focus).toBe("Les verbes");
  });

  it("reset removes state and sessions", async () => {
    const { prefs, map } = memoryPrefs();
    const store = new DeviceLearnerStore(prefs);
    const state = await store.load();
    state.profile.name = "Sam";
    await store.save({ profile: state.profile });
    await store.addSessionRecord({ session_id: "s1", date: "2026-01-01T00:00:00Z", markdown: "m" });
    await store.reset();
    expect(map.size).toBe(0);
    expect((await store.load()).profile.name).toBe("");
    expect(await store.recentSessionRecords(5)).toEqual([]);
  });
});
