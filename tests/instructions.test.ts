import { describe, expect, it } from "vitest";
import { defaultLearnerState } from "@/lib/learner/defaults";
import { buildTutorInstructions, resolveMode } from "@/lib/tutor/instructions";
import type { LearnerState } from "@/lib/learner/schema";
import { VOCAB_THEMES, themeWordsFor } from "@/lib/learner/vocab-themes";

function stateWithSessions(n: number): LearnerState {
  const state = defaultLearnerState("Sam");
  state.profile.sessions_completed = n;
  // A learner who has been placed: enough confidence that auto mode follows the cycle.
  state.competencies.oral_production.confidence = 0.5;
  state.competencies.oral_comprehension.confidence = 0.5;
  if (n > 0) {
    state.profile.placement = { status: "tested", level: state.competencies.oral_production.level, set_at: "2026-01-01T00:00:00.000Z" };
  }
  return state;
}

describe("resolveMode", () => {
  it("passes through explicit modes unchanged", () => {
    expect(resolveMode("free", stateWithSessions(0))).toBe("free");
    expect(resolveMode("correction", stateWithSessions(5))).toBe("correction");
  });

  it("resolves auto to a placement level check for the first session", () => {
    expect(resolveMode("auto", stateWithSessions(0))).toBe("assessment");
  });

  it("then cycles practice, lesson, quebec, practice, lesson, level check", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((n) => resolveMode("auto", stateWithSessions(n)))).toEqual([
      "guided",
      "lesson",
      "quebec",
      "guided",
      "lesson",
      "assessment",
      "guided",
    ]);
  });
});

describe("placement note wording", () => {
  it("a first placement (no sessions yet) gets the PLACEMENT call wording", () => {
    const state = defaultLearnerState("Sam");
    const { instructions } = buildTutorInstructions({ state, mode: "assessment", recentRecords: [] });
    expect(instructions).toContain("This is the learner's PLACEMENT call");
    expect(instructions).not.toContain("LEVEL RE-CHECK");
  });

  it("a retaken placement after sessions gets the LEVEL RE-CHECK wording instead", () => {
    const state = defaultLearnerState("Sam");
    state.profile.sessions_completed = 4;
    const { instructions } = buildTutorInstructions({ state, mode: "assessment", recentRecords: [] });
    expect(instructions).toContain("LEVEL RE-CHECK");
    expect(instructions).not.toContain("This is the learner's PLACEMENT call");
  });
});

describe("buildTutorInstructions", () => {
  it("includes the learner name, recurring error ids, and the current focus", () => {
    const state = defaultLearnerState("Sam");
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
      unit_id: "",
      next_review: null,
    });
    state.roadmap.current_focus = "Ordering food at a restaurant";

    const { instructions } = buildTutorInstructions({ state, mode: "auto", recentRecords: [] });

    expect(instructions).toContain("Sam");
    expect(instructions).toContain("ERROR-001");
    expect(instructions).toContain("Ordering food at a restaurant");
  });

  it("mentions ask_choice in a lesson-mode prompt", () => {
    const state = defaultLearnerState("Sam");
    const { instructions } = buildTutorInstructions({ state, mode: "lesson", recentRecords: [] });
    expect(instructions).toContain("ask_choice");
  });

  it("never contains the literal string 'undefined'", () => {
    const state = defaultLearnerState("Sam");
    const { instructions } = buildTutorInstructions({ state, mode: "auto", recentRecords: [] });
    expect(instructions).not.toContain("undefined");
  });

  it("never contains 'undefined' even with populated errors, vocab, grammar and pronunciation", () => {
    const state = defaultLearnerState("Sam");
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
      unit_id: "",
      next_review: null,
    });
    state.vocabulary.items.push({ word: "dépanneur", meaning: "corner store", register: "quebec", status: "shaky", times_used_correctly: 0, times_struggled: 1, last_seen: "2026-01-01T00:00:00.000Z", next_review: null });
    state.grammar.items.push({ point: "subjunctive", status: "practicing", notes: "", successes: 1, failures: 2, last_practiced: "2026-01-01T00:00:00.000Z" });
    state.pronunciation.items.push({ feature: "nasal vowels", example: "un bon vin blanc", frequency: 1, last_observed: "2026-01-01T00:00:00.000Z", status: "observed" });

    const { instructions } = buildTutorInstructions({ state, mode: "auto", recentRecords: [{ session_id: "s1", date: "2026-01-01T00:00:00.000Z", markdown: "did well" }] });
    expect(instructions).not.toContain("undefined");
  });
});

import { BILINGUAL_SPEECH, resolveLanguageStage } from "@/lib/tutor/instructions";
import { defaultLearnerState as mkState } from "@/lib/learner/defaults";

describe("language stage", () => {
  it("beginners get English support by default", () => {
    const s = mkState("Sam");
    expect(resolveLanguageStage(s)).toBe("english_support");
    const { instructions } = buildTutorInstructions({ state: s, mode: "auto", recentRecords: [] });
    expect(instructions).toContain("LANGUAGE STAGE: English support");
    expect(instructions).toContain("say the same thing in English");
  });
  it("bilingual stages get the pronunciation rules, French-only does not", () => {
    const s = mkState("Sam");
    const build = () => buildTutorInstructions({ state: s, mode: "auto", recentRecords: [] }).instructions;
    expect(build()).toContain(BILINGUAL_SPEECH);
    s.profile.preferences.language_mode = "auto";
    s.competencies.oral_production.level = 4;
    expect(build()).toContain(BILINGUAL_SPEECH);
    s.profile.preferences.language_mode = "french_only";
    expect(build()).not.toContain("SPEAKING TWO LANGUAGES");
  });
  it("follows the oral level when auto, and the explicit preference otherwise", () => {
    const s = mkState("Sam");
    s.competencies.oral_production.level = 4;
    expect(resolveLanguageStage(s)).toBe("mixed");
    s.competencies.oral_production.level = 5;
    expect(resolveLanguageStage(s)).toBe("french_only");
    s.profile.preferences.language_mode = "english_support";
    expect(resolveLanguageStage(s)).toBe("english_support");
    s.profile.preferences.language_mode = "french_only";
    s.competencies.oral_production.level = 2;
    expect(resolveLanguageStage(s)).toBe("french_only");
    expect(buildTutorInstructions({ state: s, mode: "auto", recentRecords: [] }).instructions).toContain("LANGUAGE STAGE: French only");
  });
});

describe("vocabulary mode", () => {
  const build = (state: LearnerState, mode: "vocabulary" | "lesson" = "vocabulary") =>
    buildTutorInstructions({ state, mode, recentRecords: [] }).instructions;

  it("includes a VOCABULARY FOCUS block with the chosen theme's words", () => {
    const state = stateWithSessions(2);
    const theme = VOCAB_THEMES[1];
    state.profile.preferences.vocab_focus = { source: "theme", theme_id: theme.id, custom_words: [] };
    const text = build(state);
    expect(text).toContain("MODE: Vocabulary.");
    expect(text).toContain("VOCABULARY FOCUS");
    expect(text).toContain(theme.title);
    expect(text).toContain(themeWordsFor(theme, state, 10)[0].fr);
  });

  it("lists a custom list, sanitised, and notes the overflow", () => {
    const state = stateWithSessions(2);
    const words = Array.from({ length: 12 }, (_, i) => `mot${i}`);
    words[0] = "un\nchat   noir";
    state.profile.preferences.vocab_focus = { source: "custom", theme_id: "", custom_words: words };
    const text = build(state);
    expect(text).toContain("- un chat noir");
    expect(text).toContain("- mot9");
    expect(text).not.toContain("- mot10");
    expect(text).toContain("2 more");
  });

  it("is absent in other modes and never chosen by auto", () => {
    const state = stateWithSessions(2);
    expect(build(state, "lesson")).not.toContain("VOCABULARY FOCUS");
    for (let n = 0; n < 14; n++) expect(resolveMode("auto", stateWithSessions(n))).not.toBe("vocabulary");
    expect(resolveMode("vocabulary", state)).toBe("vocabulary");
  });
});
