"use client";

import { useState, type FormEvent } from "react";
import { formatLevel } from "@/lib/learner/levels";
import type { LearnerState } from "@/lib/learner/schema";
import { QUICK_PICKS } from "@/components/StartingLevel";

/**
 * First-time onboarding: name, then a starting level (or "not sure — find my
 * level"). Shown instead of the main controls while profile.onboarded_at is
 * null (see page.tsx). One PATCH { onboarding } on the final choice; the
 * parent swaps back to the normal screen once onChange delivers the state
 * with onboarded_at set.
 */

const chipClass =
  "flex flex-col items-center gap-0.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors border disabled:opacity-50 disabled:cursor-not-allowed bg-transparent text-zinc-600 border-zinc-300 hover:border-zinc-400 dark:text-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-500";

export function Onboarding({ state, onChange }: { state: LearnerState; onChange: (next: LearnerState) => void }) {
  const [step, setStep] = useState<"name" | "level">("name");
  const [name, setName] = useState(state.profile.name);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submitName(e: FormEvent) {
    e.preventDefault();
    if (name.trim()) setStep("level");
  }

  function choose(level: number | "test") {
    setPending(true);
    setError(null);
    fetch("/api/learner", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ onboarding: { name, level } }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? "Couldn't save that.");
        }
        const data = (await res.json()) as { state: LearnerState };
        onChange(data.state);
      })
      .catch((err: unknown) => {
        setPending(false);
        setError(err instanceof Error ? err.message : "Couldn't save that.");
      });
  }

  if (step === "name") {
    return (
      <form
        onSubmit={submitName}
        className="w-full max-w-sm rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 flex flex-col items-center gap-4"
      >
        <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-100 text-center">What should I call you?</h2>
        <input
          autoFocus
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          placeholder="Your name"
          className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3.5 py-2.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <button
          type="submit"
          disabled={!name.trim()}
          className="w-full rounded-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2.5 text-sm font-medium transition-colors"
        >
          Continue
        </button>
      </form>
    );
  }

  const displayName = name.trim();

  return (
    <div className="w-full max-w-sm rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 flex flex-col items-center gap-4 text-center">
      <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-100">Salut {displayName} ! How&apos;s your French?</h2>
      <div className="flex flex-wrap justify-center gap-2">
        {QUICK_PICKS.map(({ level, label }) => (
          <button key={level} type="button" disabled={pending} onClick={() => choose(level)} className={chipClass}>
            <span>{label}</span>
            <span className="text-[10px] opacity-70">{formatLevel(level)}</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() => choose("test")}
        className="w-full rounded-full bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 py-2.5 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        Not sure — find my level
      </button>
      <p className="text-[11px] text-zinc-400 dark:text-zinc-600">
        Your first call is a short, relaxed placement chat that finds your level for you.
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={() => setStep("name")}
        className="text-[11px] text-zinc-500 underline decoration-dotted hover:text-zinc-700 disabled:opacity-50 dark:text-zinc-400 dark:hover:text-zinc-200"
      >
        Back
      </button>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
