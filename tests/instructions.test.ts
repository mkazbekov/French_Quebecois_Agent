import { describe, expect, it } from "vitest";
import { defaultLearnerState } from "@/lib/learner/defaults";
import { buildTutorInstructions, resolveMode } from "@/lib/tutor/instructions";
import type { LearnerState } from "@/lib/learner/schema";

function stateWithSessions(n: number): LearnerState {
  const state = defaultLearnerState("Mirza");
  state.profile.sessions_completed = n;
  return state;
}

describe("resolveMode", () => {
  it("passes through explicit modes unchanged", () => {
    expect(resolveMode("free", stateWithSessions(0))).toBe("free");
    expect(resolveMode("correction", stateWithSessions(5))).toBe("correction");
  });

  it("resolves auto to free for the first session", () => {
    expect(resolveMode("auto", stateWithSessions(0))).toBe("free");
  });

  it("rotates auto between guided and a quebec session every third session", () => {
    // n % 3 === 2 -> quebec, otherwise guided (for n > 0)
    expect(resolveMode("auto", stateWithSessions(1))).toBe("guided");
    expect(resolveMode("auto", stateWithSessions(2))).toBe("quebec");
    expect(resolveMode("auto", stateWithSessions(3))).toBe("guided");
    expect(resolveMode("auto", stateWithSessions(5))).toBe("quebec");
  });
});

describe("buildTutorInstructions", () => {
  it("includes the learner name, recurring error ids, and the current focus", () => {
    const state = defaultLearnerState("Mirza");
    state.errors.items.push({
      id: "ERROR-001",
      category: "grammar",
      pattern: "gender agreement",
      observed: "le table",
      preferred: "la table",
      explanation: "table is feminine",
      frequency: 4,
      first_observed: "2026-01-01T00:00:00.000Z",
      last_observed: "2026-01-15T00:00:00.000Z",
      status: "recurring",
    });
    state.roadmap.current_focus = "Ordering food at a restaurant";

    const { instructions } = buildTutorInstructions({ state, mode: "auto", recentRecords: [] });

    expect(instructions).toContain("Mirza");
    expect(instructions).toContain("ERROR-001");
    expect(instructions).toContain("Ordering food at a restaurant");
  });

  it("never contains the literal string 'undefined'", () => {
    const state = defaultLearnerState("Mirza");
    const { instructions } = buildTutorInstructions({ state, mode: "auto", recentRecords: [] });
    expect(instructions).not.toContain("undefined");
  });

  it("never contains 'undefined' even with populated errors, vocab, grammar and pronunciation", () => {
    const state = defaultLearnerState("Mirza");
    state.errors.items.push({
      id: "ERROR-001",
      category: "vocabulary",
      pattern: "false friend",
      observed: "actuellement",
      preferred: "en ce moment",
      explanation: "",
      frequency: 1,
      first_observed: "2026-01-01T00:00:00.000Z",
      last_observed: "2026-01-01T00:00:00.000Z",
      status: "new",
    });
    state.vocabulary.items.push({ word: "dépanneur", meaning: "corner store", register: "quebec", status: "shaky", times_used_correctly: 0, times_struggled: 1, last_seen: "2026-01-01T00:00:00.000Z" });
    state.grammar.items.push({ point: "subjunctive", status: "practicing", notes: "", successes: 1, failures: 2, last_practiced: "2026-01-01T00:00:00.000Z" });
    state.pronunciation.items.push({ feature: "nasal vowels", example: "un bon vin blanc", frequency: 1, last_observed: "2026-01-01T00:00:00.000Z", status: "observed" });

    const { instructions } = buildTutorInstructions({ state, mode: "auto", recentRecords: [{ session_id: "s1", date: "2026-01-01T00:00:00.000Z", markdown: "did well" }] });
    expect(instructions).not.toContain("undefined");
  });
});
