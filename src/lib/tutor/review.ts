import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { env } from "@/lib/env";
import { describeScale, formatLevel } from "@/lib/learner/levels";
import { findUnit, formatUnit, pendingUnits } from "@/lib/learner/syllabus";
import { ReviewDeltaSchema, type LearnerState, type ReviewDelta, type SessionEvidence } from "@/lib/learner/schema";

/**
 * Session review: turns the temporary evidence of one conversation into a
 * structured ReviewDelta. The model only *observes*; merge.ts decides how the
 * learner state changes. Keep this file free of persistence logic.
 *
 * Providers: Gemini (REST, free tier) or OpenAI (Responses API). Chosen by
 * env.REVIEW_PROVIDER; both produce the same zod-validated ReviewDelta.
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
  const level = c.oral_production.level;
  const current = state.roadmap.current_unit ? findUnit(state.roadmap.current_unit) : undefined;
  const inProgress = state.roadmap.units
    .filter((u) => u.status === "in_progress")
    .map((u) => findUnit(u.id))
    .filter((u): u is NonNullable<typeof u> => !!u);
  const upcoming = pendingUnits(level, state.roadmap.units).slice(0, 10);
  const unitLines = [...new Map([current, ...inProgress, ...upcoming].filter((u): u is NonNullable<typeof u> => !!u).map((u) => [u.id, u])).values()].map(formatUnit);
  return [
    `Learner: ${state.profile.name}; sessions completed: ${state.profile.sessions_completed}`,
    `Levels: oral_production ${formatLevel(c.oral_production.level)}, oral_comprehension ${formatLevel(c.oral_comprehension.level)}, written_production ${formatLevel(c.written_production.level)}, written_comprehension ${formatLevel(c.written_comprehension.level)}`,
    `Current focus: ${state.roadmap.current_focus} — ${state.roadmap.reason}`,
    `Roadmap queue: ${state.roadmap.queue.join(" | ") || "(empty)"}`,
    `Recent topics: ${state.roadmap.recent_topics.join(", ") || "(none)"}`,
    `Syllabus units in play (current: ${current?.id ?? "none"}; use these ids only):\n${unitLines.length ? unitLines.map((x) => "  " + x).join("\n") : "  (none)"}`,
    `Known error registry:\n${errors.length ? errors.map((x) => "  " + x).join("\n") : "  (empty)"}`,
    `Grammar points tracked:\n${grammar.length ? grammar.map((x) => "  " + x).join("\n") : "  (none)"}`,
    `Vocabulary not yet solid: ${vocab.join(", ") || "(none)"}`,
  ].join("\n");
}

function renderEvidence(ev: SessionEvidence): string {
  const transcript = ev.transcript
    .map((t) => `${t.role === "user" ? (t.typed ? "LEARNER (typed)" : "LEARNER") : "TUTOR"}: ${t.text.trim()}`)
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
- Competencies: give observations for oral_production and oral_comprehension whenever there are at least a few learner turns. Give a written_production observation only when the learner typed text (turns marked "LEARNER (typed)"); give a written_comprehension observation only when the learner visibly responded to something they had to read (e.g. the tutor asked them to read the on-screen text). observed_level is an integer 1–12 on the Échelle québécoise below; evidence_strength 1 for a short session, 2 for a normal one, 3 only for a long varied session. Level estimates should be stable: do not jump more than one level from the current level without strong reason.

LEVEL SCALE
${describeScale()}
- Vocabulary: "used_correctly" for words the learner produced well (especially target/shaky ones), "struggled" for words they searched for, mis-used, or needed in English, "introduced" for useful words the tutor taught. Mark register "quebec" for Québec-specific usage (dépanneur, magasiner, frette, chum/blonde, tantôt, char, correct...).
- Grammar: report points actually exercised, with success/failure outcomes.
- Pronunciation: only issues the tutor's notes mention or that are unmistakable.
- units_practiced: for each syllabus unit (ids from "Syllabus units in play") that was genuinely worked on: "introduced" if the tutor presented it for the first time, "practiced_ok" if the learner produced the target mostly correctly, "struggled" if they clearly could not. Never invent ids.
- suggested_focus: the program normally continues in order. Set unit_id only to pull a listed pending unit forward when the evidence clearly calls for it (a recurring error that unit addresses, or the learner asked for it); otherwise unit_id = "". current_focus/reason describe the pedagogical reason; "next_practice" must be a concrete 5–10 minute speaking task; "after" says how to reassess.
- summary_for_learner: 3–6 short, encouraging, concrete bullets in English (the app shows them after the call). No scores.
- profile_notes: durable personal facts the learner shared (job, neighbourhood, interests). Empty if none.
- topics: 2–5 short topic labels.`;

const REVIEWER_SYSTEM_TEXT = REVIEWER_SYSTEM.replace("${SCALE}", describeScale());

function userPrompt(state: LearnerState, evidence: SessionEvidence): string {
  return `CURRENT LEARNER MODEL\n${compactState(state)}\n\nSESSION EVIDENCE\n${renderEvidence(evidence)}`;
}

export interface ReviewSessionOptions {
  provider?: "gemini" | "openai";
  /** OpenAI only */
  client?: OpenAI;
  /** OpenAI model */
  model?: string;
  /** Gemini fallback list, first that answers wins */
  models?: string[];
}

export async function reviewSession(
  state: LearnerState,
  evidence: SessionEvidence,
  opts: ReviewSessionOptions = {},
): Promise<ReviewDelta> {
  const provider = opts.provider ?? env.REVIEW_PROVIDER;
  return provider === "gemini" ? reviewWithGemini(state, evidence, opts) : reviewWithOpenAI(state, evidence, opts);
}

async function reviewWithOpenAI(state: LearnerState, evidence: SessionEvidence, opts: ReviewSessionOptions): Promise<ReviewDelta> {
  const client = opts.client ?? new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const model = opts.model ?? env.OPENAI_REVIEW_MODEL;
  const response = await client.responses.parse({
    model,
    input: [
      { role: "system", content: REVIEWER_SYSTEM_TEXT },
      { role: "user", content: userPrompt(state, evidence) },
    ],
    text: { format: zodTextFormat(ReviewDeltaSchema, "review_delta") },
  });
  const parsed = response.output_parsed;
  if (!parsed) throw new Error("Session review returned no structured output");
  return ReviewDeltaSchema.parse(parsed);
}

const GEMINI_RETRYABLE = new Set([429, 500, 503]);

/**
 * Gemini Developer API via REST (no SDK). Tries each model in order; on
 * overload (503/429/500) or invalid output moves to the next model, then
 * retries the whole list once after a short pause.
 */
async function reviewWithGemini(state: LearnerState, evidence: SessionEvidence, opts: ReviewSessionOptions): Promise<ReviewDelta> {
  const models = opts.models ?? env.GEMINI_REVIEW_MODELS;
  const schema = z.toJSONSchema(ReviewDeltaSchema, { target: "draft-7" });
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: REVIEWER_SYSTEM_TEXT }] },
    contents: [{ parts: [{ text: userPrompt(state, evidence) }] }],
    generationConfig: { responseMimeType: "application/json", responseJsonSchema: schema, temperature: 0.2 },
  });

  let lastError = "no models configured";
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const model of models) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": env.GEMINI_API_KEY, "Content-Type": "application/json" },
        body,
      });
      if (!res.ok) {
        lastError = `Gemini ${model} returned ${res.status}: ${(await res.text()).slice(0, 200)}`;
        if (GEMINI_RETRYABLE.has(res.status)) continue;
        throw new Error(lastError);
      }
      const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
      if (!text) {
        lastError = `Gemini ${model} returned no text`;
        continue;
      }
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        lastError = `Gemini ${model} returned non-JSON output`;
        continue;
      }
      const parsed = ReviewDeltaSchema.safeParse(json);
      if (!parsed.success) {
        lastError = `Gemini ${model} output failed validation: ${parsed.error.issues[0]?.message ?? "unknown"}`;
        continue;
      }
      return parsed.data;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Session review failed: ${lastError}`);
}

export function hasEnoughForReview(evidence: SessionEvidence): boolean {
  const userTurns = evidence.transcript.filter((t) => t.role === "user" && t.text.trim().length > 0).length;
  return userTurns >= MIN_USER_TURNS_FOR_REVIEW;
}
