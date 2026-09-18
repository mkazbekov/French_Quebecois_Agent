import { describe, expect, it } from "vitest";
import { cefrEquivalent, clampLevel, describeScale, formatLevel, stageOf } from "@/lib/learner/levels";
import { CompetencySchema, LevelSchema } from "@/lib/learner/schema";
import { defaultLearnerState } from "@/lib/learner/defaults";
import { buildTutorInstructions } from "@/lib/tutor/instructions";

describe("Échelle québécoise levels", () => {
  it("maps the 12 levels onto the CEFR bands", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(cefrEquivalent)).toEqual([
      "A1", "A1", "A2", "A2", "B1", "B1", "B2", "B2", "C1", "C1", "C2", "C2",
    ]);
    expect(stageOf(4)).toBe("débutant");
    expect(stageOf(5)).toBe("intermédiaire");
    expect(stageOf(9)).toBe("avancé");
    expect(formatLevel(5)).toBe("niveau 5 (≈ B1)");
  });

  it("clamps to 1..12 and the schema rejects anything outside", () => {
    expect(clampLevel(0)).toBe(1);
    expect(clampLevel(13)).toBe(12);
    expect(LevelSchema.safeParse(0).success).toBe(false);
    expect(LevelSchema.safeParse(13).success).toBe(false);
    expect(LevelSchema.safeParse(2.5).success).toBe(false);
    expect(LevelSchema.safeParse(7).success).toBe(true);
  });

  it("migrates competencies stored with the old CEFR strings", () => {
    const parsed = CompetencySchema.parse({
      level: "A1+",
      confidence: 0.3,
      evidence_count: 2,
      strengths: [],
      weaknesses: [],
      last_assessed: null,
      recent_observations: ["A1", "A2"],
    });
    expect(parsed.level).toBe(3);
    expect(parsed.recent_observations).toEqual([2, 4]);
  });

  it("describes every level once for the reviewer", () => {
    const text = describeScale();
    for (let l = 1; l <= 12; l++) expect(text).toMatch(new RegExp(`^${l} \\(≈ [ABC][12]\\): `, "m"));
  });
});

describe("tutor prompt pedagogy", () => {
  it("tells the tutor to wait, to teach grammar and vocabulary, and which level to push toward", () => {
    const state = defaultLearnerState("Mirza");
    const { instructions, mode } = buildTutorInstructions({ state, mode: "auto", recentRecords: [] });
    expect(mode).toBe("assessment");
    expect(instructions).toContain("PATIENCE AND TURN-TAKING");
    expect(instructions).toContain("Never speak over the learner");
    expect(instructions).toContain("teaching moment");
    expect(instructions).toContain("Current oral level niveau 2 (≈ A1)");
    expect(instructions).toContain("Next level niveau 3 (≈ A2)");
    expect(instructions).toContain("ALL FOUR competencies");
  });

  it("has a lesson mode that walks grammar then vocabulary", () => {
    const state = defaultLearnerState("Mirza");
    const { instructions } = buildTutorInstructions({ state, mode: "lesson", recentRecords: [] });
    expect(instructions).toContain("MODE: Lesson");
    expect(instructions).toContain("Grammar point");
    expect(instructions).toContain("Vocabulary: teach three to five");
  });

  it("does not offer a next level at the top of the scale", () => {
    const state = defaultLearnerState("Mirza");
    state.competencies.oral_production.level = 12;
    const { instructions } = buildTutorInstructions({ state, mode: "free", recentRecords: [] });
    expect(instructions).toContain("niveau 12 (≈ C2)");
    expect(instructions).not.toContain("Next level");
  });
});
