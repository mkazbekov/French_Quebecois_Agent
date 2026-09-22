"use client";

import { useState } from "react";
import { LEVELS, LEVEL_DESCRIPTORS, formatLevel } from "@/lib/learner/levels";
import type { LearnerState } from "@/lib/learner/schema";

/**
 * Level picker: pick a starting/new level, or retake the placement chat.
 * Used inside Onboarding (first run) and ProfileSettings (any time after).
 */

export const QUICK_PICKS: { level: number; label: string }[] = [
  { level: 1, label: "Total beginner" },
  { level: 3, label: "I know the basics" },
  { level: 5, label: "Everyday conversations" },
  { level: 7, label: "Comfortable" },
  { level: 9, label: "Advanced" },
];

const chipClass =
  "rounded-[8px] px-3.5 py-1.5 text-xs font-medium transition-colors border disabled:opacity-50 disabled:cursor-not-allowed bg-transparent text-ink-soft border-rule hover:border-primary focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2";
const chipActiveClass =
  "rounded-[8px] px-3.5 py-1.5 text-xs font-medium transition-colors border disabled:opacity-50 disabled:cursor-not-allowed bg-primary-tint text-primary border-primary focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2";

export function StartingLevel({
  state,
  onChange,
  disabled,
}: {
  state: LearnerState;
  onChange: (next: LearnerState) => void;
  disabled?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [previewLevel, setPreviewLevel] = useState<number | null>(null);

  const placement = state.profile.placement;
  const busy = disabled || pending;

  function patch(body: Record<string, unknown>, optimistic: LearnerState) {
    const previous = state;
    setError(null);
    setPending(true);
    onChange(optimistic);
    fetch("/api/learner", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? "Couldn't save your choice.");
        }
        const data = (await res.json()) as { state: LearnerState };
        onChange(data.state);
      })
      .catch((err: unknown) => {
        onChange(previous);
        setError(err instanceof Error ? err.message : "Couldn't save your choice.");
      })
      .finally(() => setPending(false));
  }

  function pickLevel(level: number) {
    const optimistic: LearnerState = {
      ...state,
      profile: { ...state.profile, placement: { status: "self_selected", level, set_at: new Date().toISOString() } },
    };
    patch({ starting_level: level }, optimistic);
    setEditing(false);
  }

  function takeTest() {
    const optimistic: LearnerState = {
      ...state,
      profile: { ...state.profile, placement: { status: "pending", level: null, set_at: null } },
    };
    patch({ placement: "test" }, optimistic);
  }

  if (placement.status !== "pending" && !editing) {
    return (
      <div className="flex flex-col items-center gap-1.5 max-w-sm text-center">
        <p className="text-xs text-ink-soft">Current level: {formatLevel(state.competencies.oral_production.level)}.</p>
        <div className="flex gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => setEditing(true)}
            className="text-[11px] text-muted hover:text-ink border-b border-dotted border-rule disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
          >
            Change level
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={takeTest}
            className="text-[11px] text-muted hover:text-ink border-b border-dotted border-rule disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
          >
            Retake the level test
          </button>
        </div>
        {error && <p className="text-xs text-alert">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1.5 max-w-sm text-center">
      <span className="text-[11px] text-muted">Where should we start?</span>
      <p className="text-xs text-ink-soft">
        {placement.status === "pending"
          ? state.profile.sessions_completed === 0
            ? "Your first call is a relaxed placement chat that finds your level. Or pick a starting point:"
            : "Your next call is a level check. Or pick a level yourself:"
          : "Pick a different starting level:"}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {QUICK_PICKS.map(({ level, label }) => (
          <button
            key={level}
            type="button"
            disabled={busy}
            aria-pressed={placement.level === level}
            onClick={() => pickLevel(level)}
            className={`flex flex-col items-center gap-0.5 ${placement.level === level ? chipActiveClass : chipClass}`}
          >
            <span>{label}</span>
            <span className="text-[10px] text-muted">{formatLevel(level)}</span>
          </button>
        ))}
      </div>
      <details className="w-full">
        <summary className="cursor-pointer text-[11px] text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2">
          Pick an exact level
        </summary>
        <div className="mt-2 flex flex-wrap justify-center gap-1.5">
          {LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              disabled={busy}
              aria-pressed={placement.level === level}
              onMouseEnter={() => setPreviewLevel(level)}
              onFocus={() => setPreviewLevel(level)}
              onClick={() => pickLevel(level)}
              className={`h-8 w-8 rounded-full text-xs font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 ${
                placement.level === level
                  ? "bg-primary-solid text-on-primary border-primary-solid"
                  : "bg-transparent text-ink-soft border-rule hover:border-primary"
              }`}
            >
              {level}
            </button>
          ))}
        </div>
        {previewLevel !== null && (
          <p className="mt-2 text-left text-[11px] text-ink-soft">
            <strong>{formatLevel(previewLevel)}:</strong> {LEVEL_DESCRIPTORS[previewLevel]}
          </p>
        )}
      </details>
      {error && <p className="text-xs text-alert">{error}</p>}
    </div>
  );
}
