/**
 * Proficiency scale: the Échelle québécoise des niveaux de compétence en
 * français des personnes immigrantes adultes (12 levels, 4 competencies),
 * with the approximate CEFR equivalent shown next to every level.
 *
 * Stages (Québec):  1–4 débutant · 5–8 intermédiaire · 9–12 avancé
 * CEFR (approx.):   1–2 A1 · 3–4 A2 · 5–6 B1 · 7–8 B2 · 9–10 C1 · 11–12 C2
 */

export const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
/** A level is a plain integer 1..12 (zod validates the range). */
export type Level = number;
export const MIN_LEVEL = 1;
export const MAX_LEVEL = 12;

export type Stage = "débutant" | "intermédiaire" | "avancé";

export function stageOf(level: number): Stage {
  if (level <= 4) return "débutant";
  if (level <= 8) return "intermédiaire";
  return "avancé";
}

export function cefrEquivalent(level: number): string {
  if (level <= 2) return "A1";
  if (level <= 4) return "A2";
  if (level <= 6) return "B1";
  if (level <= 8) return "B2";
  if (level <= 10) return "C1";
  return "C2";
}

/** "niveau 5 (≈ B1)" — the form used everywhere a level is shown or told to a model. */
export function formatLevel(level: number): string {
  return `niveau ${level} (≈ ${cefrEquivalent(level)})`;
}

export function clampLevel(n: number): Level {
  return Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Math.round(n)));
}

/**
 * Short descriptors per level, written for oral skills (the ones a voice call
 * can observe). Written skills follow the same scale when the learner types.
 * Condensed from the public Échelle québécoise descriptors; used to calibrate
 * both the tutor and the reviewer.
 */
export const LEVEL_DESCRIPTORS: Record<number, string> = {
  1: "Understands a few isolated words and set phrases spoken slowly (greetings, name, yes/no). Produces single words or memorised chunks; needs the support language for almost everything.",
  2: "Understands very short, simple questions about immediate needs when spoken slowly and repeated. Produces short memorised sentences (je m'appelle, j'habite à), lists, numbers; many pauses; heavy L1 influence.",
  3: "Understands simple, familiar exchanges (family, work, shopping, transport) with slower speech. Produces simple sentences in the present tense; some passé composé attempts; frequent errors that rarely block meaning.",
  4: "Understands the main point of short everyday exchanges at near-normal speed. Produces connected simple sentences about routine topics; uses present, passé composé and futur proche with errors; can ask for repetition in French.",
  5: "Understands a clear conversation on familiar topics, including some Québec expressions. Narrates past events and plans in sequence, gives simple opinions and reasons; still searches for words; tense and agreement errors persist.",
  6: "Understands most everyday conversations at normal speed and follows simple explanations. Sustains a conversation, describes experiences, handles routine work/service situations; uses imparfait/passé composé contrast with some errors.",
  7: "Understands detailed spoken French on familiar and some unfamiliar topics, including informal Québec speech. Argues a point, explains a process, uses the conditional and some subjunctive; errors are occasional and self-corrected.",
  8: "Understands extended speech, radio-style discussions, and rapid informal exchanges. Speaks fluently on most topics with precise vocabulary and only occasional errors; adjusts register (tu/vous, formal/informal).",
  9: "Understands nearly everything, including implicit meaning, humour and regional usage. Speaks with ease and nuance on abstract or professional topics; rare errors.",
  10: "Understands complex, fast, specialised speech. Produces well-structured, precise, idiomatic French, including the Québec register when appropriate.",
  11: "Near-native comprehension in all situations. Effortless, spontaneous, nuanced production; command of stylistic effects.",
  12: "Full command comparable to an educated native speaker of Québec French.",
};

export function describeScale(): string {
  return [
    "Scale: Échelle québécoise des niveaux de compétence en français (1–12). Stages: 1–4 débutant, 5–8 intermédiaire, 9–12 avancé. CEFR ≈ 1–2 A1, 3–4 A2, 5–6 B1, 7–8 B2, 9–10 C1, 11–12 C2.",
    ...LEVELS.map((l) => `${l} (≈ ${cefrEquivalent(l)}): ${LEVEL_DESCRIPTORS[l]}`),
  ].join("\n");
}
