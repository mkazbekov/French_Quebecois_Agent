import { describe, expect, it } from "vitest";
import { defaultLearnerState } from "@/lib/learner/defaults";
import { SESSION_MODES } from "@/lib/learner/schema";
import type { ErrorRecord, LearnerState } from "@/lib/learner/schema";
import { resolveMode } from "@/lib/tutor/instructions";
import { AUTO_COPY, MODE_COPY, MODE_ORDER, modeBlurb, modeLabel } from "@/lib/tutor/modes";

const NOW = new Date("2026-06-01T12:00:00.000Z");

function later(days: number): Date {
  return new Date(NOW.getTime() + days * 86_400_000);
}

function recurringError(id: string, pattern: string): ErrorRecord {
  return {
    id,
    category: "grammar",
    pattern,
    observed: "x",
    preferred: "y",
    explanation: "",
    frequency: 3,
    first_observed: NOW.toISOString(),
    last_observed: NOW.toISOString(),
    status: "recurring",
    unit_id: "",
    next_review: NOW.toISOString(),
  };
}

function selfSelectedState(sessionsCompleted: number): LearnerState {
  const state = defaultLearnerState("Sam");
  state.profile.sessions_completed = sessionsCompleted;
  state.profile.placement = { status: "self_selected", level: state.competencies.oral_production.level, set_at: NOW.toISOString() };
  // Confident enough that auto follows the cycle instead of calling another level check
  // (default confidence is 0, which is below LOW_CONFIDENCE) — as in instructions.test.ts.
  state.competencies.oral_production.confidence = 0.5;
  state.competencies.oral_comprehension.confidence = 0.5;
  return state;
}

describe("MODE_COPY / MODE_ORDER", () => {
  it("has an entry for every pickable session mode, no extras", () => {
    const schemaModes = SESSION_MODES.filter((m) => m !== "auto").slice().sort();
    const copyModes = Object.keys(MODE_COPY).sort();
    expect(copyModes).toEqual(schemaModes);
  });

  it("MODE_ORDER is exactly the MODE_COPY keys, no duplicates", () => {
    expect(new Set(MODE_ORDER).size).toBe(MODE_ORDER.length);
    expect(MODE_ORDER.slice().sort()).toEqual(Object.keys(MODE_COPY).sort());
  });

  it("every label and blurb is non-empty, and labels are unique", () => {
    const labels = Object.values(MODE_COPY).map((c) => c.label);
    for (const copy of Object.values(MODE_COPY)) {
      expect(copy.label.length).toBeGreaterThan(0);
      expect(copy.blurb.length).toBeGreaterThan(0);
      expect(copy.length.length).toBeGreaterThan(0);
    }
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("no label or blurb leaks another mode's raw internal key", () => {
    // A mode's own key may coincide with ordinary English used in its own approved copy
    // ("Guided practice", "Free conversation" — both verbatim per spec). What must never
    // happen is one mode's internal key leaking into a DIFFERENT mode's learner-facing
    // text (e.g. the jargon word "remediation" showing up in the "free" description).
    // Matched as a whole word so "correction" doesn't false-positive on "corrections".
    const internalKeys = SESSION_MODES.filter((m) => m !== "auto");
    for (const [mode, copy] of Object.entries(MODE_COPY)) {
      for (const internal of internalKeys) {
        if (internal === mode) continue;
        const wholeWord = new RegExp(`\\b${internal}\\b`, "i");
        expect(copy.label).not.toMatch(wholeWord);
        expect(copy.blurb).not.toMatch(wholeWord);
      }
    }
  });

  it("modeLabel/modeBlurb('auto') return AUTO_COPY", () => {
    expect(modeLabel("auto")).toBe(AUTO_COPY.label);
    expect(modeBlurb("auto")).toBe(AUTO_COPY.blurb);
  });
});

describe("every mode resolveMode can return has copy", () => {
  it("a placement-pending default state resolves to a mode with copy", () => {
    const state = defaultLearnerState("Sam");
    const resolved = resolveMode("auto", state, NOW);
    expect(MODE_COPY[resolved]).toBeDefined();
  });

  it("self_selected states across the whole auto cycle resolve to modes with copy", () => {
    for (let n = 0; n <= 6; n++) {
      const state = selfSelectedState(n);
      const resolved = resolveMode("auto", state, NOW);
      expect(MODE_COPY[resolved]).toBeDefined();
    }
  });

  it("auto really does reach several different modes, each nameable to the learner", () => {
    // The picker promises "Tutor decides" will choose between practice, a lesson, a Québec
    // situation and a level check. Walk the cycle and assert it actually lands on all of
    // them — otherwise the option is advertising something the code never does.
    const reached = new Set<string>();
    for (let n = 0; n <= 6; n++) reached.add(resolveMode("auto", selfSelectedState(n), NOW));
    expect(reached).toEqual(new Set(["guided", "lesson", "quebec", "assessment"]));
    for (const mode of reached) expect(modeLabel(mode as keyof typeof MODE_COPY)).not.toBe(mode);
  });

  it("a shaky picture of the learner sends auto to a level check", () => {
    const state = selfSelectedState(1);
    state.competencies.oral_production.confidence = 0.1;
    expect(resolveMode("auto", state, NOW)).toBe("assessment");
    expect(MODE_COPY.assessment).toBeDefined();
  });

  it("a state with two recurring errors due resolves to remediation, which has copy", () => {
    const state = selfSelectedState(3);
    state.errors.items.push(recurringError("ERROR-001", "a"), recurringError("ERROR-002", "b"));
    const resolved = resolveMode("auto", state, later(1));
    expect(resolved).toBe("remediation");
    expect(MODE_COPY[resolved]).toBeDefined();
  });
});
