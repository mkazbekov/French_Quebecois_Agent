"use client";

import { useState } from "react";
import type { SessionMode } from "@/lib/learner/schema";

const CHIPS: { mode: Exclude<SessionMode, "auto">; label: string }[] = [
  { mode: "free", label: "Free Conversation" },
  { mode: "guided", label: "Guided Practice" },
  { mode: "lesson", label: "Lesson" },
  { mode: "quebec", label: "Québec Mode" },
  { mode: "correction", label: "Correction Mode" },
  { mode: "assessment", label: "Level Check" },
  { mode: "remediation", label: "Drill My Errors" },
];

const AUTO_LABEL = "Tutor decides";

export function ModeChips({
  selected,
  onSelect,
  disabled,
}: {
  selected: SessionMode;
  onSelect: (mode: SessionMode) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const currentLabel = selected === "auto" ? AUTO_LABEL : CHIPS.find((c) => c.mode === selected)?.label ?? AUTO_LABEL;

  function choose(mode: SessionMode) {
    onSelect(mode);
    setOpen(false);
  }

  return (
    <div className="relative w-full max-w-sm">
      <div className="text-[12px] text-ink-soft">
        Today: <b className="text-ink font-semibold">{currentLabel}</b>{" "}
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          className="text-primary underline underline-offset-2 text-[12px] disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
        >
          change
        </button>
      </div>

      {open && !disabled ? (
        <div className="absolute z-10 mt-1.5 w-full bg-card border border-rule rounded-[13px] p-3.5">
          <button
            type="button"
            onClick={() => choose("auto")}
            className="w-full flex items-center justify-between text-left py-2 px-1 text-[12.5px] focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
          >
            <span>{AUTO_LABEL}</span>
            {selected === "auto" ? (
              <span className="font-mono text-[9px] tracking-[.15em] uppercase text-primary">on</span>
            ) : null}
          </button>
          {CHIPS.map(({ mode, label }) => {
            const active = selected === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => choose(active ? "auto" : mode)}
                className="w-full flex items-center justify-between text-left py-2 px-1 border-t border-rule-soft text-[12.5px] focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
              >
                <span>{label}</span>
                {active ? (
                  <span className="font-mono text-[9px] tracking-[.15em] uppercase text-primary">on</span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
