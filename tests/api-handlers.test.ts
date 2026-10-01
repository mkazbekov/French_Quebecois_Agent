import { describe, expect, it } from "vitest";
import { getFeedback } from "@/lib/api/feedback";
import { deleteLearner, getLearner, patchLearner } from "@/lib/api/learner";
import { startSession } from "@/lib/api/realtime-session";
import { endSession } from "@/lib/api/session-end";
import type { TutorConfig } from "@/lib/api/types";
import { deviceConfig } from "@/lib/device/local-api";
import { MemoryLearnerStore } from "@/lib/learner/memory-store";

const store = () => new MemoryLearnerStore("");
const config = (key?: string): TutorConfig => deviceConfig(key, "9.9.9");

describe("shared learner handler", () => {
  it("GET returns state, store kind and the planned mode", async () => {
    const res = await getLearner({ store: store() });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ storeKind: "memory", plannedMode: expect.any(String) });
  });

  it("PATCH onboarding sets the name and onboarded_at; bad bodies get 400", async () => {
    const s = store();
    const bad = await patchLearner({ nope: 1 }, { store: s });
    expect(bad.status).toBe(400);
    const empty = await patchLearner({ name: "   " }, { store: s });
    expect(empty.status).toBe(400);
    const res = await patchLearner({ onboarding: { name: " Sam ", level: 3 } }, { store: s });
    expect(res.status).toBe(200);
    const profile = (await s.load()).profile;
    expect(profile.name).toBe("Sam");
    expect(profile.onboarded_at).not.toBeNull();
  });

  it("PATCH vocab_focus saves a clean list and rejects an unknown theme id", async () => {
    const s = store();
    const res = await patchLearner({ vocab_focus: { source: "custom", theme_id: "", custom_words: ["- un chat, la porte", "un chat"] } }, { store: s });
    expect(res.status).toBe(200);
    expect((await s.load()).profile.preferences.vocab_focus).toEqual({ source: "custom", theme_id: "", custom_words: ["un chat", "la porte"] });
    const bad = await patchLearner({ vocab_focus: { source: "theme", theme_id: "nope", custom_words: [] } }, { store: s });
    expect(bad.status).toBe(400);
  });

  it("PATCH language_mode persists", async () => {
    const s = store();
    await patchLearner({ language_mode: "french_only" }, { store: s });
    expect((await s.load()).profile.preferences.language_mode).toBe("french_only");
  });

  it("DELETE ?scope=history keeps name and onboarding, plain DELETE wipes", async () => {
    const s = store();
    await patchLearner({ onboarding: { name: "Sam", level: 2 } }, { store: s });
    await deleteLearner("history", { store: s });
    const kept = await s.load();
    expect(kept.profile.name).toBe("Sam");
    expect(kept.profile.onboarded_at).not.toBeNull();
    await deleteLearner(null, { store: s });
    const wiped = await s.load();
    expect(wiped.profile.name).toBe("");
    expect(wiped.profile.onboarded_at).toBeNull();
  });
});

describe("shared session handlers", () => {
  it("startSession explains a missing Gemini key with the phone wording", async () => {
    const res = await startSession({}, { store: store(), config: config(undefined) });
    expect(res.status).toBe(500);
    expect((res.body as { error: string }).error).toContain("Change API key");
  });

  it("startSession mints a Gemini token with the configured key and model", async () => {
    const calls: Array<{ url: string; key: string | null }> = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url, key: new Headers(init?.headers).get("x-goog-api-key") });
      return new Response(JSON.stringify({ name: "auth_tokens/abc" }), { status: 200 });
    }) as typeof fetch;
    try {
      const res = await startSession({ mode: "auto" }, { store: store(), config: config("AIza-test") });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ provider: "gemini", gemini: { token: "auth_tokens/abc", model: "gemini-3.8-live" } });
      expect(calls[0].key).toBe("AIza-test");
      expect(JSON.stringify(res.body)).not.toContain("AIza-test");
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("endSession rejects bad evidence and skips reviews of too-short sessions", async () => {
    const s = store();
    expect((await endSession({ junk: true }, { store: s, config: config("k") })).status).toBe(400);
    const res = await endSession(
      {
        session_id: "x",
        mode: "free",
        started_at: new Date(Date.now() - 60_000).toISOString(),
        ended_at: new Date().toISOString(),
        transcript: [{ role: "user", text: "Salut" }],
        live_evidence: [],
        disconnected: false,
      },
      { store: s, config: config("k") },
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ persisted: false, reason: "too_short" });
  });

  it("getFeedback reports the platform and provider", () => {
    const res = getFeedback({ config: config("k") });
    expect(res.body).toMatchObject({ details: { version: "9.9.9", platform: "android", provider: "gemini" } });
  });
});
