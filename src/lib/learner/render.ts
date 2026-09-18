import type { LearnerState, ReviewDelta, SessionEvidence, SessionSummary } from "./schema";

/**
 * Markdown rendering for learner-facing / archival records. Never includes
 * raw transcript text.
 */

function section(title: string, body: string): string {
  return body.trim() ? `**${title}**\n${body.trim()}` : "";
}

/** Compact per-session record written to archival memory (~1200 chars). No raw transcript. */
export function renderSessionRecordMarkdown(
  delta: ReviewDelta,
  summary: SessionSummary,
  evidence: SessionEvidence,
  now: Date,
): string {
  const date = now.toISOString().slice(0, 10);

  const wentWell: string[] = [];
  for (const g of delta.grammar) {
    if (g.outcome === "success") wentWell.push(g.point);
  }
  for (const v of delta.vocabulary) {
    if (v.outcome === "used_correctly") wentWell.push(v.word);
  }

  const errorLines = delta.errors
    .slice(0, 6)
    .map((e) => `- ${e.pattern}: « ${e.observed} » → « ${e.preferred} » (${e.occurrences}x)`)
    .join("\n");

  const newVocab = delta.vocabulary
    .filter((v) => v.outcome === "introduced")
    .slice(0, 8)
    .map((v) => v.word)
    .join(", ");

  const parts = [
    `# ${date} — ${evidence.mode} (${summary.minutes} min)`,
    section("Topics", delta.topics.join(", ")),
    section("What went well", wentWell.slice(0, 8).join(", ")),
    section("Errors observed", errorLines),
    section("New vocabulary", newVocab),
    section("Next focus", delta.suggested_focus.next_practice),
  ].filter(Boolean);

  return parts.join("\n\n").slice(0, 1200);
}

function competencyTable(state: LearnerState): string {
  const rows = (Object.entries(state.competencies) as Array<[string, LearnerState["competencies"]["oral_production"]]>).map(
    ([key, c]) => `| ${key} | ${c.level} | ${c.confidence.toFixed(2)} | ${c.evidence_count} |`,
  );
  return ["| Competency | Level | Confidence | Evidence |", "| --- | --- | --- | --- |", ...rows].join("\n");
}

/** Full human-readable view of the learner state. */
export function renderLearnerMarkdown(state: LearnerState): string {
  const p = state.profile;
  const recurring = state.errors.items
    .filter((e) => e.status !== "resolved")
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 10)
    .map((e) => `- [${e.id}] ${e.pattern} — « ${e.observed} » → « ${e.preferred} » (${e.frequency}x, ${e.status})`);

  const grammarLines = state.grammar.items.map((g) => `- ${g.point}: ${g.status} (${g.successes} ok / ${g.failures} wrong)`);

  const shaky = state.vocabulary.items.filter((v) => v.status === "shaky");
  const target = state.vocabulary.items.filter((v) => v.status === "target");
  const known = state.vocabulary.items.filter((v) => v.status === "known");

  const pronunciation = state.pronunciation.items.map((pr) => `- ${pr.feature}${pr.example ? ` (e.g. ${pr.example})` : ""} (${pr.status})`);

  const progress = state.progress.entries.slice(0, 10).map((entry) => `- ${entry.date.slice(0, 10)} (${entry.mode}, ${entry.minutes} min): ${entry.delta}`);

  const sections = [
    "# Learner profile",
    section(
      "Profile",
      [
        `Name: ${p.name}`,
        `Native languages: ${p.native_languages.join(", ")}`,
        `Goals: ${p.goals.join("; ")}`,
        `Sessions completed: ${p.sessions_completed}`,
        `Total minutes: ${p.total_minutes}`,
        `First session: ${p.first_session_at ?? "(none)"}`,
        `Last session: ${p.last_session_at ?? "(none)"}`,
        p.notes.length ? `Notes: ${p.notes.join("; ")}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    ),
    section("Competencies", competencyTable(state)),
    section(
      "Roadmap",
      [
        `Current focus: ${state.roadmap.current_focus}`,
        `Reason: ${state.roadmap.reason}`,
        `Next practice: ${state.roadmap.next_practice}`,
        state.roadmap.after ? `After: ${state.roadmap.after}` : "",
        state.roadmap.queue.length ? `Queue: ${state.roadmap.queue.join(", ")}` : "",
        state.roadmap.recent_topics.length ? `Recent topics: ${state.roadmap.recent_topics.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    ),
    section("Recurring errors", recurring.length ? recurring.join("\n") : "(none)"),
    section("Grammar", grammarLines.length ? grammarLines.join("\n") : "(none)"),
    section(
      "Vocabulary",
      [
        `Shaky (${shaky.length}): ${shaky.map((v) => v.word).join(", ") || "(none)"}`,
        `Target (${target.length}): ${target.map((v) => v.word).join(", ") || "(none)"}`,
        `Known (${known.length}): ${known.map((v) => v.word).join(", ") || "(none)"}`,
      ].join("\n"),
    ),
    section("Pronunciation", pronunciation.length ? pronunciation.join("\n") : "(none)"),
    section("Progress (last 10)", progress.length ? progress.join("\n") : "(none)"),
  ].filter(Boolean);

  return sections.join("\n\n");
}
