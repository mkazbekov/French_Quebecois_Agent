import type { Competency, LearnerState } from "./schema";

function emptyCompetency(level: Competency["level"]): Competency {
  return {
    level,
    confidence: 0.1,
    evidence_count: 0,
    strengths: [],
    weaknesses: [],
    last_assessed: null,
    recent_observations: [],
  };
}

/** Initial state for a brand-new learner. Only used the first time an agent is created. */
export function defaultLearnerState(name: string): LearnerState {
  return {
    profile: {
      name,
      native_languages: ["English", "Russian", "Uzbek", "Karakalpak"],
      goals: ["Practical spoken Montréal / Québec French for daily life"],
      preferences: { explanation_language: "en", correction_intensity: "light" },
      sessions_completed: 0,
      total_minutes: 0,
      first_session_at: null,
      last_session_at: null,
      notes: [],
    },
    competencies: {
      oral_production: emptyCompetency("A1"),
      oral_comprehension: emptyCompetency("A1"),
      written_production: emptyCompetency("A1"),
      written_comprehension: emptyCompetency("A1"),
    },
    errors: { next_id: 1, items: [] },
    vocabulary: { items: [] },
    grammar: { items: [] },
    pronunciation: { items: [] },
    roadmap: {
      current_focus: "Getting to know you: greetings, introductions, daily life",
      reason: "First session. The tutor needs a baseline of what you can already say.",
      next_practice: "Introduce yourself, say where you live in Montréal and what you do in a normal day.",
      after: "Estimate a starting level for oral production and comprehension.",
      queue: ["Greetings and small talk (Québec style)", "Present tense of common verbs", "Numbers, time, prices"],
      recent_topics: [],
      updated_at: null,
    },
    progress: { entries: [] },
  };
}
