"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { clearPendingSession } from "@/hooks/useTutorSession";
import type { LearnerState } from "@/lib/learner/schema";

const CONFIRM_MESSAGE =
  "Clear your learning history? Your progress, mistakes, vocabulary and past sessions will be erased. Your name and settings stay.";

/**
 * "Clear learning history": wipes sessions/mistakes/vocabulary/progress via
 * DELETE /api/learner?scope=history, keeping the learner's name and
 * preferences (see clearLearningHistory in src/lib/learner/placement.ts).
 * Distinct from "Delete profile & start over" in ProfileSettings, which
 * returns the learner to onboarding — that one is untouched.
 */
export function ClearHistoryButton({
  onCleared,
  disabled,
  className,
}: {
  onCleared?: (next: LearnerState) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function clear() {
    if (disabled || pending) return;
    if (!window.confirm(CONFIRM_MESSAGE)) return;
    setPending(true);
    setError(null);
    fetch("/api/learner?scope=history", { method: "DELETE" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Couldn't clear your learning history.");
        const data = (await res.json()) as { state: LearnerState };
        clearPendingSession();
        onCleared?.(data.state);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Couldn't clear your learning history."))
      .finally(() => setPending(false));
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        disabled={disabled || pending}
        onClick={clear}
        className={
          className ??
          "rounded-full border border-alert px-4 py-1.5 text-[13px] font-semibold text-alert hover:bg-alert-tint disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
        }
      >
        {pending ? "Clearing…" : "Clear learning history"}
      </button>
      {error && <p className="text-xs text-alert">{error}</p>}
    </div>
  );
}

/**
 * Review page variant: clears history, then leaves the (now stale) review
 * page for the home screen, refreshing so a later back-navigation to /review
 * re-renders from the server with the cleared state.
 */
export function ClearHistoryAndGoHome({ disabled, className }: { disabled?: boolean; className?: string }) {
  const router = useRouter();
  return (
    <ClearHistoryButton
      disabled={disabled}
      className={className}
      onCleared={() => {
        router.push("/");
        router.refresh();
      }}
    />
  );
}
