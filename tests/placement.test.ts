import { describe, expect, it } from "vitest";
import { defaultLearnerState } from "@/lib/learner/defaults";
import { applyReviewDelta } from "@/lib/learner/merge";
import { PLACEMENT_CONFIDENCE, creditUnitsBelow, resetToPlacementTest, setStartingLevel } from "@/lib/learner/placement";
import { ProfileSchema } from "@/lib/learner/schema";
import type { LearnerState, ReviewDelta, SessionEvidence } from "@/lib/learner/schema";
import { SYLLABUS, pendingUnits } from "@/lib/learner/syllabus";
import { LOW_CONFIDENCE, resolveMode } from "@/lib/tutor/instructions";

const NOW = new Date("2026-09-18T12:00:00.000Z");

function evidence(mode: SessionEvidence["mode"] = "assessment"): SessionEvidence {
  return {
    session_id: "s",
    mode,
    started_at: "2026-09-18T11:40:00.000Z",
    ended_at: "2026-09-18T12:00:00.000Z",
    transcript: [],
    live_evidence: [],
    disconnected: false,
  };
}

function delta(overrides: Partial<ReviewDelta> = {}): ReviewDelta {
  return {
    topics: [],
    summary_for_learner: [],
    errors: [],
    competencies: [],
    vocabulary: [],
    grammar: [],
    pronunciation: [],
    errors_improving: [],
    units_practiced: [],
    suggested_focus: { unit_id: "", current_focus: "", reason: "", next_practice: "p", after: "" },
    profile_notes: [],
    ...overrides,
  };
}

describe("ProfileSchema placement migration", () => {
  it("a stored profile with sessions_completed > 0 and no placement field migrates to tested", () => {
    const raw = {
      name: "Alice",
      native_languages: ["English"],
      goals: [],
      preferences: {},
      sessions_completed: 4,
      total_minutes: 40,
      first_session_at: null,
      last_session_at: null,
      notes: [],
    };
    const parsed = ProfileSchema.parse(raw);
    expect(parsed.placement).toEqual({ status: "tested", level: null, set_at: null });
  });

  it("a stored profile with sessions_completed === 0 and no placement field migrates to pending", () => {
    const raw = {
      name: "Bob",
      native_languages: ["English"],
      goals: [],
      preferences: {},
      sessions_completed: 0,
      total_minutes: 0,
      first_session_at: null,
      last_session_at: null,
      notes: [],
    };
    const parsed = ProfileSchema.parse(raw);
    expect(parsed.placement).toEqual({ status: "pending", level: null, set_at: null });
  });

  it("leaves an existing placement field alone", () => {
    const raw = {
      name: "Carol",
      native_languages: ["English"],
      goals: [],
      preferences: {},
      sessions_completed: 2,
      total_minutes: 0,
      first_session_at: null,
      last_session_at: null,
      notes: [],
      placement: { status: "self_selected", level: 6, set_at: "2026-01-01T00:00:00.000Z" },
    };
    const parsed = ProfileSchema.parse(raw);
    expect(parsed.placement).toEqual({ status: "self_selected", level: 6, set_at: "2026-01-01T00:00:00.000Z" });
  });
});

describe("setStartingLevel", () => {
  it("sets all four competencies, credits units below the level, and points the roadmap at the first unit of that level", () => {
    const before = defaultLearnerState("Mirza");
    const after = setStartingLevel(before, 7, NOW);

    for (const key of ["oral_production", "oral_comprehension", "written_production", "written_comprehension"] as const) {
      expect(after.competencies[key].level).toBe(7);
      expect(after.competencies[key].confidence).toBeGreaterThanOrEqual(PLACEMENT_CONFIDENCE);
    }

    const belowCount = SYLLABUS.filter((u) => u.level < 7).length;
    const credited = after.roadmap.units.filter((u) => u.credited);
    expect(credited).toHaveLength(belowCount);
    expect(credited.every((u) => u.status === "done")).toBe(true);

    expect(after.roadmap.current_unit).toBe("L7-G01");
    expect(after.profile.placement).toEqual({ status: "self_selected", level: 7, set_at: NOW.toISOString() });
  });

  it("clamps out-of-range levels", () => {
    const after = setStartingLevel(defaultLearnerState("Mirza"), 99, NOW);
    expect(after.competencies.oral_production.level).toBe(12);
  });
});

describe("resetToPlacementTest", () => {
  it("returns competencies and roadmap to defaults, removes credited units, and marks placement pending", () => {
    const placed = setStartingLevel(defaultLearnerState("Mirza"), 7, NOW);
    const reset = resetToPlacementTest(placed);

    expect(reset.profile.placement).toEqual({ status: "pending", level: null, set_at: null });
    expect(reset.roadmap.units.some((u) => u.credited)).toBe(false);
    expect(reset.competencies.oral_production.level).toBe(2);
    expect(reset.roadmap.current_unit).toBeNull();
    // Profile identity/preferences preserved.
    expect(reset.profile.name).toBe("Mirza");
  });
});

describe("creditUnitsBelow", () => {
  it("drops previously credited entries before recomputing", () => {
    const oneRound = creditUnitsBelow([], 5);
    const belowFive = SYLLABUS.filter((u) => u.level < 5).length;
    expect(oneRound).toHaveLength(belowFive);

    const twoRounds = creditUnitsBelow(oneRound, 3);
    const belowThree = SYLLABUS.filter((u) => u.level < 3).length;
    expect(twoRounds).toHaveLength(belowThree);
  });

  it("does not touch a unit that was actually practised", () => {
    const practiced = [{ id: "L1-F01", status: "done" as const, credited: false, ok: 2, struggled: 0, last_practiced: NOW.toISOString(), next_review: null, interval_days: 14 }];
    const after = creditUnitsBelow(practiced, 5);
    const l1f01 = after.find((u) => u.id === "L1-F01")!;
    expect(l1f01.credited).toBe(false);
    expect(l1f01.ok).toBe(2);
  });
});

describe("resolveMode with placement", () => {
  it("a pending placement always resolves auto to assessment", () => {
    const state = defaultLearnerState("Mirza");
    expect(state.profile.placement.status).toBe("pending");
    expect(resolveMode("auto", state)).toBe("assessment");
  });

  it("a self-selected learner's first auto call (n=0) starts the cycle at guided", () => {
    const state = setStartingLevel(defaultLearnerState("Mirza"), 5, NOW);
    expect(state.profile.sessions_completed).toBe(0);
    expect(resolveMode("auto", state, NOW)).toBe("guided");
  });

  it("a tested learner's first auto call after placement (n=1) is guided", () => {
    const state = defaultLearnerState("Mirza");
    state.profile.sessions_completed = 1;
    state.profile.placement = { status: "tested", level: 2, set_at: NOW.toISOString() };
    state.competencies.oral_production.confidence = 0.5;
    state.competencies.oral_comprehension.confidence = 0.5;
    expect(resolveMode("auto", state, NOW)).toBe("guided");
  });
});

describe("applyReviewDelta - placement session", () => {
  it("a placement assessment jumps oral_production straight to the observed level and marks placement tested", () => {
    const before: LearnerState = defaultLearnerState("Mirza");
    expect(before.profile.placement.status).toBe("pending");

    const placementDelta = delta({
      competencies: [{ competency: "oral_production", observed_level: 8, strengths: [], weaknesses: [], evidence_strength: 2 }],
    });
    const { state: after } = applyReviewDelta(before, placementDelta, evidence("assessment"), NOW);

    expect(after.competencies.oral_production.level).toBe(8);
    expect(after.competencies.oral_production.confidence).toBeGreaterThanOrEqual(PLACEMENT_CONFIDENCE);
    expect(after.profile.placement).toEqual({ status: "tested", level: 8, set_at: NOW.toISOString() });

    // Unobserved competencies take the median of what was observed (just 8 here).
    expect(after.competencies.oral_comprehension.level).toBe(8);
    expect(after.competencies.written_production.level).toBe(8);
    expect(after.competencies.written_comprehension.level).toBe(8);

    // Units below the placed level are credited, so the program starts at level 8.
    const pending = pendingUnits(8, after.roadmap.units);
    expect(after.roadmap.current_unit).toBe(pending[0].id);
  });

  it("placement stays pending when the assessment observed nothing", () => {
    const before: LearnerState = defaultLearnerState("Mirza");
    const { state: after } = applyReviewDelta(before, delta(), evidence("assessment"), NOW);
    expect(after.profile.placement.status).toBe("pending");
    expect(after.competencies.oral_production.level).toBe(2);
  });

  it("a normal (non-placement) assessment still moves at most one level per session", () => {
    let state: LearnerState = defaultLearnerState("Mirza");
    state.profile.placement = { status: "tested", level: 2, set_at: "2026-01-01T00:00:00.000Z" };

    for (let i = 0; i < 3; i++) {
      const d = delta({
        competencies: [{ competency: "oral_production", observed_level: 8, strengths: [], weaknesses: [], evidence_strength: 1 }],
      });
      ({ state } = applyReviewDelta(state, d, evidence("assessment"), NOW));
    }
    expect(state.competencies.oral_production.level).toBe(3); // 2 -> 3, one step, despite three assessment sessions
    expect(state.profile.placement.status).toBe("tested"); // unchanged, was already tested
  });
});

describe("LOW_CONFIDENCE stays below PLACEMENT_CONFIDENCE", () => {
  it("so a single quiet session after placement does not immediately force another level check", () => {
    expect(PLACEMENT_CONFIDENCE).toBeGreaterThan(LOW_CONFIDENCE);
  });
});
