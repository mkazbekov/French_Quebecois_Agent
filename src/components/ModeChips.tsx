import type { SessionMode } from "@/lib/learner/schema";

const CHIPS: { mode: Exclude<SessionMode, "auto">; label: string }[] = [
  { mode: "free", label: "Free Conversation" },
  { mode: "guided", label: "Guided Practice" },
  { mode: "lesson", label: "Lesson" },
  { mode: "quebec", label: "Québec Mode" },
  { mode: "correction", label: "Correction Mode" },
  { mode: "assessment", label: "Level Check" },
];

export function ModeChips({
  selected,
  onSelect,
  disabled,
}: {
  selected: SessionMode;
  onSelect: (mode: SessionMode) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap justify-center gap-2 max-w-sm">
      {CHIPS.map(({ mode, label }) => {
        const active = selected === mode;
        return (
          <button
            key={mode}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(active ? "auto" : mode)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors border disabled:opacity-50 disabled:cursor-not-allowed ${
              active
                ? "bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100"
                : "bg-transparent text-zinc-600 border-zinc-300 hover:border-zinc-400 dark:text-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-500"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
