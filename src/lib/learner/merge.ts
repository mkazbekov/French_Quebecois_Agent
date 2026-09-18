import { clampLevel, formatLevel, type Level } from "./levels";
import { findUnit, pendingUnits, type SyllabusUnit } from "./syllabus";
import {
  type CompetencyKey,
  type ErrorRecord,
  type LearnerState,
  type ProgressEntry,
  type PronunciationIssue,
  type ReviewDelta,
  type SessionEvidence,
  type SessionSummary,
} from "./schema";

/**
 * Deterministic merge of one review delta into learner state.
 *
 * Pure function: never mutates its inputs. The reviewer model only reports
 * what it observed in the session; all counting, deduplication and level
 * dampening happens here so one chatty session cannot swing the profile.
 */

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

/** Union of existing + incoming, deduped, most-recent occurrence wins position, capped to the last `cap` items. */
function dedupeKeepNewest(existing: string[], incoming: string[], cap: number): string[] {
  const order: string[] = [];
  for (const v of [...existing, ...incoming]) {
    const idx = order.indexOf(v);
    if (idx >= 0) order.splice(idx, 1);
    order.push(v);
  }
  return order.slice(-cap);
}

function medianIndex(indices: number[]): number {
  const sorted = [...indices].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function applyReviewDelta(
  state: LearnerState,
  delta: ReviewDelta,
  evidence: SessionEvidence,
  now: Date,
): { state: LearnerState; summary: SessionSummary; progressEntry: ProgressEntry } {
  const s: LearnerState = structuredClone(state);
  const nowIso = now.toISOString();

  const minutesRaw = (new Date(evidence.ended_at).getTime() - new Date(evidence.started_at).getTime()) / 60_000;
  const minutes = Math.max(0, Math.round(minutesRaw * 10) / 10);

  // -------------------------------------------------------------------
  // a. Errors
  // -------------------------------------------------------------------
  const touchedErrorIds = new Set<string>();
  let newErrorCount = 0;

  for (const de of delta.errors) {
    const patternKey = normalize(de.pattern);
    const observedKey = normalize(de.observed);
    let existing = s.errors.items.find((e) => normalize(e.pattern) === patternKey);
    if (!existing) {
      existing = s.errors.items.find((e) => e.category === de.category && normalize(e.observed) === observedKey);
    }
    if (existing) {
      existing.frequency += de.occurrences;
      existing.last_observed = nowIso;
      existing.observed = de.observed;
      existing.preferred = de.preferred;
      existing.explanation = de.explanation;
      existing.status =
        existing.frequency >= 3
          ? "recurring"
          : existing.status === "resolved" || existing.status === "improving"
            ? "recurring"
            : existing.status;
      touchedErrorIds.add(existing.id);
    } else {
      const id = `ERROR-${String(s.errors.next_id).padStart(3, "0")}`;
      s.errors.next_id += 1;
      const record: ErrorRecord = {
        id,
        category: de.category,
        pattern: de.pattern,
        observed: de.observed,
        preferred: de.preferred,
        explanation: de.explanation,
        frequency: de.occurrences,
        first_observed: nowIso,
        last_observed: nowIso,
        status: "new",
      };
      s.errors.items.push(record);
      touchedErrorIds.add(id);
      newErrorCount += 1;
    }
  }

  let recurringTouchedCount = 0;
  for (const id of touchedErrorIds) {
    const rec = s.errors.items.find((e) => e.id === id);
    if (rec && rec.status === "recurring") recurringTouchedCount += 1;
  }

  for (const id of delta.errors_improving) {
    if (touchedErrorIds.has(id)) continue;
    const rec = s.errors.items.find((e) => e.id === id);
    if (!rec) continue;
    if (rec.status === "new" || rec.status === "recurring") rec.status = "improving";
    else if (rec.status === "improving") rec.status = "resolved";
  }

  // -------------------------------------------------------------------
  // b. Competencies
  // -------------------------------------------------------------------
  const competencyChanges: Array<{ key: CompetencyKey; from: Level; to: Level }> = [];

  for (const obs of delta.competencies) {
    if (obs.evidence_strength < 1) continue;
    const comp = s.competencies[obs.competency];
    const before = comp.level;

    comp.recent_observations = [...comp.recent_observations, obs.observed_level].slice(-8);
    comp.evidence_count += obs.evidence_strength;
    comp.last_assessed = nowIso;
    comp.strengths = dedupeKeepNewest(comp.strengths, obs.strengths, 6);
    comp.weaknesses = dedupeKeepNewest(comp.weaknesses, obs.weaknesses, 6);

    // Levels are integers on the 12-level Échelle québécoise; move at most one level per session.
    const indices = comp.recent_observations;
    const current = comp.level;
    if (comp.evidence_count >= 3 && comp.recent_observations.length >= 2) {
      const target = medianIndex(indices);
      const diff = target - current;
      const step = diff === 0 ? 0 : diff > 0 ? 1 : -1;
      comp.level = clampLevel(current + step);
    }

    const spread = Math.max(...indices) - Math.min(...indices);
    let confidence = Math.min(1, 0.15 + 0.1 * comp.evidence_count);
    if (spread > 2) confidence *= 0.7;
    comp.confidence = confidence;

    if (comp.level !== before) competencyChanges.push({ key: obs.competency, from: before, to: comp.level });
  }

  // -------------------------------------------------------------------
  // c. Vocabulary
  // -------------------------------------------------------------------
  const introducedWords: string[] = [];

  for (const rv of delta.vocabulary) {
    const key = rv.word.toLowerCase();
    let existing = s.vocabulary.items.find((v) => v.word.toLowerCase() === key);

    if (rv.outcome === "used_correctly") {
      if (!existing) {
        existing = { word: rv.word, meaning: "", register: "standard", status: "shaky", times_used_correctly: 0, times_struggled: 0, last_seen: null };
        s.vocabulary.items.push(existing);
      }
      existing.times_used_correctly += 1;
      if (existing.status !== "known" && existing.times_used_correctly >= 2 && existing.times_used_correctly >= existing.times_struggled) {
        existing.status = "known";
      }
    } else if (rv.outcome === "struggled") {
      if (!existing) {
        existing = { word: rv.word, meaning: "", register: "standard", status: "shaky", times_used_correctly: 0, times_struggled: 0, last_seen: null };
        s.vocabulary.items.push(existing);
      }
      existing.times_struggled += 1;
      existing.status = "shaky";
    } else {
      // introduced
      if (!existing) {
        existing = { word: rv.word, meaning: "", register: "standard", status: "target", times_used_correctly: 0, times_struggled: 0, last_seen: null };
        s.vocabulary.items.push(existing);
      }
      introducedWords.push(rv.word);
    }

    if (!existing.meaning) existing.meaning = rv.meaning;
    if (existing.register === "standard" && rv.register !== "standard") existing.register = rv.register;
    existing.last_seen = nowIso;
  }

  if (s.vocabulary.items.length > 400) {
    const over = s.vocabulary.items.length - 400;
    const knownOldestFirst = s.vocabulary.items
      .map((v, i) => ({ v, i }))
      .filter((x) => x.v.status === "known")
      .sort((a, b) => new Date(a.v.last_seen ?? 0).getTime() - new Date(b.v.last_seen ?? 0).getTime());
    const dropIdx = new Set(knownOldestFirst.slice(0, over).map((x) => x.i));
    s.vocabulary.items = s.vocabulary.items.filter((_, i) => !dropIdx.has(i));
    if (s.vocabulary.items.length > 400) {
      s.vocabulary.items = s.vocabulary.items
        .slice()
        .sort((a, b) => new Date(a.last_seen ?? 0).getTime() - new Date(b.last_seen ?? 0).getTime())
        .slice(s.vocabulary.items.length - 400);
    }
  }

  // -------------------------------------------------------------------
  // d. Grammar
  // -------------------------------------------------------------------
  for (const rg of delta.grammar) {
    const key = normalize(rg.point);
    let existing = s.grammar.items.find((g) => normalize(g.point) === key);
    if (!existing) {
      existing = { point: rg.point, status: "introduced", notes: "", successes: 0, failures: 0, last_practiced: null };
      s.grammar.items.push(existing);
    }
    if (rg.outcome === "success") existing.successes += 1;
    else if (rg.outcome === "failure") existing.failures += 1;

    existing.status =
      existing.successes >= 4 && existing.successes >= 3 * existing.failures
        ? "solid"
        : existing.successes + existing.failures > 0
          ? "practicing"
          : existing.status;
    existing.last_practiced = nowIso;
    if (rg.note.trim()) existing.notes = rg.note;
  }

  // -------------------------------------------------------------------
  // e. Pronunciation
  // -------------------------------------------------------------------
  for (const rp of delta.pronunciation) {
    const key = normalize(rp.feature);
    const existing = s.pronunciation.items.find((p) => normalize(p.feature) === key);
    if (existing) {
      existing.frequency += 1;
      existing.last_observed = nowIso;
      existing.example = rp.example || existing.example;
      existing.status = existing.frequency >= 3 ? "recurring" : existing.status;
    } else {
      const rec: PronunciationIssue = {
        feature: rp.feature,
        example: rp.example,
        frequency: 1,
        last_observed: nowIso,
        status: "observed",
      };
      s.pronunciation.items.push(rec);
    }
  }

  // -------------------------------------------------------------------
  // f. Syllabus progress + roadmap
  // -------------------------------------------------------------------
  // A unit is done after two good sessions with at most half as many struggles.
  for (const ru of delta.units_practiced) {
    if (!findUnit(ru.unit_id)) continue;
    let rec = s.roadmap.units.find((u) => u.id === ru.unit_id);
    if (!rec) {
      rec = { id: ru.unit_id, status: "not_started", ok: 0, struggled: 0, last_practiced: null };
      s.roadmap.units.push(rec);
    }
    if (ru.outcome === "practiced_ok") rec.ok += 1;
    else if (ru.outcome === "struggled") rec.struggled += 1;
    rec.last_practiced = nowIso;
    rec.status = rec.ok >= 2 && rec.ok >= 2 * rec.struggled ? "done" : "in_progress";
  }

  // Program order decides the next unit; the reviewer may only pull a pending unit forward.
  const level = s.competencies.oral_production.level;
  const pending = pendingUnits(level, s.roadmap.units);
  const pulled: SyllabusUnit | undefined = delta.suggested_focus.unit_id
    ? pending.find((u) => u.id === delta.suggested_focus.unit_id)
    : undefined;
  const current = pulled ?? pending[0] ?? null;
  const label = (u: SyllabusUnit) => `${u.title} (${u.id})`;

  s.roadmap.current_unit = current?.id ?? null;
  s.roadmap.current_focus = current ? label(current) : delta.suggested_focus.current_focus;
  s.roadmap.reason = current
    ? pulled
      ? delta.suggested_focus.reason
      : `Next unit of the program at ${formatLevel(level)}: ${current.goal}${delta.suggested_focus.reason ? ` Reviewer: ${delta.suggested_focus.reason}` : ""}`
    : delta.suggested_focus.reason;
  s.roadmap.next_practice = delta.suggested_focus.next_practice;
  s.roadmap.after = delta.suggested_focus.after;
  s.roadmap.recent_topics = dedupeKeepNewest(s.roadmap.recent_topics, delta.topics, 12);
  s.roadmap.queue = pending.filter((u) => u.id !== current?.id).slice(0, 6).map(label);
  s.roadmap.updated_at = nowIso;

  // -------------------------------------------------------------------
  // g. Profile
  // -------------------------------------------------------------------
  s.profile.sessions_completed += 1;
  s.profile.total_minutes = Math.round((s.profile.total_minutes + minutes) * 10) / 10;
  s.profile.first_session_at ??= nowIso;
  s.profile.last_session_at = nowIso;
  s.profile.notes = dedupeKeepNewest(s.profile.notes, delta.profile_notes, 20);

  // -------------------------------------------------------------------
  // h. Progress
  // -------------------------------------------------------------------
  const deltaParts: string[] = [];
  if (newErrorCount > 0) deltaParts.push(plural(newErrorCount, "new error"));
  if (recurringTouchedCount > 0) deltaParts.push(`${recurringTouchedCount} recurring`);
  for (const c of competencyChanges) deltaParts.push(`${c.key} niveau ${c.from}→${c.to}`);
  const deltaSentence = deltaParts.length ? deltaParts.join(", ") : "steady session, no major changes";

  const progressEntry: ProgressEntry = {
    session_id: evidence.session_id,
    date: nowIso,
    mode: evidence.mode,
    minutes,
    topics: delta.topics,
    highlights: delta.summary_for_learner,
    delta: deltaSentence,
  };
  s.progress.entries = [progressEntry, ...s.progress.entries].slice(0, 40);

  // -------------------------------------------------------------------
  // i. Summary
  // -------------------------------------------------------------------
  const grammarTouched = delta.grammar.filter((g) => g.outcome === "success" || g.outcome === "failure").map((g) => g.point);
  const practiced = dedupeKeepNewest([], [...delta.topics, ...grammarTouched], 6);
  const newVocabulary = introducedWords.slice(0, 8);
  const recurringIssues = [...touchedErrorIds]
    .map((id) => s.errors.items.find((e) => e.id === id))
    .filter((e): e is ErrorRecord => !!e && e.frequency >= 2)
    .slice(0, 3)
    .map((e) => `${e.pattern} (e.g. « ${e.observed} » → « ${e.preferred} »)`);

  const summary: SessionSummary = {
    session_id: evidence.session_id,
    practiced,
    new_vocabulary: newVocabulary,
    recurring_issues: recurringIssues,
    next: [s.roadmap.next_practice],
    minutes,
  };

  return { state: s, summary, progressEntry };
}
