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
  "flex flex-col items-center gap-0.5 rounded-[8px] px-3.5 py-1.5 text-xs font-medium transition-colors border disabled:opacity-50 disabled:cursor-not-allowed bg-transparent text-ink-soft border-rule hover:border-primary focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2";

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
        className="w-full max-w-sm bg-card border border-rule rounded-[13px] p-6 flex flex-col items-center gap-4"
      >
        <h2 className="font-display text-[19px] font-semibold text-ink text-center">What should I call you?</h2>
        <input
          autoFocus
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          placeholder="Your name"
          className="w-full rounded-[8px] border border-rule bg-transparent px-3.5 py-2.5 text-sm text-center text-ink focus:outline-none focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
        />
        <button
          type="submit"
          disabled={!name.trim()}
          className="w-full rounded-full bg-primary-solid text-on-primary py-2.5 text-[14px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
        >
          Continue
        </button>
      </form>
    );
  }

  const displayName = name.trim();

  return (
    <div className="w-full max-w-sm bg-card border border-rule rounded-[13px] p-6 flex flex-col items-center gap-4 text-center">
      <h2 className="font-display text-[19px] font-semibold text-ink">Salut {displayName} ! How&apos;s your French?</h2>
      <div className="flex flex-wrap justify-center gap-2">
        {QUICK_PICKS.map(({ level, label }) => (
          <button key={level} type="button" disabled={pending} onClick={() => choose(level)} className={chipClass}>
            <span>{label}</span>
            <span className="text-[10px] text-muted">{formatLevel(level)}</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() => choose("test")}
        className="w-full rounded-full bg-ink text-paper py-2.5 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
      >
        Not sure — find my level
      </button>
      <p className="text-[11px] text-muted">
        Your first call is a short, relaxed placement chat that finds your level for you.
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={() => setStep("name")}
        className="text-[11px] text-muted hover:text-ink disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
      >
        Back
      </button>
      {error && <p className="text-xs text-alert">{error}</p>}
    </div>
  );
}
