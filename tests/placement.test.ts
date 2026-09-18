import { describe, expect, it } from "vitest";
import { defaultLearnerState } from "@/lib/learner/defaults";
import { applyReviewDelta } from "@/lib/learner/merge";
import {
  PLACEMENT_CONFIDENCE,
  completeOnboarding,
  creditUnitsBelow,
  normalizeName,
  resetToPlacementTest,
  retakePlacement,
  setStartingLevel,
} from "@/lib/learner/placement";
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

describe("ProfileSchema onboarded_at migration", () => {
  it("a named profile with sessions_completed > 0 and no onboarded_at is treated as already onboarded", () => {
    const raw = {
      name: "Dana",
      native_languages: ["English"],
      goals: [],
      preferences: {},
      sessions_completed: 3,
      total_minutes: 30,
      first_session_at: "2026-01-01T00:00:00.000Z",
      last_session_at: "2026-01-10T00:00:00.000Z",
      notes: [],
    };
    const parsed = ProfileSchema.parse(raw);
    expect(parsed.onboarded_at).toBe("2026-01-10T00:00:00.000Z");
  });

  it("falls back to first_session_at, then 'migrated', when last_session_at is missing", () => {
    const raw = {
      name: "Dana",
      native_languages: ["English"],
      goals: [],
      preferences: {},
      sessions_completed: 1,
      total_minutes: 10,
      first_session_at: "2026-01-01T00:00:00.000Z",
      last_session_at: null,
      notes: [],
    };
    expect(ProfileSchema.parse(raw).onboarded_at).toBe("2026-01-01T00:00:00.000Z");

    const rawNoDates = { ...raw, first_session_at: null };
    expect(ProfileSchema.parse(rawNoDates).onboarded_at).toBe("migrated");
  });

  it("a blank-name or session-less profile is not considered onboarded", () => {
    const noName = {
      name: "",
      native_languages: [],
      goals: [],
      preferences: {},
      sessions_completed: 2,
      total_minutes: 20,
      first_session_at: null,
      last_session_at: null,
      notes: [],
    };
    expect(ProfileSchema.parse(noName).onboarded_at).toBeNull();

    const noSessions = { ...noName, name: "Eve", sessions_completed: 0 };
    expect(ProfileSchema.parse(noSessions).onboarded_at).toBeNull();
  });

  it("leaves an existing onboarded_at field alone", () => {
    const raw = {
      name: "Frank",
      native_languages: [],
      goals: [],
      preferences: {},
      sessions_completed: 0,
      total_minutes: 0,
      first_session_at: null,
      last_session_at: null,
      notes: [],
      onboarded_at: "2026-05-01T00:00:00.000Z",
    };
    expect(ProfileSchema.parse(raw).onboarded_at).toBe("2026-05-01T00:00:00.000Z");
  });
});

describe("normalizeName", () => {
  it("trims, collapses internal whitespace, and caps length", () => {
    expect(normalizeName("  Sam   Lee  ")).toBe("Sam Lee");
    expect(normalizeName("a".repeat(60))).toHaveLength(40);
  });
});

describe("completeOnboarding", () => {
  it("sets the name, applies the chosen level, and stamps onboarded_at", () => {
    const before = defaultLearnerState("");
    const after = completeOnboarding(before, { name: "  Sam  ", level: 6 }, NOW);

    expect(after.profile.name).toBe("Sam");
    expect(after.profile.onboarded_at).toBe(NOW.toISOString());
    expect(after.competencies.oral_production.level).toBe(6);
    expect(after.profile.placement.status).toBe("self_selected");
  });

  it("with level 'test', sets the name and leaves placement pending (fresh reset before any session)", () => {
    const before = defaultLearnerState("");
    const after = completeOnboarding(before, { name: "Sam", level: "test" }, NOW);

    expect(after.profile.name).toBe("Sam");
    expect(after.profile.onboarded_at).toBe(NOW.toISOString());
    expect(after.profile.placement).toEqual({ status: "pending", level: null, set_at: null });
  });
});

describe("retakePlacement", () => {
  it("before any session, fully resets competencies and roadmap (same as resetToPlacementTest)", () => {
    const placed = setStartingLevel(defaultLearnerState("Sam"), 7, NOW);
    const retaken = retakePlacement(placed);
    expect(retaken.profile.placement).toEqual({ status: "pending", level: null, set_at: null });
    expect(retaken.competencies.oral_production.level).toBe(2);
    expect(retaken.roadmap.units.some((u) => u.credited)).toBe(false);
  });

  it("after sessions, keeps competencies, roadmap and practised units untouched", () => {
    let state = setStartingLevel(defaultLearnerState("Sam"), 7, NOW);
    state = {
      ...state,
      profile: { ...state.profile, sessions_completed: 5 },
      roadmap: {
        ...state.roadmap,
        units: [
          ...state.roadmap.units,
          { id: "L7-G01", status: "done", credited: false, ok: 3, struggled: 0, last_practiced: NOW.toISOString(), next_review: null, interval_days: 7 },
        ],
      },
    };
    const retaken = retakePlacement(state);

    expect(retaken.profile.placement).toEqual({ status: "pending", level: null, set_at: null });
    expect(retaken.competencies.oral_production.level).toBe(7); // untouched
    expect(retaken.roadmap.current_unit).toBe(state.roadmap.current_unit); // untouched
    const practiced = retaken.roadmap.units.find((u) => u.id === "L7-G01");
    expect(practiced?.ok).toBe(3); // the practised unit itself is untouched
  });

  it("resolveMode then resolves the next auto call to assessment", () => {
    let state = setStartingLevel(defaultLearnerState("Sam"), 5, NOW);
    state = { ...state, profile: { ...state.profile, sessions_completed: 3 } };
    const retaken = retakePlacement(state);
    expect(resolveMode("auto", retaken, NOW)).toBe("assessment");
  });
});

describe("setStartingLevel changes level later without losing practised units", () => {
  it("keeps a unit that was actually practised after sessions have happened", () => {
    let state = setStartingLevel(defaultLearnerState("Sam"), 5, NOW);
    state = {
      ...state,
      profile: { ...state.profile, sessions_completed: 4 },
      roadmap: {
        ...state.roadmap,
        units: [
          ...state.roadmap.units,
          { id: "L5-G01", status: "done", credited: false, ok: 4, struggled: 1, last_practiced: NOW.toISOString(), next_review: "2026-10-01T00:00:00.000Z", interval_days: 14 },
        ],
      },
    };
    const after = setStartingLevel(state, 9, NOW);
    const practiced = after.roadmap.units.find((u) => u.id === "L5-G01");
    expect(practiced).toBeDefined();
    expect(practiced?.credited).toBe(false);
    expect(practiced?.ok).toBe(4);
    expect(practiced?.next_review).toBe("2026-10-01T00:00:00.000Z");
  });
});

describe("setStartingLevel", () => {
  it("sets all four competencies, credits units below the level, and points the roadmap at the first unit of that level", () => {
    const before = defaultLearnerState("Sam");
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
    const after = setStartingLevel(defaultLearnerState("Sam"), 99, NOW);
    expect(after.competencies.oral_production.level).toBe(12);
  });
});

describe("resetToPlacementTest", () => {
  it("returns competencies and roadmap to defaults, removes credited units, and marks placement pending", () => {
    const placed = setStartingLevel(defaultLearnerState("Sam"), 7, NOW);
    const reset = resetToPlacementTest(placed);

    expect(reset.profile.placement).toEqual({ status: "pending", level: null, set_at: null });
    expect(reset.roadmap.units.some((u) => u.credited)).toBe(false);
    expect(reset.competencies.oral_production.level).toBe(2);
    expect(reset.roadmap.current_unit).toBeNull();
    // Profile identity/preferences preserved.
    expect(reset.profile.name).toBe("Sam");
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
    const state = defaultLearnerState("Sam");
    expect(state.profile.placement.status).toBe("pending");
    expect(resolveMode("auto", state)).toBe("assessment");
  });

  it("a self-selected learner's first auto call (n=0) starts the cycle at guided", () => {
    const state = setStartingLevel(defaultLearnerState("Sam"), 5, NOW);
    expect(state.profile.sessions_completed).toBe(0);
    expect(resolveMode("auto", state, NOW)).toBe("guided");
  });

  it("a tested learner's first auto call after placement (n=1) is guided", () => {
    const state = defaultLearnerState("Sam");
    state.profile.sessions_completed = 1;
    state.profile.placement = { status: "tested", level: 2, set_at: NOW.toISOString() };
    state.competencies.oral_production.confidence = 0.5;
    state.competencies.oral_comprehension.confidence = 0.5;
    expect(resolveMode("auto", state, NOW)).toBe("guided");
  });
});

describe("applyReviewDelta - placement session", () => {
  it("a placement assessment jumps oral_production straight to the observed level and marks placement tested", () => {
    const before: LearnerState = defaultLearnerState("Sam");
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
    const before: LearnerState = defaultLearnerState("Sam");
    const { state: after } = applyReviewDelta(before, delta(), evidence("assessment"), NOW);
    expect(after.profile.placement.status).toBe("pending");
    expect(after.competencies.oral_production.level).toBe(2);
  });

  it("a normal (non-placement) assessment still moves at most one level per session", () => {
    let state: LearnerState = defaultLearnerState("Sam");
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
