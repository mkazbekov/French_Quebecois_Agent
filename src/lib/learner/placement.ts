import { defaultLearnerState } from "./defaults";
import { clampLevel, formatLevel, type Level } from "./levels";
import { SYLLABUS, pendingUnits, type SyllabusUnit } from "./syllabus";
import type { CompetencyKey, LearnerState, Roadmap, UnitProgress } from "./schema";

/**
 * Placement: a new learner either takes the first-call placement chat
 * (merge.ts handles that path when it reviews an `assessment` session while
 * `placement.status === "pending"`) or picks a starting level themselves
 * (this module; called from the /api/learner PATCH route). Pure functions,
 * no I/O, client-safe imports only — src/components/StartingLevel.tsx does
 * not import this module directly (it only calls the API), but the shape
 * mirrors what that route returns.
 */

/**
 * Confidence given to competencies set by self-selection or by a placement
 * jump. Must stay above LOW_CONFIDENCE (0.25, src/lib/tutor/instructions.ts)
 * so the very next auto call isn't immediately forced into another level
 * check. CONFIDENCE_DECAY_PER_SESSION is 0.05 (src/lib/learner/merge.ts): one
 * session where a competency goes unobserved only takes 0.35 down to 0.30,
 * still above LOW_CONFIDENCE, so a single quiet session never re-triggers an
 * assessment right after placement.
 */
export const PLACEMENT_CONFIDENCE = 0.35;

function unitLabel(u: SyllabusUnit): string {
  return `${u.title} (${u.id})`;
}

/**
 * Drop any previously credited entries, then mark every syllabus unit below
 * `level` as done-by-credit (not practised). Units the learner has actually
 * touched (credited === false) are left untouched.
 */
export function creditUnitsBelow(units: readonly UnitProgress[], level: Level): UnitProgress[] {
  const kept = units.filter((u) => !u.credited);
  const known = new Set(kept.map((u) => u.id));
  const credited: UnitProgress[] = SYLLABUS.filter((u) => u.level < level && !known.has(u.id)).map((u) => ({
    id: u.id,
    status: "done",
    credited: true,
    ok: 0,
    struggled: 0,
    next_review: null,
    interval_days: 0,
    last_practiced: null,
  }));
  return [...kept, ...credited];
}

/**
 * Recompute the roadmap's current unit / queue from the learner's current
 * oral production level and unit progress. `now` defaults to the current
 * time but can be pinned for deterministic tests.
 */
export function refreshRoadmapForLevel(state: LearnerState, reason: string, now: Date = new Date()): Roadmap {
  const level = state.competencies.oral_production.level;
  const pending = pendingUnits(level, state.roadmap.units);
  const current = pending[0] ?? null;
  return {
    ...state.roadmap,
    current_unit: current?.id ?? null,
    current_focus: current ? unitLabel(current) : state.roadmap.current_focus,
    reason,
    queue: pending
      .filter((u) => u.id !== current?.id)
      .slice(0, 6)
      .map(unitLabel),
    updated_at: now.toISOString(),
  };
}

/** Learner picks a starting level instead of taking the placement chat. */
export function setStartingLevel(state: LearnerState, level: number, now: Date): LearnerState {
  const lvl = clampLevel(level);
  const nowIso = now.toISOString();

  const competencies = { ...state.competencies };
  for (const key of Object.keys(competencies) as CompetencyKey[]) {
    const c = competencies[key];
    competencies[key] = { ...c, level: lvl, confidence: Math.max(c.confidence, PLACEMENT_CONFIDENCE) };
  }

  const units = creditUnitsBelow(state.roadmap.units, lvl);
  const withUnits: LearnerState = { ...state, competencies, roadmap: { ...state.roadmap, units } };
  const roadmap = refreshRoadmapForLevel(withUnits, `You chose to start at ${formatLevel(lvl)}.`, now);

  return {
    ...withUnits,
    roadmap,
    profile: { ...state.profile, placement: { status: "self_selected", level: lvl, set_at: nowIso } },
  };
}

/** Back to a pending placement: undo self-selection (or start over), keep profile identity/preferences. */
export function resetToPlacementTest(state: LearnerState): LearnerState {
  const fresh = defaultLearnerState(state.profile.name);
  return {
    ...state,
    competencies: fresh.competencies,
    roadmap: fresh.roadmap,
    profile: { ...state.profile, placement: { status: "pending", level: null, set_at: null } },
  };
}
