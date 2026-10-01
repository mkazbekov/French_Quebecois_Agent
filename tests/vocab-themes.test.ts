import { describe, expect, it } from "vitest";
import { defaultLearnerState } from "@/lib/learner/defaults";
import { ProfileSchema, type LearnerState } from "@/lib/learner/schema";
import { MAX_CUSTOM_WORDS, VOCAB_THEMES, findTheme, parseCustomWords, suggestTheme, themeWordsFor } from "@/lib/learner/vocab-themes";

function stateAt(level: number): LearnerState {
  const state = defaultLearnerState("Sam");
  state.competencies.oral_production.level = level;
  return state;
}

describe("vocab themes", () => {
  it("has unique ids", () => {
    const ids = VOCAB_THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every theme has at least 12 words, levels 1-12 and no duplicate French", () => {
    for (const theme of VOCAB_THEMES) {
      expect(theme.words.length, theme.id).toBeGreaterThanOrEqual(12);
      for (const w of theme.words) {
        expect(w.level, `${theme.id}/${w.fr}`).toBeGreaterThanOrEqual(1);
        expect(w.level, `${theme.id}/${w.fr}`).toBeLessThanOrEqual(12);
      }
      const fr = theme.words.map((w) => w.fr.toLowerCase());
      expect(new Set(fr).size, theme.id).toBe(fr.length);
    }
  });

  it("themeWordsFor respects level + 1 and excludes known words", () => {
    const theme = VOCAB_THEMES[0];
    const state = stateAt(2);
    const words = themeWordsFor(theme, state, 100);
    expect(words.length).toBeGreaterThan(0);
    expect(words.every((w) => w.level <= 3)).toBe(true);
    const first = words[0];
    state.vocabulary.items.push({
      word: first.fr,
      status: "known",
      times_used_correctly: 3,
      times_struggled: 0,
    } as LearnerState["vocabulary"]["items"][number]);
    expect(themeWordsFor(theme, state, 100).some((w) => w.fr === first.fr)).toBe(false);
    expect(themeWordsFor(theme, state, 3).length).toBeLessThanOrEqual(3);
  });

  it("suggestTheme is deterministic and findTheme resolves ids", () => {
    const state = stateAt(3);
    expect(suggestTheme(state).id).toBe(suggestTheme(state).id);
    expect(findTheme(suggestTheme(state).id)).toBeDefined();
    expect(findTheme("nope")).toBeUndefined();
  });
});

describe("parseCustomWords", () => {
  it("splits on newline, comma and semicolon and dedups case-insensitively", () => {
    expect(parseCustomWords("un chat, Un Chat; la porte\nle chien\n\n")).toEqual(["un chat", "la porte", "le chien"]);
  });

  it("strips bullets and numbering but keeps '1er juillet'", () => {
    expect(parseCustomWords("- pomme\n1. poire\n2) fraise\n1er juillet")).toEqual(["pomme", "poire", "fraise", "1er juillet"]);
  });

  it("caps at the maximum", () => {
    const text = Array.from({ length: 100 }, (_, i) => `mot${i}`).join("\n");
    expect(parseCustomWords(text)).toHaveLength(MAX_CUSTOM_WORDS);
  });
});

describe("profile schema", () => {
  it("an old profile without vocab_focus parses with the default", () => {
    const state = defaultLearnerState("Sam");
    const old = JSON.parse(JSON.stringify(state.profile));
    delete old.preferences.vocab_focus;
    const parsed = ProfileSchema.parse(old) as LearnerState["profile"];
    expect(parsed.preferences.vocab_focus).toEqual({ source: "theme", theme_id: "", custom_words: [] });
  });
});
