import { describe, expect, it } from "vitest";
import { MemoryLearnerStore } from "@/lib/learner/memory-store";

describe("MemoryLearnerStore", () => {
  it("reset() wipes the profile back to fresh, un-onboarded defaults", async () => {
    const store = new MemoryLearnerStore("Grace");
    const state = await store.load();
    state.profile.onboarded_at = new Date().toISOString();
    state.profile.sessions_completed = 4;
    await store.save({ profile: state.profile });
    await store.addSessionRecord({ session_id: "s1", date: "2026-01-01T00:00:00.000Z", markdown: "first" });

    await store.reset();

    const reloaded = await store.load();
    expect(reloaded.profile.name).toBe("");
    expect(reloaded.profile.onboarded_at).toBeNull();
    expect(reloaded.profile.sessions_completed).toBe(0);
    expect(await store.recentSessionRecords(10)).toEqual([]);

    // save() after reset works
    const fresh = await store.load();
    fresh.profile.name = "Grace Again";
    await store.save({ profile: fresh.profile });
    expect((await store.load()).profile.name).toBe("Grace Again");
  });

  it("reset() then save(all cleared docs) keeps onboarded_at and drops session records (clear-history route path)", async () => {
    const store = new MemoryLearnerStore("Grace");
    const state = await store.load();
    state.profile.onboarded_at = "2026-01-01T00:00:00.000Z";
    state.profile.sessions_completed = 3;
    await store.save({ profile: state.profile });
    await store.addSessionRecord({ session_id: "s1", date: "2026-01-01T00:00:00.000Z", markdown: "first" });

    const cleared = { ...(await store.load()), profile: { ...state.profile, sessions_completed: 0 } };
    await store.reset();
    await store.save(cleared);

    const reloaded = await store.load();
    expect(reloaded.profile.onboarded_at).toBe("2026-01-01T00:00:00.000Z");
    expect(reloaded.profile.sessions_completed).toBe(0);
    expect(await store.recentSessionRecords(10)).toEqual([]);
  });
});
