import { describe, expect, it } from "vitest";
import { defaultLearnerState } from "@/lib/learner/defaults";
import { applyReviewDelta } from "@/lib/learner/merge";
import type { LearnerState, ReviewDelta, SessionEvidence } from "@/lib/learner/schema";
import { SYLLABUS, levelProgress, pendingUnits, unitsForLevel } from "@/lib/learner/syllabus";
import { buildTutorInstructions } from "@/lib/tutor/instructions";

const NOW = new Date("2026-09-18T12:00:00.000Z");

function evidence(): SessionEvidence {
  return {
    session_id: "s",
    mode: "lesson",
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

describe("syllabus content", () => {
  it("has unique ids, every level covered, and ids that encode their level", () => {
    const ids = SYLLABUS.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (let l = 1; l <= 12; l++) expect(unitsForLevel(l).length).toBeGreaterThan(0);
    for (const u of SYLLABUS) expect(u.id.startsWith(`L${u.level}-`)).toBe(true);
    // beginner/intermediate levels are the ones a learner spends time in: they must be substantial
    for (let l = 1; l <= 8; l++) expect(unitsForLevel(l).length).toBeGreaterThanOrEqual(7);
  });

  it("pending units come in program order and include one level up", () => {
    const pending = pendingUnits(2, []);
    expect(pending[0].id).toBe("L1-F01");
    expect(pending.some((u) => u.level === 3)).toBe(true);
    expect(pending.some((u) => u.level === 4)).toBe(false);
  });
});

describe("program progression (merge)", () => {
  it("starts at the first unit and follows program order across sessions", () => {
    let state: LearnerState = defaultLearnerState("Mirza");
    ({ state } = applyReviewDelta(state, delta(), evidence(), NOW));
    expect(state.roadmap.current_unit).toBe("L1-F01");

    // two good sessions on L1-F01 → done → program moves to L1-T01
    for (let i = 0; i < 2; i++) {
      ({ state } = applyReviewDelta(state, delta({ units_practiced: [{ unit_id: "L1-F01", outcome: "practiced_ok" }] }), evidence(), NOW));
    }
    expect(state.roadmap.units.find((u) => u.id === "L1-F01")?.status).toBe("done");
    expect(state.roadmap.current_unit).toBe("L1-T01");
    expect(levelProgress(1, state.roadmap.units)).toEqual({ done: 1, total: unitsForLevel(1).length });
  });

  it("does not mark a unit done while struggles outweigh successes", () => {
    let state: LearnerState = defaultLearnerState("Mirza");
    const practiced = (outcome: "practiced_ok" | "struggled") => delta({ units_practiced: [{ unit_id: "L1-F01", outcome }] });
    ({ state } = applyReviewDelta(state, practiced("practiced_ok"), evidence(), NOW));
    ({ state } = applyReviewDelta(state, practiced("struggled"), evidence(), NOW));
    ({ state } = applyReviewDelta(state, practiced("practiced_ok"), evidence(), NOW));
    // ok=2, struggled=1 → 2 >= 2*1 → done
    expect(state.roadmap.units.find((u) => u.id === "L1-F01")?.status).toBe("done");
    ({ state } = applyReviewDelta(state, delta({ units_practiced: [{ unit_id: "L1-T01", outcome: "practiced_ok" }, { unit_id: "L1-T01", outcome: "struggled" }] }), evidence(), NOW));
    ({ state } = applyReviewDelta(state, delta({ units_practiced: [{ unit_id: "L1-T01", outcome: "struggled" }] }), evidence(), NOW));
    // ok=1, struggled=2 → in_progress
    expect(state.roadmap.units.find((u) => u.id === "L1-T01")?.status).toBe("in_progress");
    expect(state.roadmap.current_unit).toBe("L1-T01");
  });

  it("lets the reviewer pull a pending unit forward but ignores unknown or finished ids", () => {
    let state: LearnerState = defaultLearnerState("Mirza");
    ({ state } = applyReviewDelta(state, delta({ suggested_focus: { unit_id: "L2-G03", current_focus: "", reason: "keeps dropping ne… pas", next_practice: "p", after: "" } }), evidence(), NOW));
    expect(state.roadmap.current_unit).toBe("L2-G03");
    expect(state.roadmap.reason).toBe("keeps dropping ne… pas");

    ({ state } = applyReviewDelta(state, delta({ suggested_focus: { unit_id: "L9-F01", current_focus: "", reason: "", next_practice: "p", after: "" } }), evidence(), NOW));
    expect(state.roadmap.current_unit).toBe("L1-F01"); // level 9 is out of reach: program order resumes

    ({ state } = applyReviewDelta(state, delta({ units_practiced: [{ unit_id: "NOPE-1", outcome: "practiced_ok" }] }), evidence(), NOW));
    expect(state.roadmap.units.some((u) => u.id === "NOPE-1")).toBe(false);
  });

  it("puts the program into the tutor prompt", () => {
    let state: LearnerState = defaultLearnerState("Mirza");
    ({ state } = applyReviewDelta(state, delta(), evidence(), NOW));
    const { instructions } = buildTutorInstructions({ state, mode: "lesson", recentRecords: [] });
    expect(instructions).toContain("PROGRAM");
    expect(instructions).toContain("Current unit: L1-F01 [function] Saluer et se présenter");
    expect(instructions).toContain("Coming up: L1-T01");
    expect(instructions).toMatch(/Progress at niveau 2 \(≈ A1\): 0\/\d+ units done/);
  });
});
