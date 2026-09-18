import { describe, expect, it } from "vitest";
import { defaultLearnerState } from "@/lib/learner/defaults";
import { CONFIDENCE_DECAY_PER_SESSION, applyReviewDelta } from "@/lib/learner/merge";
import type { ErrorRecord, LearnerState, ReviewDelta, SessionEvidence } from "@/lib/learner/schema";
import { dueItems, isDue, recurringDue, vocabIntervalDays } from "@/lib/learner/spacing";
import { matchUnitForError } from "@/lib/learner/syllabus";
import { LOW_CONFIDENCE, buildTutorInstructions, resolveMode } from "@/lib/tutor/instructions";

const NOW = new Date("2026-09-18T12:00:00.000Z");
const DAY = 86_400_000;
const later = (days: number) => new Date(NOW.getTime() + days * DAY);

function evidence(mode: SessionEvidence["mode"] = "guided"): SessionEvidence {
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

function placed(): LearnerState {
  const s = defaultLearnerState("Mirza");
  s.profile.sessions_completed = 3;
  s.competencies.oral_production.confidence = 0.5;
  s.competencies.oral_comprehension.confidence = 0.5;
  return s;
}

function recurringError(id: string, pattern: string, unit_id = "", next_review: string | null = null): ErrorRecord {
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
    unit_id,
    next_review,
  };
}

const auxError = () => ({
  category: "grammar" as const,
  pattern: "passé composé auxiliary: être vs avoir",
  observed: "j'ai allé",
  preferred: "je suis allé",
  explanation: "",
  occurrences: 1,
  unit_id: "",
});

describe("errors map to the syllabus unit that fixes them", () => {
  it("uses the reviewer's unit id when valid, else a keyword match, and never a bogus id", () => {
    let state = placed();
    ({ state } = applyReviewDelta(state, delta({ errors: [{ ...auxError(), unit_id: "L3-G02" }] }), evidence(), NOW));
    expect(state.errors.items[0].unit_id).toBe("L3-G02");

    let s2 = placed();
    ({ state: s2 } = applyReviewDelta(s2, delta({ errors: [auxError()] }), evidence(), NOW));
    expect(s2.errors.items[0].unit_id).toBe("L3-G02"); // keyword "être vs avoir"

    let s3 = placed();
    ({ state: s3 } = applyReviewDelta(s3, delta({ errors: [{ ...auxError(), pattern: "something nobody teaches", unit_id: "L99-X01" }] }), evidence(), NOW));
    expect(s3.errors.items[0].unit_id).toBe("");
    expect(matchUnitForError("gender agreement of articles")?.id).toBe("L1-G02");
  });

  it("a recurring error pulls its unit forward ahead of program order", () => {
    let state = placed();
    for (let i = 0; i < 3; i++) ({ state } = applyReviewDelta(state, delta({ errors: [auxError()] }), evidence(), NOW));
    expect(state.errors.items[0].status).toBe("recurring");
    expect(state.roadmap.current_unit).toBe("L3-G02");
    expect(state.roadmap.reason).toContain("ERROR-001");
    // still first in program order otherwise
    expect(applyReviewDelta(placed(), delta(), evidence(), NOW).state.roadmap.current_unit).toBe("L1-F01");
  });
});

describe("spaced review", () => {
  it("dates errors, words and finished units, and lists them once due", () => {
    let state = placed();
    ({ state } = applyReviewDelta(
      state,
      delta({
        errors: [auxError()],
        vocabulary: [{ word: "frette", meaning: "cold", register: "quebec", outcome: "struggled" }],
        units_practiced: [{ unit_id: "L1-F01", outcome: "practiced_ok" }],
      }),
      evidence(),
      NOW,
    ));
    ({ state } = applyReviewDelta(state, delta({ units_practiced: [{ unit_id: "L1-F01", outcome: "practiced_ok" }] }), evidence(), NOW));

    const err = state.errors.items[0];
    const word = state.vocabulary.items[0];
    const unit = state.roadmap.units.find((u) => u.id === "L1-F01")!;
    expect(isDue(err.next_review, later(1))).toBe(false);
    expect(isDue(err.next_review, later(2))).toBe(true); // new error: 2 days
    expect(isDue(word.next_review, later(1))).toBe(true); // struggled: 1 day
    expect(unit.status).toBe("done");
    expect(unit.interval_days).toBe(14);
    expect(isDue(unit.next_review, later(13))).toBe(false);
    expect(isDue(unit.next_review, later(14))).toBe(true);

    const due = dueItems(state, later(14));
    expect(due.errors.map((e) => e.id)).toEqual(["ERROR-001"]);
    expect(due.vocabulary.map((v) => v.word)).toEqual(["frette"]);
    expect(due.units.map((u) => u.unit.id)).toEqual(["L1-F01"]);

    const { instructions } = buildTutorInstructions({ state, mode: "free", recentRecords: [], now: later(14) });
    expect(instructions).toContain("DUE FOR REVIEW");
    expect(instructions).toContain("error [ERROR-001]");
    expect(instructions).toContain("unit L1-F01");
    expect(instructions).toContain("words: frette");
  });

  it("known words get doubling intervals; a finished unit that fails its review lapses", () => {
    expect(vocabIntervalDays({ status: "known", times_used_correctly: 2 })).toBe(4);
    expect(vocabIntervalDays({ status: "known", times_used_correctly: 5 })).toBe(32);
    expect(vocabIntervalDays({ status: "known", times_used_correctly: 9 })).toBe(60);
    expect(vocabIntervalDays({ status: "shaky", times_used_correctly: 9 })).toBe(1);

    let state = placed();
    const ok = delta({ units_practiced: [{ unit_id: "L1-F01", outcome: "practiced_ok" }] });
    ({ state } = applyReviewDelta(state, ok, evidence(), NOW));
    ({ state } = applyReviewDelta(state, ok, evidence(), NOW));
    ({ state } = applyReviewDelta(state, ok, evidence(), later(14))); // passed its review
    let unit = state.roadmap.units.find((u) => u.id === "L1-F01")!;
    expect(unit.status).toBe("done");
    expect(unit.interval_days).toBe(28);

    ({ state } = applyReviewDelta(state, delta({ units_practiced: [{ unit_id: "L1-F01", outcome: "struggled" }] }), evidence(), later(42)));
    unit = state.roadmap.units.find((u) => u.id === "L1-F01")!;
    expect(unit.status).toBe("in_progress");
    expect(unit.next_review).toBeNull();
    expect(state.roadmap.current_unit).toBe("L1-F01"); // back in the program
  });
});

describe("remediation and level-check triggers", () => {
  it("drills when two recurring errors are due, but never twice in a row", () => {
    const state = placed();
    state.errors.items.push(recurringError("ERROR-001", "a"), recurringError("ERROR-002", "b"));
    expect(recurringDue(state, NOW)).toHaveLength(2);
    expect(resolveMode("auto", state, NOW)).toBe("remediation");

    state.progress.entries.unshift({ session_id: "x", date: NOW.toISOString(), mode: "remediation", minutes: 10, topics: [], highlights: [], delta: "" });
    expect(resolveMode("auto", state, NOW)).not.toBe("remediation");

    const one = placed();
    one.errors.items.push(recurringError("ERROR-001", "a"));
    expect(resolveMode("auto", one, NOW)).not.toBe("remediation");

    const notYet = placed();
    notYet.errors.items.push(recurringError("ERROR-001", "a", "", later(5).toISOString()), recurringError("ERROR-002", "b", "", later(5).toISOString()));
    expect(resolveMode("auto", notYet, NOW)).not.toBe("remediation");
    expect(resolveMode("auto", notYet, later(6))).toBe("remediation");

    const { instructions } = buildTutorInstructions({ state, mode: "remediation", recentRecords: [] });
    expect(instructions).toContain("MODE: Remediation drill");
  });

  it("confidence decays when a competency goes unobserved and a stale picture triggers a level check", () => {
    let state = placed();
    const before = state.competencies.oral_comprehension.confidence;
    ({ state } = applyReviewDelta(state, delta({ competencies: [{ competency: "oral_production", observed_level: 2, strengths: [], weaknesses: [], evidence_strength: 2 }] }), evidence(), NOW));
    expect(state.competencies.oral_comprehension.confidence).toBeCloseTo(before - CONFIDENCE_DECAY_PER_SESSION);
    expect(state.competencies.oral_production.confidence).toBeGreaterThan(0.1);

    const stale = placed();
    stale.competencies.oral_comprehension.confidence = LOW_CONFIDENCE - 0.01;
    expect(resolveMode("auto", stale, NOW)).toBe("assessment");
    stale.progress.entries.unshift({ session_id: "x", date: NOW.toISOString(), mode: "assessment", minutes: 10, topics: [], highlights: [], delta: "" });
    expect(resolveMode("auto", stale, NOW)).toBe("quebec"); // n=3 → third step of the cycle
  });
});
