"use client";

import { useRef, useState } from "react";
import { ClearHistoryButton } from "@/components/ClearHistoryButton";
import { StartingLevel } from "@/components/StartingLevel";
import { clearPendingSession } from "@/hooks/useTutorSession";
import type { LearnerState } from "@/lib/learner/schema";

const LABEL = "font-mono text-[9px] tracking-[.15em] uppercase text-muted";
const FOCUS = "focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2";

/**
 * "Profile" button in the header that opens a sheet (bottom sheet on phones,
 * centered modal from `sm` up): change your name, change your level, retake the
 * level test, clear history or delete the profile. Disabled during a call.
 * The dialog itself stays mounted; only the inner form is keyed by the saved
 * name, so saving re-seeds the input without closing the sheet.
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
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const initial = Array.from(state.profile.name.trim())[0]?.toUpperCase() ?? "?";

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => dialogRef.current?.showModal()}
        className={`inline-flex min-h-9 items-center gap-1.5 text-[11.5px] text-muted hover:text-ink disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS}`}
      >
        <span
          aria-hidden="true"
          className="grid h-5 w-5 place-items-center rounded-full bg-primary-tint text-[10px] font-semibold text-primary"
        >
          {initial}
        </span>
        Profile
      </button>
      <dialog
        ref={dialogRef}
        aria-label="Profile"
        onClick={(e) => {
          // a click on the backdrop lands on the dialog element itself, not on the inner div
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
        className="m-0 mt-auto max-h-[85dvh] w-full max-w-none overflow-y-auto rounded-t-[16px] border border-rule bg-card p-0 text-ink backdrop:bg-black/40 sm:m-auto sm:max-w-md sm:rounded-[16px]"
      >
        <div className="px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-[17px] font-semibold">Profile</h2>
            <button
              type="button"
              aria-label="Close"
              onClick={() => dialogRef.current?.close()}
              className={`grid h-9 w-9 place-items-center rounded-full text-[22px] leading-none text-muted hover:text-ink ${FOCUS}`}
            >
              &times;
            </button>
          </div>
          <ProfileForm
            key={state.profile.name}
            state={state}
            onChange={onChange}
            disabled={disabled}
            onDeleted={() => dialogRef.current?.close()}
          />
        </div>
      </dialog>
    </>
  );
}

function ProfileForm({
  state,
  onChange,
  disabled,
  onDeleted,
}: {
  state: LearnerState;
  onChange: (next: LearnerState) => void;
  disabled?: boolean;
  onDeleted: () => void;
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
        onDeleted();
      })
      .catch((err: unknown) => setDeleteError(err instanceof Error ? err.message : "Couldn't delete your profile."))
      .finally(() => setDeletePending(false));
  }

  return (
    <div className="mt-3 flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <h3 className={LABEL}>Name</h3>
        <div className="flex w-full items-center gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            disabled={disabled || pending}
            aria-label="Your name"
            className={`min-w-0 flex-1 rounded-[8px] border border-rule bg-transparent px-3 py-2 text-base text-ink disabled:opacity-50 focus:outline-none ${FOCUS}`}
          />
          <button
            type="button"
            disabled={!canSave}
            onClick={saveName}
            className={`min-h-9 rounded-[8px] bg-ink px-4 text-[12px] font-medium text-paper disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS}`}
          >
            Save
          </button>
        </div>
        {error && <p className="text-xs text-alert">{error}</p>}
      </section>
      <section className="flex flex-col gap-2">
        <h3 className={LABEL}>Level</h3>
        <StartingLevel state={state} onChange={onChange} disabled={disabled} />
      </section>
      <section className="flex flex-col items-start gap-3 border-t border-rule-soft pt-4">
        <h3 className={LABEL}>Danger zone</h3>
        <ClearHistoryButton onCleared={onChange} disabled={disabled} />
        <button
          type="button"
          disabled={disabled || deletePending}
          onClick={deleteProfile}
          className={`min-h-9 text-[12px] text-alert hover:opacity-80 disabled:opacity-50 ${FOCUS}`}
        >
          Delete profile & start over
        </button>
        {deleteError && <p className="text-xs text-alert">{deleteError}</p>}
      </section>
    </div>
  );
}
