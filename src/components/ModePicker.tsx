"use client";

import type { SessionMode } from "@/lib/learner/schema";
import { AUTO_COPY, MODE_COPY, MODE_ORDER, type PickableMode, modeLabel } from "@/lib/tutor/modes";

/*
  Always-visible grid under the Start button: what ModeChips used to hide
  behind a 12px "change" link. "Tutor decides" spans both columns and, once
  /api/learner has answered, names what it will actually pick today.
*/

export function ModePicker({
  selected,
  plannedMode,
  onSelect,
  disabled,
}: {
  selected: SessionMode;
  plannedMode: PickableMode | null;
  onSelect: (mode: SessionMode) => void;
  disabled?: boolean;
}) {
  function choose(mode: SessionMode) {
    onSelect(selected === mode ? "auto" : mode);
  }

  const optionClass = (active: boolean) =>
    `border rounded-[10px] p-2.5 text-left focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
      active ? "border-primary-solid bg-primary-tint" : "border-rule hover:border-primary"
    }`;

  return (
    <div
      role="group"
      aria-label="What do you want to do today?"
      className="w-full border-t border-rule-soft pt-3 text-left"
    >
      <h3 className="font-display text-[14.5px] font-semibold text-ink">What do you want to do today?</h3>
      <p className="text-[11.5px] text-muted">Pick one, or let the tutor choose. You can change it before you start.</p>

      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        <button
          type="button"
          aria-pressed={selected === "auto"}
          disabled={disabled}
          onClick={() => onSelect("auto")}
          className={`sm:col-span-2 ${optionClass(selected === "auto")}`}
        >
          <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink">
            <span>{AUTO_COPY.label}</span>
            <span className="font-mono text-[9px] tracking-[.14em] uppercase text-primary">recommended</span>
          </div>
          {plannedMode ? (
            <p className="mt-0.5 text-[11px] text-ink-soft leading-snug">
              Today it picks: {modeLabel(plannedMode)} — {MODE_COPY[plannedMode].blurb}
            </p>
          ) : (
            <p className="mt-0.5 text-[11px] text-ink-soft leading-snug">{AUTO_COPY.blurb}</p>
          )}
        </button>

        {MODE_ORDER.map((mode) => {
          const copy = MODE_COPY[mode];
          const active = selected === mode;
          return (
            <button
              key={mode}
              type="button"
              aria-pressed={active}
              disabled={disabled}
              onClick={() => choose(mode)}
              className={optionClass(active)}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[12.5px] font-semibold text-ink">{copy.label}</span>
                <span className="shrink-0 text-[10px] text-muted">{copy.length}</span>
              </div>
              <p className="mt-0.5 text-[11px] text-ink-soft leading-snug">{copy.blurb}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
