"use client";

import { useState } from "react";
import { LEVELS, LEVEL_DESCRIPTORS, formatLevel } from "@/lib/learner/levels";
import type { LearnerState } from "@/lib/learner/schema";

/**
 * First-run only: let a new learner either take the placement chat (default)
 * or pick a starting level themselves. Disappears once the first session is
 * finished (page.tsx gates on sessions_completed === 0).
 */

const QUICK_PICKS: { level: number; label: string }[] = [
  { level: 1, label: "Total beginner" },
  { level: 3, label: "I know the basics" },
  { level: 5, label: "Everyday conversations" },
  { level: 7, label: "Comfortable" },
  { level: 9, label: "Advanced" },
];

const chipClass =
  "rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors border disabled:opacity-50 disabled:cursor-not-allowed bg-transparent text-zinc-600 border-zinc-300 hover:border-zinc-400 dark:text-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-500";
const chipActiveClass =
  "rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors border disabled:opacity-50 disabled:cursor-not-allowed bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100";

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

  if (placement.status === "self_selected" && !editing) {
    return (
      <div className="flex flex-col items-center gap-1.5 max-w-sm text-center">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Starting at {formatLevel(placement.level ?? 1)}. Your first call starts the program at that level.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => setEditing(true)}
            className="text-[11px] text-zinc-500 underline decoration-dotted hover:text-zinc-700 disabled:opacity-50 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            change
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={takeTest}
            className="text-[11px] text-zinc-500 underline decoration-dotted hover:text-zinc-700 disabled:opacity-50 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            Take the placement test instead
          </button>
        </div>
        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1.5 max-w-sm text-center">
      <span className="text-[11px] text-zinc-400 dark:text-zinc-600">Where should we start?</span>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        {placement.status === "pending"
          ? "Your first call is a relaxed placement chat that finds your level. Or pick a starting point:"
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
            <span className="text-[10px] opacity-70">{formatLevel(level)}</span>
          </button>
        ))}
      </div>
      <details className="w-full">
        <summary className="cursor-pointer text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
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
              className={`h-8 w-8 rounded-full text-xs font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                placement.level === level
                  ? "bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100"
                  : "bg-transparent text-zinc-600 border-zinc-300 hover:border-zinc-400 dark:text-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-500"
              }`}
            >
              {level}
            </button>
          ))}
        </div>
        {previewLevel !== null && (
          <p className="mt-2 text-left text-[11px] text-zinc-500 dark:text-zinc-400">
            <strong>{formatLevel(previewLevel)}:</strong> {LEVEL_DESCRIPTORS[previewLevel]}
          </p>
        )}
      </details>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
