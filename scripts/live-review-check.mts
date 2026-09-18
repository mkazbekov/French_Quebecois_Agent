import "dotenv/config";
import { defaultLearnerState } from "@/lib/learner/defaults";
import { reviewSession } from "@/lib/tutor/review";
import type { SessionEvidence } from "@/lib/learner/schema";

const ev: SessionEvidence = {
  session_id: "live-check",
  mode: "free",
  started_at: new Date(Date.now() - 6 * 60_000).toISOString(),
  ended_at: new Date().toISOString(),
  transcript: [
    { role: "assistant", text: "Salut Mirza ! Qu'est-ce que t'as fait hier ?" },
    { role: "user", text: "Hier j'ai allé au travail en métro, ligne orange." },
    { role: "assistant", text: "Ah, t'es allé au travail en métro ! C'était long ?" },
    { role: "user", text: "Non, vingt minutes. Après je... how do you say I bought groceries?" },
    { role: "assistant", text: "On dit « j'ai fait l'épicerie ». Ici, on dit épicerie, pas supermarché. T'as acheté quoi ?" },
    { role: "user", text: "J'ai fait l'épicerie, j'ai acheté du pain et du fromage." },
  ],
  live_evidence: [{ kind: "grammar_error", observed: "j'ai allé", preferred: "je suis allé", note: "aller + être" }],
  disconnected: false,
};

const t0 = Date.now();
const delta = await reviewSession(defaultLearnerState("Mirza"), ev);
console.log(`provider: ${process.env.REVIEW_PROVIDER || (process.env.GEMINI_API_KEY ? "gemini (auto)" : "openai (auto)")}`);
console.log(`REVIEW OK in ${Date.now() - t0} ms`);
console.log(JSON.stringify({ topics: delta.topics, errors: delta.errors.map((e) => `${e.pattern} x${e.occurrences}`), competencies: delta.competencies.map((c) => `${c.competency}=${c.observed_level}/${c.evidence_strength}`), vocab: delta.vocabulary.map((v) => `${v.word}:${v.outcome}${v.register === "quebec" ? "(QC)" : ""}`), units: delta.units_practiced.map((u) => `${u.unit_id}:${u.outcome}`), pull_forward: delta.suggested_focus.unit_id, focus: delta.suggested_focus.current_focus, summary: delta.summary_for_learner }, null, 1));
