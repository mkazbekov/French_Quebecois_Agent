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
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-[9px] tracking-[.15em] uppercase text-muted">Language</span>
      <div className="flex rounded-full border border-rule overflow-hidden">
        {OPTIONS.map(({ mode, label }) => {
          const active = value === mode;
          return (
            <button
              key={mode}
              type="button"
              disabled={disabled}
              aria-pressed={active}
              onClick={() => onChange(mode)}
              className={`text-[10.5px] px-2.5 py-1 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 ${
                active ? "bg-ink text-paper" : "text-ink-soft"
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
