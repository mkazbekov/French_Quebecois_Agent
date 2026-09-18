import Link from "next/link";
import type { LearnerState } from "@/lib/learner/schema";

export function TutorHeader({ state }: { state: LearnerState | null }) {
  const level = state?.competencies.oral_production.level ?? "…";
  const focus = state?.roadmap.current_focus ?? "…";

  return (
    <header className="w-full max-w-xl mx-auto flex flex-col items-center gap-1 text-center px-4 pt-8">
      <h1 className="text-2xl font-semibold tracking-tight">French Tutor</h1>
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
    </header>
  );
}
