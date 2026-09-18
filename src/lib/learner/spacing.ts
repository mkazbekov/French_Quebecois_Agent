import type { ErrorRecord, LearnerState, UnitProgress, VocabEntry } from "./schema";
import { findUnit, type SyllabusUnit } from "./syllabus";

/**
 * Spaced review: every remembered weakness gets a `next_review` date. Intervals
 * grow while the learner keeps getting it right and reset when they slip.
 * Everything here is deterministic; merge.ts calls it, instructions.ts reads it.
 */

const DAY = 86_400_000;

export function addDays(now: Date, days: number): string {
  return new Date(now.getTime() + days * DAY).toISOString();
}

export function isDue(nextReview: string | null | undefined, now: Date): boolean {
  return !!nextReview && new Date(nextReview).getTime() <= now.getTime();
}

/** Errors: seen again → soon; improving → a week; resolved → three weeks (a check). */
export const ERROR_INTERVAL_DAYS: Record<ErrorRecord["status"], number> = {
  new: 2,
  recurring: 2,
  improving: 7,
  resolved: 21,
};

/** Vocabulary: struggled or just introduced → tomorrow; each correct use doubles the gap (2, 4, 8 … 60 days). */
export function vocabIntervalDays(entry: Pick<VocabEntry, "status" | "times_used_correctly">): number {
  if (entry.status !== "known") return 1;
  return Math.min(60, 2 ** Math.min(6, entry.times_used_correctly));
}

/** Finished syllabus units: first check after two weeks, then doubling, capped at 90 days. */
export const UNIT_FIRST_INTERVAL_DAYS = 14;
export const UNIT_MAX_INTERVAL_DAYS = 90;

export interface DueItems {
  errors: ErrorRecord[];
  vocabulary: VocabEntry[];
  units: Array<{ progress: UnitProgress; unit: SyllabusUnit }>;
}

/** Everything whose review date has passed, most overdue first. */
export function dueItems(state: LearnerState, now: Date): DueItems {
  const byDate = <T extends { next_review: string | null }>(xs: T[]) =>
    xs.filter((x) => isDue(x.next_review, now)).sort((a, b) => new Date(a.next_review!).getTime() - new Date(b.next_review!).getTime());
  return {
    errors: byDate(state.errors.items),
    vocabulary: byDate(state.vocabulary.items),
    units: byDate(state.roadmap.units)
      .map((progress) => ({ progress, unit: findUnit(progress.id) }))
      .filter((x): x is { progress: UnitProgress; unit: SyllabusUnit } => !!x.unit),
  };
}

/** Recurring errors that are due: two or more of them make the next auto call a remediation drill. */
export function recurringDue(state: LearnerState, now: Date): ErrorRecord[] {
  return state.errors.items.filter((e) => e.status === "recurring" && (e.next_review === null || isDue(e.next_review, now)));
}
