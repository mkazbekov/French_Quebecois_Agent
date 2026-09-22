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
      <summary className="cursor-pointer text-center text-[11.5px] text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2">
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
            className="flex-1 rounded-[8px] border border-rule bg-transparent px-3 py-1.5 text-sm text-ink disabled:opacity-50 focus:outline-none focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
          />
          <button
            type="button"
            disabled={!canSave}
            onClick={saveName}
            className="rounded-[8px] bg-ink text-paper text-[11px] font-medium px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
          >
            Save
          </button>
        </div>
        {error && <p className="text-xs text-alert">{error}</p>}
        <StartingLevel state={state} onChange={onChange} disabled={disabled} />
        <button
          type="button"
          disabled={disabled || deletePending}
          onClick={deleteProfile}
          className="text-[11px] text-alert hover:opacity-80 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
        >
          Delete profile & start over
        </button>
        {deleteError && <p className="text-xs text-alert">{deleteError}</p>}
      </div>
    </details>
  );
}
