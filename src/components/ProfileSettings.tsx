"use client";

import { useState } from "react";
import { StartingLevel } from "@/components/StartingLevel";
import { clearPendingSession } from "@/hooks/useTutorSession";
import type { LearnerState } from "@/lib/learner/schema";

/**
 * Collapsed-by-default "Profile" disclosure under the header: change your
 * name, change your level, or retake the level test. Disabled during a call.
 */
export function ProfileSettings({
  state,
  onChange,
  disabled,
}: {
  state: LearnerState;
  onChange: (next: LearnerState) => void;
  disabled?: boolean;
}) {
  const [name, setName] = useState(state.profile.name);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const trimmed = name.trim();
  const canSave = !disabled && !pending && trimmed.length > 0 && trimmed !== state.profile.name;

  function saveName() {
    if (!canSave) return;
    setPending(true);
    setError(null);
    fetch("/api/learner", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? "Couldn't save your name.");
        }
        const data = (await res.json()) as { state: LearnerState };
        onChange(data.state);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Couldn't save your name."))
      .finally(() => setPending(false));
  }

  function deleteProfile() {
    if (disabled || deletePending) return;
    if (!window.confirm("Delete your saved profile, progress and mistakes? You'll go through onboarding again.")) return;
    setDeletePending(true);
    setDeleteError(null);
    fetch("/api/learner", { method: "DELETE" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Couldn't delete your profile.");
        const data = (await res.json()) as { state: LearnerState };
        clearPendingSession();
        onChange(data.state);
      })
      .catch((err: unknown) => setDeleteError(err instanceof Error ? err.message : "Couldn't delete your profile."))
      .finally(() => setDeletePending(false));
  }

  return (
    <details className="mt-2 w-full max-w-xs">
      <summary className="cursor-pointer text-center text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
        Profile
      </summary>
      <div className="mt-3 flex flex-col items-center gap-3">
        <div className="flex w-full items-center gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            disabled={disabled || pending}
            className="flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-1.5 text-sm disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            type="button"
            disabled={!canSave}
            onClick={saveName}
            className="rounded-full bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 px-3.5 py-1.5 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save
          </button>
        </div>
        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        <StartingLevel state={state} onChange={onChange} disabled={disabled} />
        <button
          type="button"
          disabled={disabled || deletePending}
          onClick={deleteProfile}
          className="text-[11px] text-red-500 underline decoration-dotted hover:text-red-700 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
        >
          Delete profile & start over
        </button>
        {deleteError && <p className="text-xs text-red-600 dark:text-red-400">{deleteError}</p>}
      </div>
    </details>
  );
}
