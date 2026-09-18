import { describe, expect, it } from "vitest";
import { MemoryLearnerStore } from "@/lib/learner/memory-store";
import { applyReviewDelta } from "@/lib/learner/merge";
import { renderSessionRecordMarkdown } from "@/lib/learner/render";
import type { ReviewDelta, SessionEvidence } from "@/lib/learner/schema";
import { buildTutorInstructions } from "@/lib/tutor/instructions";

/**
 * End-to-end of the persistence loop without the LLM: session 1 produces a
 * review delta → merged → stored; session 2's tutor instructions must carry
 * that evidence (error id, focus, recent session record).
 */

function evidence(id: string): SessionEvidence {
  return {
    session_id: id,
    mode: "free",
    started_at: "2026-09-17T10:00:00.000Z",
    ended_at: "2026-09-17T10:12:00.000Z",
    transcript: [
      { role: "assistant", text: "Salut Sam ! Qu'est-ce que t'as fait hier ?" },
      { role: "user", text: "Hier j'ai allé au travail en métro." },
      { role: "assistant", text: "Ah, tu es allé au travail en métro. Quelle ligne ?" },
      { role: "user", text: "La ligne orange, avec une correspondance." },
    ],
    live_evidence: [{ kind: "grammar_error", observed: "j'ai allé", preferred: "je suis allé", note: "" }],
    disconnected: false,
  };
}

const delta1: ReviewDelta = {
  topics: ["yesterday's commute", "Montréal métro"],
  summary_for_learner: ["You described your commute clearly.", "Watch the auxiliary with aller: je suis allé."],
  errors: [
    {
      category: "grammar",
      pattern: "passé composé auxiliary: être vs avoir",
      observed: "j'ai allé au travail",
      preferred: "je suis allé au travail",
      explanation: "aller takes être in the passé composé",
      occurrences: 1,
      unit_id: "",
    },
  ],
  competencies: [
    { competency: "oral_production", observed_level: 3, strengths: ["simple past narration"], weaknesses: ["auxiliaries"], evidence_strength: 2 },
    { competency: "oral_comprehension", observed_level: 4, strengths: ["follows questions"], weaknesses: [], evidence_strength: 2 },
  ],
  vocabulary: [
    { word: "correspondance", meaning: "transfer (métro)", register: "standard", outcome: "used_correctly" },
    { word: "ligne orange", meaning: "orange line", register: "quebec", outcome: "introduced" },
  ],
  grammar: [{ point: "passé composé with être", outcome: "failure", note: "aller" }],
  pronunciation: [],
  errors_improving: [],
  units_practiced: [{ unit_id: "L3-G02", outcome: "struggled" }],
  suggested_focus: {
    unit_id: "L3-G02",
    current_focus: "Passé composé",
    reason: "Auxiliary errors with verbs of movement.",
    next_practice: "Talk for 10 minutes about yesterday in Montréal.",
    after: "Reassess passé composé usage.",
  },
  profile_notes: ["Commutes by métro on the orange line"],
};

describe("two sessions", () => {
  it("second session's instructions use evidence persisted from the first", async () => {
    const store = new MemoryLearnerStore("Sam");
    await store.init();

    // --- session 1 end ---
    const before = await store.load();
    // This test exercises the persistence loop, not placement; seed a learner
    // who was already placed so a "free" first session doesn't force mode "assessment".
    before.profile.placement = { status: "tested", level: 2, set_at: "2026-09-17T09:00:00.000Z" };
    const now = new Date("2026-09-17T10:12:30.000Z");
    const { state: after, summary } = applyReviewDelta(before, delta1, evidence("s1"), now);
    await store.save(after);
    await store.addSessionRecord({
      session_id: "s1",
      date: now.toISOString(),
      markdown: renderSessionRecordMarkdown(delta1, summary, evidence("s1"), now),
    });

    expect(summary.recurring_issues).toEqual([]); // frequency 1 is not recurring yet
    expect(summary.new_vocabulary).toContain("ligne orange");
    expect(after.errors.items[0].id).toBe("ERROR-001");
    expect(after.profile.sessions_completed).toBe(1);

    // --- session 2 start ---
    const reloaded = await store.load();
    const records = await store.recentSessionRecords(3);
    const { instructions, mode } = buildTutorInstructions({
      state: reloaded,
      mode: "auto",
      recentRecords: records,
      now: new Date("2026-09-18T09:00:00.000Z"),
    });

    expect(mode).toBe("guided"); // sessions_completed = 1 → guided
    expect(instructions).toContain("ERROR-001");
    expect(reloaded.roadmap.current_unit).toBe("L3-G02"); // pulled forward by the reviewer
    expect(instructions).toContain("Current unit: L3-G02");
    expect(instructions).toContain("Auxiliary errors with verbs of movement");
    expect(instructions).toContain("je suis allé au travail");
    expect(instructions).toContain("ligne orange (QC)");
    expect(instructions).toContain("Commutes by métro");
    expect(instructions).toContain("2026-09-17"); // recent session record
    expect(instructions).toContain("last one 1 day ago");
    expect(instructions).not.toContain("undefined");

    // --- session 2 end: same error again → recurring ---
    const delta2: ReviewDelta = { ...delta1, errors: [{ ...delta1.errors[0], occurrences: 2 }], vocabulary: [], grammar: [] };
    const r2 = applyReviewDelta(reloaded, delta2, evidence("s2"), new Date("2026-09-18T09:15:00.000Z"));
    expect(r2.state.errors.items).toHaveLength(1);
    expect(r2.state.errors.items[0].frequency).toBe(3);
    expect(r2.state.errors.items[0].status).toBe("recurring");
    expect(r2.summary.recurring_issues[0]).toContain("passé composé auxiliary");
    expect(r2.state.competencies.written_production.evidence_count).toBe(0);
  });
});
