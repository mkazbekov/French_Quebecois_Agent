type LanguageMode = "auto" | "english_support" | "french_only";

const OPTIONS: { mode: LanguageMode; label: string }[] = [
  { mode: "auto", label: "Auto" },
  { mode: "english_support", label: "English help" },
  { mode: "french_only", label: "French only" },
];

export function LanguageToggle({
  value,
  onChange,
  disabled,
}: {
  value: LanguageMode;
  onChange: (mode: LanguageMode) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="text-[11px] text-zinc-400 dark:text-zinc-600">Language</span>
      <div className="flex flex-wrap justify-center gap-2 max-w-sm">
        {OPTIONS.map(({ mode, label }) => {
          const active = value === mode;
          return (
            <button
              key={mode}
              type="button"
              disabled={disabled}
              onClick={() => onChange(mode)}
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
    </div>
  );
}
