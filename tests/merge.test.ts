import { describe, expect, it } from "vitest";
import { defaultLearnerState } from "@/lib/learner/defaults";
import { applyReviewDelta } from "@/lib/learner/merge";
import type { LearnerState, ReviewDelta, SessionEvidence } from "@/lib/learner/schema";

function baseEvidence(overrides: Partial<SessionEvidence> = {}): SessionEvidence {
  return {
    session_id: "sess-1",
    mode: "guided",
    started_at: "2026-01-01T10:00:00.000Z",
    ended_at: "2026-01-01T10:10:00.000Z", // 10 minutes
    transcript: [],
    live_evidence: [],
    disconnected: false,
    ...overrides,
  };
}

function emptyDelta(overrides: Partial<ReviewDelta> = {}): ReviewDelta {
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
    suggested_focus: {
      unit_id: "",
      current_focus: "Next focus",
      reason: "Because reasons.",
      next_practice: "Practice X.",
      after: "",
    },
    profile_notes: [],
    ...overrides,
  };
}

function freshState(): LearnerState {
  return defaultLearnerState("Test Learner");
}

const NOW = new Date("2026-02-01T12:00:00.000Z");

describe("applyReviewDelta - errors", () => {
  it("dedups a new error by normalized pattern", () => {
    const delta = emptyDelta({
      errors: [
        {
          category: "grammar",
          pattern: "  passé composé auxiliary  ",
          observed: "j'ai allé",
          preferred: "je suis allé",
          explanation: "être verb",
          occurrences: 2, unit_id: "",
        },
      ],
    });
    const { state } = applyReviewDelta(freshState(), delta, baseEvidence(), NOW);
    expect(state.errors.items).toHaveLength(1);
    expect(state.errors.items[0].frequency).toBe(2);
    expect(state.errors.items[0].status).toBe("new");
    expect(state.errors.items[0].id).toBe("ERROR-001");
  });

  it("matches an existing error by normalized pattern on a later session and sums frequency", () => {
    let state = freshState();
    const delta1 = emptyDelta({
      errors: [
        { category: "grammar", pattern: "passé composé auxiliary", observed: "j'ai allé", preferred: "je suis allé", explanation: "", occurrences: 1, unit_id: "" },
      ],
    });
    ({ state } = applyReviewDelta(state, delta1, baseEvidence(), NOW));

    const delta2 = emptyDelta({
      errors: [
        { category: "grammar", pattern: "Passé Composé Auxiliary", observed: "j'ai venu", preferred: "je suis venu", explanation: "", occurrences: 1, unit_id: "" },
      ],
    });
    const { state: state2 } = applyReviewDelta(state, delta2, baseEvidence(), NOW);

    expect(state2.errors.items).toHaveLength(1);
    expect(state2.errors.items[0].frequency).toBe(2);
  });

  it("marks status recurring once frequency reaches 3 across sessions", () => {
    let state = freshState();
    for (let i = 0; i < 3; i++) {
      const delta = emptyDelta({
        errors: [{ category: "grammar", pattern: "gender agreement", observed: "le table", preferred: "la table", explanation: "", occurrences: 1, unit_id: "" }],
      });
      ({ state } = applyReviewDelta(state, delta, baseEvidence(), NOW));
    }
    expect(state.errors.items[0].frequency).toBe(3);
    expect(state.errors.items[0].status).toBe("recurring");
  });

  it("a brand-new error record keeps status new even if occurrences is already >= 3", () => {
    const delta = emptyDelta({
      errors: [{ category: "grammar", pattern: "gender agreement", observed: "le table", preferred: "la table", explanation: "", occurrences: 3, unit_id: "" }],
    });
    const { state } = applyReviewDelta(freshState(), delta, baseEvidence(), NOW);
    expect(state.errors.items[0].status).toBe("new");
  });

  it("moves a new/recurring error not touched this session, listed in errors_improving, to improving then resolved", () => {
    let state = freshState();
    const delta1 = emptyDelta({
      errors: [{ category: "grammar", pattern: "gender agreement", observed: "le table", preferred: "la table", explanation: "", occurrences: 1, unit_id: "" }],
    });
    ({ state } = applyReviewDelta(state, delta1, baseEvidence(), NOW));
    const id = state.errors.items[0].id;
    expect(state.errors.items[0].status).toBe("new");

    // Session 2: the error was not made again, reviewer reports it as improving.
    const delta2 = emptyDelta({ errors_improving: [id] });
    ({ state } = applyReviewDelta(state, delta2, baseEvidence(), NOW));
    expect(state.errors.items[0].status).toBe("improving");

    // Session 3: still not made, reviewer reports it again -> resolved.
    const delta3 = emptyDelta({ errors_improving: [id] });
    ({ state } = applyReviewDelta(state, delta3, baseEvidence(), NOW));
    expect(state.errors.items[0].status).toBe("resolved");
  });

  it("does not apply errors_improving to an error that was touched this session", () => {
    let state = freshState();
    const delta1 = emptyDelta({
      errors: [{ category: "grammar", pattern: "gender agreement", observed: "le table", preferred: "la table", explanation: "", occurrences: 1, unit_id: "" }],
    });
    ({ state } = applyReviewDelta(state, delta1, baseEvidence(), NOW));
    const id = state.errors.items[0].id;

    // Same session also lists it in errors_improving (touched -> ignored).
    const delta2 = emptyDelta({
      errors: [{ category: "grammar", pattern: "gender agreement", observed: "le table", preferred: "la table", explanation: "", occurrences: 1, unit_id: "" }],
      errors_improving: [id],
    });
    const { state: state2 } = applyReviewDelta(state, delta2, baseEvidence(), NOW);
    expect(state2.errors.items[0].status).not.toBe("improving");
    expect(state2.errors.items[0].frequency).toBe(2);
  });
});

describe("applyReviewDelta - competencies", () => {
  it("leaves written competencies untouched when there are no observations for them", () => {
    const before = freshState();
    const delta = emptyDelta({
      competencies: [{ competency: "oral_production", observed_level: 4, strengths: [], weaknesses: [], evidence_strength: 3 }],
    });
    const { state } = applyReviewDelta(before, delta, baseEvidence(), NOW);
    expect(state.competencies.written_production).toEqual(before.competencies.written_production);
    expect(state.competencies.written_comprehension).toEqual(before.competencies.written_comprehension);
  });

  it("ignores observations with evidence_strength 0", () => {
    const before = freshState();
    const delta = emptyDelta({
      competencies: [{ competency: "oral_production", observed_level: 8, strengths: ["fluent"], weaknesses: [], evidence_strength: 0 }],
    });
    const { state } = applyReviewDelta(before, delta, baseEvidence(), NOW);
    expect(state.competencies.oral_production).toEqual(before.competencies.oral_production);
  });

  it("does not move level without enough evidence_count / observations", () => {
    const delta = emptyDelta({
      competencies: [{ competency: "oral_production", observed_level: 8, strengths: [], weaknesses: [], evidence_strength: 1 }],
    });
    const { state } = applyReviewDelta(freshState(), delta, baseEvidence(), NOW);
    // evidence_count now 1 (<3): level must stay at the default level 2.
    expect(state.competencies.oral_production.level).toBe(2);
    expect(state.competencies.oral_production.evidence_count).toBe(1);
  });

  it("moves level at most one step toward the median even with a large gap", () => {
    let state = freshState();
    // Three sessions reporting a much higher level than current (2 -> observed 8 repeatedly).
    for (let i = 0; i < 3; i++) {
      const delta = emptyDelta({
        competencies: [{ competency: "oral_production", observed_level: 8, strengths: [], weaknesses: [], evidence_strength: 1 }],
      });
      ({ state } = applyReviewDelta(state, delta, baseEvidence(), NOW));
    }
    // evidence_count is now 3, median of observations is 8, but level should have moved
    // by at most one level from 2 -> 3.
    expect(state.competencies.oral_production.level).toBe(3);
  });
});

describe("applyReviewDelta - vocabulary", () => {
  it("promotes a word to known after two correct uses with no more struggles than successes", () => {
    let state = freshState();
    const delta1 = emptyDelta({ vocabulary: [{ word: "dépanneur", meaning: "corner store", register: "quebec", outcome: "used_correctly" }] });
    ({ state } = applyReviewDelta(state, delta1, baseEvidence(), NOW));
    expect(state.vocabulary.items[0].status).toBe("shaky");

    const delta2 = emptyDelta({ vocabulary: [{ word: "dépanneur", meaning: "corner store", register: "quebec", outcome: "used_correctly" }] });
    ({ state } = applyReviewDelta(state, delta2, baseEvidence(), NOW));
    expect(state.vocabulary.items[0].status).toBe("known");
    expect(state.vocabulary.items[0].times_used_correctly).toBe(2);
  });

  it("marks a struggled word as shaky and creates it if new", () => {
    const delta = emptyDelta({ vocabulary: [{ word: "frette", meaning: "cold", register: "quebec", outcome: "struggled" }] });
    const { state } = applyReviewDelta(freshState(), delta, baseEvidence(), NOW);
    expect(state.vocabulary.items[0].status).toBe("shaky");
    expect(state.vocabulary.items[0].times_struggled).toBe(1);
  });

  it("creates an introduced word with status target", () => {
    const delta = emptyDelta({ vocabulary: [{ word: "magasiner", meaning: "to shop", register: "quebec", outcome: "introduced" }] });
    const { state } = applyReviewDelta(freshState(), delta, baseEvidence(), NOW);
    expect(state.vocabulary.items[0].status).toBe("target");
  });
});

describe("applyReviewDelta - grammar", () => {
  it("marks a grammar point solid once successes >= 4 and successes >= 3x failures", () => {
    let state = freshState();
    for (let i = 0; i < 4; i++) {
      const delta = emptyDelta({ grammar: [{ point: "passé composé with être", outcome: "success", note: "" }] });
      ({ state } = applyReviewDelta(state, delta, baseEvidence(), NOW));
    }
    expect(state.grammar.items[0].status).toBe("solid");
    expect(state.grammar.items[0].successes).toBe(4);
  });

  it("stays practicing when failures are too high relative to successes", () => {
    let state = freshState();
    for (let i = 0; i < 4; i++) {
      const delta = emptyDelta({ grammar: [{ point: "subjunctive", outcome: "success", note: "" }] });
      ({ state } = applyReviewDelta(state, delta, baseEvidence(), NOW));
    }
    for (let i = 0; i < 2; i++) {
      const delta = emptyDelta({ grammar: [{ point: "subjunctive", outcome: "failure", note: "" }] });
      ({ state } = applyReviewDelta(state, delta, baseEvidence(), NOW));
    }
    const delta = emptyDelta({ grammar: [{ point: "subjunctive", outcome: "failure", note: "still confusing the trigger verbs" }] });
    ({ state } = applyReviewDelta(state, delta, baseEvidence(), NOW));
    // successes=4, failures=3: 4 >= 3*3=9 is false -> practicing, not solid.
    expect(state.grammar.items[0].status).toBe("practicing");
    expect(state.grammar.items[0].notes).toBe("still confusing the trigger verbs");
  });
});

describe("applyReviewDelta - roadmap", () => {
  it("caps recent_topics at 12, keeping the newest", () => {
    let state = freshState();
    for (let i = 0; i < 5; i++) {
      const delta = emptyDelta({ topics: [`topic-${i}-a`, `topic-${i}-b`, `topic-${i}-c`] });
      ({ state } = applyReviewDelta(state, delta, baseEvidence(), NOW));
    }
    expect(state.roadmap.recent_topics.length).toBeLessThanOrEqual(12);
    expect(state.roadmap.recent_topics.at(-1)).toBe("topic-4-c");
  });

  it("fills the queue from the syllabus and never lists the current unit in it", () => {
    const state = freshState();
    const { state: after } = applyReviewDelta(state, emptyDelta(), baseEvidence(), NOW);
    expect(after.roadmap.current_unit).toBe("L1-F01");
    expect(after.roadmap.current_focus).toContain("L1-F01");
    expect(after.roadmap.queue.length).toBe(6);
    expect(after.roadmap.queue.join(" ")).not.toContain("L1-F01");
    expect(after.roadmap.queue[0]).toContain("L1-T01");
  });
});

describe("applyReviewDelta - profile & progress", () => {
  it("increments sessions_completed and accumulates minutes", () => {
    const { state } = applyReviewDelta(freshState(), emptyDelta(), baseEvidence(), NOW);
    expect(state.profile.sessions_completed).toBe(1);
    expect(state.profile.total_minutes).toBe(10);
  });

  it("prepends a progress entry with a composed delta sentence", () => {
    const delta = emptyDelta({
      errors: [{ category: "grammar", pattern: "x", observed: "a", preferred: "b", explanation: "", occurrences: 1, unit_id: "" }],
      topics: ["greetings"],
      summary_for_learner: ["Good energy today."],
    });
    const { state, progressEntry } = applyReviewDelta(freshState(), delta, baseEvidence(), NOW);
    expect(state.progress.entries[0]).toEqual(progressEntry);
    expect(progressEntry.delta).toContain("new error");
    expect(progressEntry.highlights).toEqual(["Good energy today."]);
  });
});
