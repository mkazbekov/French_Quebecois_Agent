import Link from "next/link";
import { formatLevel } from "@/lib/learner/levels";
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
  const level = state ? formatLevel(state.competencies.oral_production.level) : "…";
  const focus = state?.roadmap.current_focus ?? "…";
  const name = state?.profile.name.trim();

  return (
    <header className="w-full max-w-xl mx-auto flex flex-col items-center gap-1 text-center px-4 pt-8">
      <div className="flex items-center justify-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- static, tiny local SVG mark; next/image is overkill here */}
        <img src="/logo.svg" alt="" width={28} height={28} className="shrink-0" />
        <h1 className="text-2xl font-semibold tracking-tight">French Tutor</h1>
      </div>
      {state && state.profile.onboarded_at !== null && (
        <>
          {name && <p className="text-sm text-zinc-500 dark:text-zinc-400">Salut, {name}</p>}
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Estimated level: <span className="font-medium text-zinc-700 dark:text-zinc-300">{level}</span>
          </p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Current focus: <span className="font-medium text-zinc-700 dark:text-zinc-300">{focus}</span>
          </p>
          <Link
            href="/review"
            className="mt-2 text-xs text-zinc-400 underline decoration-dotted hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            Review mistakes
          </Link>
          {/* keyed by name so the input re-seeds when the saved name changes */}
          <ProfileSettings key={state.profile.name} state={state} onChange={onChange} disabled={disabled} />
        </>
      )}
    </header>
  );
}
