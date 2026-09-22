import Link from "next/link";
import { cefrEquivalent, stageOf } from "@/lib/learner/levels";
import type { LearnerState } from "@/lib/learner/schema";
import { ProfileSettings } from "@/components/ProfileSettings";

export function TutorHeader({
  state,
  onChange,
  disabled,
}: {
  state: LearnerState | null;
  onChange: (next: LearnerState) => void;
  disabled?: boolean;
}) {
  const showRibbon = !!state && state.profile.onboarded_at !== null;
  const level = state?.competencies.oral_production.level ?? null;
  const name = state?.profile.name.trim();

  return (
    <div className="w-full max-w-5xl mx-auto">
      <header className="flex items-center justify-between gap-3 px-4 pt-8">
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- static, tiny local SVG mark; next/image is overkill here */}
          <img src="/logo.svg" alt="" width={21} height={21} className="shrink-0" />
          <h1 className="font-display text-[18px] font-semibold tracking-[-.01em]">French Tutor</h1>
        </div>
        {showRibbon && (
          <div className="flex items-center gap-3">
            <Link
              href="/review"
              className="shrink-0 whitespace-nowrap border-b border-dotted border-rule text-[11.5px] text-muted focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
            >
              Review mistakes
            </Link>
            {/* keyed by name so the input re-seeds when the saved name changes */}
            <ProfileSettings key={state!.profile.name} state={state!} onChange={onChange} disabled={disabled} />
          </div>
        )}
      </header>
      {showRibbon && level !== null && (
        <div className="border-y border-rule px-3.5 py-[7px] text-center font-mono text-[9.5px] tracking-[.09em] uppercase text-muted">
          {name} · Niveau <b className="font-bold text-primary">{level} / 12</b> · <span className="capitalize">{stageOf(level)}</span> ≈ {cefrEquivalent(level)}
        </div>
      )}
    </div>
  );
}
