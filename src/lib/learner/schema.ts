import { z } from "zod";

/**
 * Canonical learner-state schema.
 *
 * Every document below is stored as one JSON memory block in Letta (label ==
 * document name). This file is the single definition of what the tutor
 * remembers. Anything not representable here is not remembered.
 */

export const CEFR_LEVELS = ["A0", "A1", "A1+", "A2", "A2+", "B1", "B1+", "B2", "B2+", "C1"] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];
export const CefrLevelSchema = z.enum(CEFR_LEVELS);

export const COMPETENCY_KEYS = [
  "oral_production",
  "oral_comprehension",
  "written_production",
  "written_comprehension",
] as const;
export type CompetencyKey = (typeof COMPETENCY_KEYS)[number];
export const CompetencyKeySchema = z.enum(COMPETENCY_KEYS);

export const SESSION_MODES = ["auto", "free", "guided", "correction", "assessment", "quebec"] as const;
export type SessionMode = (typeof SESSION_MODES)[number];
export const SessionModeSchema = z.enum(SESSION_MODES);

export const ERROR_CATEGORIES = [
  "grammar",
  "vocabulary",
  "pronunciation",
  "word_order",
  "comprehension",
  "quebec_usage",
] as const;
export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];
export const ErrorCategorySchema = z.enum(ERROR_CATEGORIES);

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export const ProfileSchema = z.object({
  name: z.string(),
  native_languages: z.array(z.string()),
  goals: z.array(z.string()),
  preferences: z.object({
    explanation_language: z.string().default("en"),
    correction_intensity: z.enum(["light", "medium", "high"]).default("light"),
  }),
  sessions_completed: z.number().int().nonnegative().default(0),
  total_minutes: z.number().nonnegative().default(0),
  first_session_at: z.string().nullable().default(null),
  last_session_at: z.string().nullable().default(null),
  notes: z.array(z.string()).default([]),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const CompetencySchema = z.object({
  level: CefrLevelSchema,
  /** 0..1, grows with evidence, decays slowly with time since last assessment. */
  confidence: z.number().min(0).max(1),
  evidence_count: z.number().int().nonnegative(),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  last_assessed: z.string().nullable(),
  /** Rolling window of recent level observations from reviews (max 8). */
  recent_observations: z.array(CefrLevelSchema).max(8).default([]),
});
export type Competency = z.infer<typeof CompetencySchema>;

export const CompetenciesSchema = z.object({
  oral_production: CompetencySchema,
  oral_comprehension: CompetencySchema,
  written_production: CompetencySchema,
  written_comprehension: CompetencySchema,
});
export type Competencies = z.infer<typeof CompetenciesSchema>;

export const ErrorRecordSchema = z.object({
  id: z.string(), // ERROR-001
  category: ErrorCategorySchema,
  /** Short stable label used for dedup, e.g. "passé composé auxiliary (être vs avoir)". */
  pattern: z.string(),
  observed: z.string(), // learner's actual utterance
  preferred: z.string(), // corrected form
  explanation: z.string().default(""),
  frequency: z.number().int().positive(),
  first_observed: z.string(),
  last_observed: z.string(),
  status: z.enum(["new", "recurring", "improving", "resolved"]),
});
export type ErrorRecord = z.infer<typeof ErrorRecordSchema>;

export const ErrorsSchema = z.object({
  next_id: z.number().int().positive().default(1),
  items: z.array(ErrorRecordSchema).default([]),
});
export type Errors = z.infer<typeof ErrorsSchema>;

export const VocabEntrySchema = z.object({
  word: z.string(),
  meaning: z.string().default(""),
  /** "quebec" marks Québec/Montréal usage worth distinguishing from international French. */
  register: z.enum(["standard", "quebec", "informal"]).default("standard"),
  status: z.enum(["known", "shaky", "target"]),
  times_used_correctly: z.number().int().nonnegative().default(0),
  times_struggled: z.number().int().nonnegative().default(0),
  last_seen: z.string().nullable().default(null),
});
export type VocabEntry = z.infer<typeof VocabEntrySchema>;

export const VocabularySchema = z.object({
  items: z.array(VocabEntrySchema).default([]),
});
export type Vocabulary = z.infer<typeof VocabularySchema>;

export const GrammarPointSchema = z.object({
  point: z.string(), // "passé composé with être"
  status: z.enum(["not_started", "introduced", "practicing", "solid"]),
  notes: z.string().default(""),
  successes: z.number().int().nonnegative().default(0),
  failures: z.number().int().nonnegative().default(0),
  last_practiced: z.string().nullable().default(null),
});
export type GrammarPoint = z.infer<typeof GrammarPointSchema>;

export const GrammarSchema = z.object({
  items: z.array(GrammarPointSchema).default([]),
});
export type Grammar = z.infer<typeof GrammarSchema>;

export const PronunciationIssueSchema = z.object({
  feature: z.string(), // "nasal vowels /ɑ̃/ vs /ɔ̃/"
  example: z.string().default(""),
  frequency: z.number().int().positive().default(1),
  last_observed: z.string(),
  status: z.enum(["observed", "recurring", "improving"]).default("observed"),
});
export type PronunciationIssue = z.infer<typeof PronunciationIssueSchema>;

export const PronunciationSchema = z.object({
  items: z.array(PronunciationIssueSchema).default([]),
});
export type Pronunciation = z.infer<typeof PronunciationSchema>;

export const RoadmapSchema = z.object({
  current_focus: z.string(),
  reason: z.string(),
  next_practice: z.string(),
  after: z.string().default(""),
  /** Upcoming focus candidates, most urgent first. */
  queue: z.array(z.string()).default([]),
  recent_topics: z.array(z.string()).max(12).default([]),
  updated_at: z.string().nullable().default(null),
});
export type Roadmap = z.infer<typeof RoadmapSchema>;

export const ProgressEntrySchema = z.object({
  session_id: z.string(),
  date: z.string(),
  mode: SessionModeSchema,
  minutes: z.number().nonnegative(),
  topics: z.array(z.string()),
  highlights: z.array(z.string()).default([]),
  /** Short human-readable note on what changed in the model. */
  delta: z.string().default(""),
});
export type ProgressEntry = z.infer<typeof ProgressEntrySchema>;

export const ProgressSchema = z.object({
  entries: z.array(ProgressEntrySchema).max(40).default([]),
});
export type Progress = z.infer<typeof ProgressSchema>;

export const LearnerStateSchema = z.object({
  profile: ProfileSchema,
  competencies: CompetenciesSchema,
  errors: ErrorsSchema,
  vocabulary: VocabularySchema,
  grammar: GrammarSchema,
  pronunciation: PronunciationSchema,
  roadmap: RoadmapSchema,
  progress: ProgressSchema,
});
export type LearnerState = z.infer<typeof LearnerStateSchema>;

export const LEARNER_DOCUMENTS = [
  "profile",
  "competencies",
  "errors",
  "vocabulary",
  "grammar",
  "pronunciation",
  "roadmap",
  "progress",
] as const satisfies ReadonlyArray<keyof LearnerState>;
export type LearnerDocument = (typeof LEARNER_DOCUMENTS)[number];

export const DOCUMENT_SCHEMAS: { [K in LearnerDocument]: z.ZodType<LearnerState[K]> } = {
  profile: ProfileSchema,
  competencies: CompetenciesSchema,
  errors: ErrorsSchema,
  vocabulary: VocabularySchema,
  grammar: GrammarSchema,
  pronunciation: PronunciationSchema,
  roadmap: RoadmapSchema,
  progress: ProgressSchema,
};

// ---------------------------------------------------------------------------
// Session evidence (temporary, produced during a conversation)
// ---------------------------------------------------------------------------

export const TranscriptTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string(),
  /** ms since session start, if known */
  at: z.number().nonnegative().optional(),
});
export type TranscriptTurn = z.infer<typeof TranscriptTurnSchema>;

/** What the tutor logs live via the `note_evidence` tool. */
export const LiveEvidenceSchema = z.object({
  kind: z.enum([
    "grammar_error",
    "vocabulary_gap",
    "vocabulary_success",
    "comprehension_problem",
    "pronunciation_issue",
    "grammar_success",
    "quebec_usage",
  ]),
  observed: z.string().default(""),
  preferred: z.string().default(""),
  note: z.string().default(""),
});
export type LiveEvidence = z.infer<typeof LiveEvidenceSchema>;

export const SessionEvidenceSchema = z.object({
  session_id: z.string(),
  mode: SessionModeSchema,
  started_at: z.iso.datetime(),
  ended_at: z.iso.datetime(),
  transcript: z.array(TranscriptTurnSchema),
  live_evidence: z.array(LiveEvidenceSchema).default([]),
  /** true when the connection dropped rather than the learner pressing End. */
  disconnected: z.boolean().default(false),
});
export type SessionEvidence = z.infer<typeof SessionEvidenceSchema>;

// ---------------------------------------------------------------------------
// Review delta (what the reviewer model returns; code merges it)
// ---------------------------------------------------------------------------

export const ReviewErrorSchema = z.object({
  category: ErrorCategorySchema,
  pattern: z.string(),
  observed: z.string(),
  preferred: z.string(),
  explanation: z.string(),
  occurrences: z.number().int().positive(),
});

export const ReviewCompetencyObservationSchema = z.object({
  competency: CompetencyKeySchema,
  observed_level: CefrLevelSchema,
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  /** How much evidence this session provided: 0 none .. 3 strong */
  evidence_strength: z.number().int().min(0).max(3),
});

export const ReviewVocabSchema = z.object({
  word: z.string(),
  meaning: z.string(),
  register: z.enum(["standard", "quebec", "informal"]),
  outcome: z.enum(["used_correctly", "struggled", "introduced"]),
});

export const ReviewGrammarSchema = z.object({
  point: z.string(),
  outcome: z.enum(["success", "failure", "introduced"]),
  note: z.string(),
});

export const ReviewPronunciationSchema = z.object({
  feature: z.string(),
  example: z.string(),
});

export const ReviewDeltaSchema = z.object({
  topics: z.array(z.string()),
  summary_for_learner: z.array(z.string()).describe("3-6 short bullet strings, plain language"),
  errors: z.array(ReviewErrorSchema),
  competencies: z.array(ReviewCompetencyObservationSchema),
  vocabulary: z.array(ReviewVocabSchema),
  grammar: z.array(ReviewGrammarSchema),
  pronunciation: z.array(ReviewPronunciationSchema),
  /** Errors from the registry (by id) that were clearly NOT made this session despite opportunity. */
  errors_improving: z.array(z.string()),
  suggested_focus: z.object({
    current_focus: z.string(),
    reason: z.string(),
    next_practice: z.string(),
    after: z.string(),
  }),
  profile_notes: z.array(z.string()).describe("durable facts the learner shared about themselves, if any"),
});
export type ReviewDelta = z.infer<typeof ReviewDeltaSchema>;

export const SessionSummarySchema = z.object({
  session_id: z.string(),
  practiced: z.array(z.string()),
  new_vocabulary: z.array(z.string()),
  recurring_issues: z.array(z.string()),
  next: z.array(z.string()),
  minutes: z.number(),
});
export type SessionSummary = z.infer<typeof SessionSummarySchema>;
