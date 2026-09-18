import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { env } from "@/lib/env";
import { ReviewDeltaSchema, type LearnerState, type ReviewDelta, type SessionEvidence } from "@/lib/learner/schema";

/**
 * Session review: turns the temporary evidence of one conversation into a
 * structured ReviewDelta. The model only *observes*; merge.ts decides how the
 * learner state changes. Keep this file free of persistence logic.
 */

export const MIN_USER_TURNS_FOR_REVIEW = 2;

function compactState(state: LearnerState): string {
  const c = state.competencies;
  const errors = state.errors.items
    .filter((e) => e.status !== "resolved")
    .map((e) => `${e.id} [${e.category}] ${e.pattern}: "${e.observed}" → "${e.preferred}" (x${e.frequency}, ${e.status})`)
    .slice(0, 25);
  const grammar = state.grammar.items.map((g) => `${g.point} (${g.status}, ${g.successes}/${g.failures})`).slice(0, 25);
  const vocab = state.vocabulary.items
    .filter((v) => v.status !== "known")
    .map((v) => `${v.word} (${v.status})`)
    .slice(0, 40);
  return [
    `Learner: ${state.profile.name}; sessions completed: ${state.profile.sessions_completed}`,
    `Levels: oral_production ${c.oral_production.level}, oral_comprehension ${c.oral_comprehension.level}, written_production ${c.written_production.level}, written_comprehension ${c.written_comprehension.level}`,
    `Current focus: ${state.roadmap.current_focus} — ${state.roadmap.reason}`,
    `Roadmap queue: ${state.roadmap.queue.join(" | ") || "(empty)"}`,
    `Recent topics: ${state.roadmap.recent_topics.join(", ") || "(none)"}`,
    `Known error registry:\n${errors.length ? errors.map((x) => "  " + x).join("\n") : "  (empty)"}`,
    `Grammar points tracked:\n${grammar.length ? grammar.map((x) => "  " + x).join("\n") : "  (none)"}`,
    `Vocabulary not yet solid: ${vocab.join(", ") || "(none)"}`,
  ].join("\n");
}

function renderEvidence(ev: SessionEvidence): string {
  const transcript = ev.transcript
    .map((t) => `${t.role === "user" ? "LEARNER" : "TUTOR"}: ${t.text.trim()}`)
    .join("\n");
  const live = ev.live_evidence.length
    ? ev.live_evidence
        .map((e) => `- ${e.kind}${e.observed ? ` | observed: ${e.observed}` : ""}${e.preferred ? ` | preferred: ${e.preferred}` : ""}${e.note ? ` | ${e.note}` : ""}`)
        .join("\n")
    : "(the tutor logged nothing live)";
  return `MODE: ${ev.mode}\nDISCONNECTED UNEXPECTEDLY: ${ev.disconnected ? "yes" : "no"}\n\nTUTOR'S LIVE NOTES\n${live}\n\nTRANSCRIPT (learner speech is machine-transcribed; ignore obvious transcription artefacts)\n${transcript}`;
}

const REVIEWER_SYSTEM = `You are the pedagogical reviewer for a Québec French voice tutor. You receive the learner's current model and the evidence from ONE spoken session. Produce a careful, conservative ReviewDelta.

Principles
- Report only what the evidence supports. The learner's turns are automatic speech transcripts: do not invent pronunciation issues from spelling, and treat odd words as possible transcription errors unless the tutor's live notes confirm them.
- Errors: group by underlying pattern (e.g. "passé composé auxiliary: être vs avoir"), not by sentence. Reuse the wording of an existing registry pattern when it is the same issue so it can be deduplicated. occurrences = how many times it happened this session. "preferred" must be natural Québec/standard French.
- errors_improving: list registry ids (ERROR-xxx) only when the learner clearly had the opportunity to make that error and did not.
- Competencies: give observations for oral_production and oral_comprehension whenever there are at least a few learner turns. Only give written_* observations if the learner actually typed text (turns that are obviously typed). Use CEFR-style levels as rough estimates; evidence_strength 1 for a short session, 2 for a normal one, 3 only for a long varied session. Level estimates should be stable: do not jump more than one step from the current level without strong reason.
- Vocabulary: "used_correctly" for words the learner produced well (especially target/shaky ones), "struggled" for words they searched for, mis-used, or needed in English, "introduced" for useful words the tutor taught. Mark register "quebec" for Québec-specific usage (dépanneur, magasiner, frette, chum/blonde, tantôt, char, correct...).
- Grammar: report points actually exercised, with success/failure outcomes.
- Pronunciation: only issues the tutor's notes mention or that are unmistakable.
- suggested_focus: choose the single most useful next focus given recurring errors, weaknesses, time since topics were practised, and Montréal daily-life usefulness. "next_practice" must be a concrete 5–10 minute speaking task. "after" says how to reassess.
- summary_for_learner: 3–6 short, encouraging, concrete bullets in English (the app shows them after the call). No scores.
- profile_notes: durable personal facts the learner shared (job, neighbourhood, interests). Empty if none.
- topics: 2–5 short topic labels.`;

export interface ReviewSessionOptions {
  client?: OpenAI;
  model?: string;
}

export async function reviewSession(
  state: LearnerState,
  evidence: SessionEvidence,
  opts: ReviewSessionOptions = {},
): Promise<ReviewDelta> {
  const client = opts.client ?? new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const model = opts.model ?? env.OPENAI_REVIEW_MODEL;

  const response = await client.responses.parse({
    model,
    input: [
      { role: "system", content: REVIEWER_SYSTEM },
      {
        role: "user",
        content: `CURRENT LEARNER MODEL\n${compactState(state)}\n\nSESSION EVIDENCE\n${renderEvidence(evidence)}`,
      },
    ],
    text: { format: zodTextFormat(ReviewDeltaSchema, "review_delta") },
  });

  const parsed = response.output_parsed;
  if (!parsed) throw new Error("Session review returned no structured output");
  return ReviewDeltaSchema.parse(parsed);
}

export function hasEnoughForReview(evidence: SessionEvidence): boolean {
  const userTurns = evidence.transcript.filter((t) => t.role === "user" && t.text.trim().length > 0).length;
  return userTurns >= MIN_USER_TURNS_FOR_REVIEW;
}
