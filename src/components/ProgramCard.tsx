import Link from "next/link";
import { cefrEquivalent, stageOf } from "@/lib/learner/levels";
import { findUnit, levelProgress } from "@/lib/learner/syllabus";
import { dueItems } from "@/lib/learner/spacing";
import type { LearnerState } from "@/lib/learner/schema";

/**
 * The program, on the main screen. This card is the Atelier half of the
 * Cahier design: level, current unit, recurring errors and reviews due used
 * to live only on /review — here they sit next to the mic so the learner
 * sees the program without leaving the call screen. Server-safe: derives
 * everything from `state`, no client state of its own.
 */
export function ProgramCard({ state }: { state: LearnerState }) {
  const level = state.competencies.oral_production.level;
  const competency = state.competencies.oral_production;
  const pct = (level / 12) * 100;
  const stage = stageOf(level);
  const cefr = cefrEquivalent(level);
  const confidencePct = Math.round(competency.confidence * 100);

  const currentUnit = state.roadmap.current_unit ? findUnit(state.roadmap.current_unit) : undefined;
  const recurringCount = state.errors.items.filter((e) => e.status === "recurring").length;
  const due = dueItems(state, new Date());
  const dueCount = due.errors.length + due.vocabulary.length + due.units.length;
  const { done, total } = levelProgress(level, state.roadmap.units);

  return (
    <div className="bg-card border border-rule rounded-[13px] p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[9px] tracking-[.15em] uppercase text-muted">Your program</span>
        <span className="font-mono text-[9px] tracking-[.15em] uppercase text-muted tabular-nums">
          Session {state.profile.sessions_completed + 1}
        </span>
      </div>

      <div className="mt-2.5 flex items-center gap-3">
        <div
          className="grid h-[62px] w-[62px] shrink-0 place-items-center rounded-full"
          style={{ background: `conic-gradient(var(--primary-solid) 0 ${pct}%, var(--rule) ${pct}% 100%)` }}
        >
          <div className="grid h-[49px] w-[49px] place-items-center rounded-full bg-card text-center">
            <span className="font-display text-[19px] font-semibold leading-none tabular-nums">{level}</span>
            <span className="font-mono text-[8px] text-muted">/ 12</span>
          </div>
        </div>
        <div>
          <p className="font-display text-[15px] font-semibold text-ink capitalize">{stage}</p>
          <p className="text-[11.5px] text-muted">Oral production · ≈ {cefr}</p>
          <p className="text-[11.5px] text-muted tabular-nums">
            Confidence {confidencePct}% · {competency.evidence_count} observations
          </p>
        </div>
      </div>

      <div className="mt-1">
        <div className="flex items-center justify-between gap-2.5 border-t border-rule-soft py-2 text-[12px]">
          <span className="shrink-0 text-muted">Current unit</span>
          {currentUnit ? (
            <span className="rounded-[4px] bg-primary-tint px-[7px] py-[2px] font-mono text-[9.5px] font-medium tracking-[.04em] text-primary">
              {currentUnit.id} {currentUnit.title}
            </span>
          ) : (
            <span className="shrink-0 text-muted">Not set yet</span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2.5 border-t border-rule-soft py-2 text-[12px]">
          <span className="shrink-0 text-muted">Recurring errors</span>
          {recurringCount > 0 ? (
            <span className="rounded-[4px] bg-alert-tint px-[7px] py-[2px] font-mono text-[9.5px] font-medium tracking-[.04em] text-alert tabular-nums">
              {recurringCount}
            </span>
          ) : (
            <span className="font-semibold text-ink tabular-nums">0</span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2.5 border-t border-rule-soft py-2 text-[12px]">
          <span className="shrink-0 text-muted">Reviews due</span>
          {dueCount > 0 ? (
            <span className="rounded-[4px] bg-due-tint px-[7px] py-[2px] font-mono text-[9.5px] font-medium tracking-[.04em] text-due tabular-nums">
              {dueCount} today
            </span>
          ) : (
            <span className="font-semibold text-ink tabular-nums">0</span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2.5 border-t border-rule-soft py-2 text-[12px]">
          <span className="shrink-0 text-muted">Units completed</span>
          <span className="font-semibold text-ink tabular-nums">
            {done} / {total}
          </span>
        </div>
      </div>

      <div className="mt-1.5 flex items-center justify-between border-t border-rule pt-2.5">
        <span className="text-[11px] text-muted">{state.profile.sessions_completed} sessions</span>
        <Link
          href="/review"
          className="text-[11.5px] font-medium text-primary focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
        >
          Review mistakes →
        </Link>
      </div>
    </div>
  );
}
