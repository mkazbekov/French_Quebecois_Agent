"use client";

import type { VocabFocus } from "@/lib/learner/schema";
import { MAX_CUSTOM_WORDS, VOCAB_THEMES, parseCustomWords } from "@/lib/learner/vocab-themes";

/*
  Shown under ModePicker only while "Learn words" is selected. The choice is held
  by the page and saved (PATCH /api/learner) when the learner presses Start.
  The custom list is kept as raw lines in `custom_words` so typing a newline or
  comma does not get eaten; the server parses it again with parseCustomWords.
*/

export function VocabFocusPicker({
  value,
  onChange,
  disabled,
}: {
  value: VocabFocus;
  onChange: (next: VocabFocus) => void;
  disabled?: boolean;
}) {
  const optionClass = (active: boolean) =>
    `border rounded-[10px] px-2.5 py-1.5 text-left text-[12px] text-ink focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
      active ? "border-primary-solid bg-primary-tint font-semibold" : "border-rule hover:border-primary"
    }`;

  const isCustom = value.source === "custom";
  const count = parseCustomWords(value.custom_words.join("\n")).length;

  return (
    <div role="group" aria-label="What words?" className="mt-3 text-left">
      <h4 className="font-display text-[13px] font-semibold text-ink">What words?</h4>

      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <button
          type="button"
          aria-pressed={!isCustom && value.theme_id === ""}
          disabled={disabled}
          onClick={() => onChange({ ...value, source: "theme", theme_id: "" })}
          className={optionClass(!isCustom && value.theme_id === "")}
        >
          Tutor picks a theme
        </button>
        {VOCAB_THEMES.map((t) => {
          const active = !isCustom && value.theme_id === t.id;
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={active}
              disabled={disabled}
              onClick={() => onChange({ ...value, source: "theme", theme_id: t.id })}
              className={optionClass(active)}
            >
              {t.label}
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={isCustom}
          disabled={disabled}
          onClick={() => onChange({ ...value, source: "custom" })}
          className={optionClass(isCustom)}
        >
          My own words
        </button>
      </div>

      {isCustom && (
        <div className="mt-2">
          <label htmlFor="vocab-custom-words" className="text-[11.5px] text-ink-soft">
            Your words
          </label>
          <textarea
            id="vocab-custom-words"
            rows={4}
            disabled={disabled}
            value={value.custom_words.join("\n")}
            onChange={(e) => onChange({ ...value, custom_words: e.target.value.split("\n") })}
            placeholder="One per line or comma-separated — French words, or English words you want in French"
            className="mt-1 w-full rounded-[10px] border border-rule bg-card p-2 text-[12.5px] text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-primary"
          />
          <p className={`text-[11px] ${count >= MAX_CUSTOM_WORDS ? "text-due" : "text-muted"}`}>
            {count} / {MAX_CUSTOM_WORDS} words
          </p>
        </div>
      )}

      <p className="mt-2 text-[10.5px] text-muted leading-snug">
        Themes follow Québec&apos;s official francisation framework (MIFI Programme-cadre, Échelle québécoise); Québec usage checked against
        Usito and the OQLF.
      </p>
    </div>
  );
}
