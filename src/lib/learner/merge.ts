import { clampLevel, formatLevel, type Level } from "./levels";
import { PLACEMENT_CONFIDENCE, creditUnitsBelow } from "./placement";
import { ERROR_INTERVAL_DAYS, UNIT_FIRST_INTERVAL_DAYS, UNIT_MAX_INTERVAL_DAYS, addDays, vocabIntervalDays } from "./spacing";
import { findUnit, matchUnitForError, pendingUnits, type SyllabusUnit } from "./syllabus";
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

/** Confidence lost per session in which a competency was not observed. */
export const CONFIDENCE_DECAY_PER_SESSION = 0.05;

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
        unit_id: "",
        next_review: null,
      };
      s.errors.items.push(record);
      touchedErrorIds.add(id);
      newErrorCount += 1;
      existing = record;
    }
    // Which syllabus unit fixes this? Reviewer's id if valid, else keyword match; never overwrite a valid one.
    if (!existing.unit_id || !findUnit(existing.unit_id)) {
      const unit = (de.unit_id && findUnit(de.unit_id)) || matchUnitForError(de.pattern);
      existing.unit_id = unit?.id ?? "";
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
  // Spaced review dates: anything touched this session (made or checked) gets a new date.
  for (const rec of s.errors.items) {
    if (touchedErrorIds.has(rec.id) || delta.errors_improving.includes(rec.id)) {
      rec.next_review = addDays(now, ERROR_INTERVAL_DAYS[rec.status]);
    } else if (rec.next_review === null && rec.status !== "resolved") {
      rec.next_review = addDays(now, ERROR_INTERVAL_DAYS[rec.status]);
    }
  }

  // -------------------------------------------------------------------
  // b. Competencies
  // -------------------------------------------------------------------
  const competencyChanges: Array<{ key: CompetencyKey; from: Level; to: Level }> = [];

  // This session IS the learner's placement when it's an assessment and the
  // *input* state had no placement yet: levels move directly to what was
  // observed instead of the usual one-step-per-session cap.
  const isPlacementSession = evidence.mode === "assessment" && state.profile.placement.status === "pending";
  const placementObservedLevels: number[] = [];

  for (const obs of delta.competencies) {
    if (obs.evidence_strength < 1) continue;
    const comp = s.competencies[obs.competency];
    const before = comp.level;

    comp.recent_observations = [...comp.recent_observations, obs.observed_level].slice(-8);
    comp.evidence_count += obs.evidence_strength;
    comp.last_assessed = nowIso;
    comp.strengths = dedupeKeepNewest(comp.strengths, obs.strengths, 6);
    comp.weaknesses = dedupeKeepNewest(comp.weaknesses, obs.weaknesses, 6);

    if (isPlacementSession) {
      // Placement: this session sets the level directly; no one-step cap.
      comp.level = clampLevel(obs.observed_level);
      comp.confidence = Math.max(comp.confidence, PLACEMENT_CONFIDENCE);
      placementObservedLevels.push(comp.level);
    } else {
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
    }

    if (comp.level !== before) competencyChanges.push({ key: obs.competency, from: before, to: comp.level });
  }

  const observedKeys = new Set(delta.competencies.filter((o) => o.evidence_strength >= 1).map((o) => o.competency));

  if (isPlacementSession) {
    if (placementObservedLevels.length > 0) {
      // Competencies the call didn't cover take the median of what was observed; confidence unchanged.
      const medianLevel = clampLevel(medianIndex(placementObservedLevels));
      for (const key of Object.keys(s.competencies) as CompetencyKey[]) {
        if (observedKeys.has(key)) continue;
        const comp = s.competencies[key];
        const before = comp.level;
        comp.level = medianLevel;
        if (comp.level !== before) competencyChanges.push({ key, from: before, to: comp.level });
      }
      // The program should start from the placed level, not fill in every lower-level unit one by one.
      s.roadmap.units = creditUnitsBelow(s.roadmap.units, s.competencies.oral_production.level);
      s.profile.placement = { status: "tested", level: s.competencies.oral_production.level, set_at: nowIso };
    }
    // Nothing observed at all: placement stays pending, next auto call is a placement again.
  } else {
    // Confidence decays for competencies this session said nothing about (floor 0.1).
    for (const key of Object.keys(s.competencies) as CompetencyKey[]) {
      if (observedKeys.has(key)) continue;
      const comp = s.competencies[key];
      comp.confidence = Math.max(0.1, Math.round((comp.confidence - CONFIDENCE_DECAY_PER_SESSION) * 100) / 100);
    }
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
        existing = { word: rv.word, meaning: "", register: "standard", status: "shaky", times_used_correctly: 0, times_struggled: 0, last_seen: null, next_review: null };
        s.vocabulary.items.push(existing);
      }
      existing.times_used_correctly += 1;
      if (existing.status !== "known" && existing.times_used_correctly >= 2 && existing.times_used_correctly >= existing.times_struggled) {
        existing.status = "known";
      }
    } else if (rv.outcome === "struggled") {
      if (!existing) {
        existing = { word: rv.word, meaning: "", register: "standard", status: "shaky", times_used_correctly: 0, times_struggled: 0, last_seen: null, next_review: null };
        s.vocabulary.items.push(existing);
      }
      existing.times_struggled += 1;
      existing.status = "shaky";
    } else {
      // introduced
      if (!existing) {
        existing = { word: rv.word, meaning: "", register: "standard", status: "target", times_used_correctly: 0, times_struggled: 0, last_seen: null, next_review: null };
        s.vocabulary.items.push(existing);
      }
      introducedWords.push(rv.word);
    }

    if (!existing.meaning) existing.meaning = rv.meaning;
    if (existing.register === "standard" && rv.register !== "standard") existing.register = rv.register;
    existing.last_seen = nowIso;
    existing.next_review = addDays(now, vocabIntervalDays(existing));
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
      rec = { id: ru.unit_id, status: "not_started", ok: 0, struggled: 0, last_practiced: null, next_review: null, interval_days: 0, credited: false };
      s.roadmap.units.push(rec);
    }
    const wasDone = rec.status === "done";
    if (ru.outcome === "practiced_ok") rec.ok += 1;
    else if (ru.outcome === "struggled") rec.struggled += 1;
    rec.last_practiced = nowIso;

    if (wasDone && ru.outcome === "struggled") {
      // Lapse: a finished unit failed its spaced review; it re-enters the program.
      rec.status = "in_progress";
      rec.ok = 0;
      rec.next_review = null;
      rec.interval_days = 0;
    } else if (wasDone && ru.outcome === "practiced_ok") {
      rec.interval_days = Math.min(UNIT_MAX_INTERVAL_DAYS, Math.max(UNIT_FIRST_INTERVAL_DAYS, rec.interval_days * 2));
      rec.next_review = addDays(now, rec.interval_days);
    } else if (rec.ok >= 2 && rec.ok >= 2 * rec.struggled) {
      rec.status = "done";
      rec.interval_days = UNIT_FIRST_INTERVAL_DAYS;
      rec.next_review = addDays(now, rec.interval_days);
    } else {
      rec.status = "in_progress";
    }
  }

  // Next unit, by priority: (1) the unit that fixes the most frequent recurring error,
  // (2) the reviewer's pull-forward, (3) program order. Only pending units qualify.
  const level = s.competencies.oral_production.level;
  const pending = pendingUnits(level, s.roadmap.units);
  const label = (u: SyllabusUnit) => `${u.title} (${u.id})`;

  const recurringWithUnit = s.errors.items
    .filter((e) => e.status === "recurring" && e.unit_id)
    .sort((a, b) => b.frequency - a.frequency);
  let remedial: { unit: SyllabusUnit; error: ErrorRecord } | undefined;
  for (const e of recurringWithUnit) {
    const unit = pending.find((u) => u.id === e.unit_id);
    if (unit) {
      remedial = { unit, error: e };
      break;
    }
  }
  const pulled: SyllabusUnit | undefined = delta.suggested_focus.unit_id
    ? pending.find((u) => u.id === delta.suggested_focus.unit_id)
    : undefined;
  const current = remedial?.unit ?? pulled ?? pending[0] ?? null;

  s.roadmap.current_unit = current?.id ?? null;
  s.roadmap.current_focus = current ? label(current) : delta.suggested_focus.current_focus;
  s.roadmap.reason = remedial
    ? `Recurring error ${remedial.error.id} (${remedial.error.pattern}, seen ${remedial.error.frequency}x) is fixed by this unit.`
    : current
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
