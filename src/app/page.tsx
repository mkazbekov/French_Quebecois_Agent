"use client";

import { useEffect, useState } from "react";
import { useTutorSession } from "@/hooks/useTutorSession";
import type { LearnerState, SessionMode } from "@/lib/learner/schema";
import { TutorHeader } from "@/components/TutorHeader";
import { MicOrb } from "@/components/MicOrb";
import { ModeChips } from "@/components/ModeChips";
import { LanguageToggle } from "@/components/LanguageToggle";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { SummaryCard } from "@/components/SummaryCard";

type LanguageMode = "auto" | "english_support" | "french_only";

export default function Home() {
  const { status, error, transcript, summary, provider, start, end, sendText, reset } = useTutorSession();
  const [learnerState, setLearnerState] = useState<LearnerState | null>(null);
  const [storeKind, setStoreKind] = useState<string | null>(null);
  const [selectedMode, setSelectedMode] = useState<SessionMode>("auto");
  const [languageModeError, setLanguageModeError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/learner")
      .then((res) => res.json())
      .then((data: { state: LearnerState; storeKind: string }) => {
        setLearnerState(data.state);
        setStoreKind(data.storeKind);
      })
      .catch(() => {
        // header falls back to placeholders
      });
  }, [status]);

  const isActive = status !== "idle" && status !== "done" && status !== "error";
  const isConnected = status === "listening" || status === "speaking";
  const isConnecting = status === "requesting_mic" || status === "connecting";

  useEffect(() => {
    if (!isActive) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") void end();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isActive, end]);

  const handleLanguageModeChange = (mode: LanguageMode) => {
    if (!learnerState) return;
    const previous = learnerState;
    setLanguageModeError(null);
    setLearnerState({
      ...learnerState,
      profile: {
        ...learnerState.profile,
        preferences: { ...learnerState.profile.preferences, language_mode: mode },
      },
    });
    fetch("/api/learner", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ language_mode: mode }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to save");
      })
      .catch(() => {
        setLearnerState(previous);
        setLanguageModeError("Couldn't save language setting.");
      });
  };

  return (
    <div className="flex-1 flex flex-col items-center gap-8 py-10 px-4">
      <TutorHeader state={learnerState} />

      <main className="flex-1 w-full max-w-xl mx-auto flex flex-col items-center gap-8">
        {status === "done" && summary ? (
          <SummaryCard summary={summary} onStartAnother={reset} />
        ) : status === "done" && !summary ? (
          <div className="w-full max-w-sm rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-5 text-center space-y-3">
            <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-100">Call ended</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              The review couldn&apos;t finish; it will retry next time you open the app.
            </p>
            {error && <p className="text-xs text-amber-700 dark:text-amber-400">{error}</p>}
            <button
              type="button"
              onClick={reset}
              className="w-full rounded-full bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 py-2.5 text-sm font-medium"
            >
              Start another
            </button>
          </div>
        ) : status === "ending" ? (
          <div className="w-full max-w-sm rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 text-center space-y-2">
            <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-100">Call ended</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              Saving your progress… you can close this tab; nothing will be lost.
            </p>
          </div>
        ) : (
          <>
            <MicOrb status={status} />

            {status === "error" && (
              <div className="w-full max-w-sm rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/40 dark:border-red-900 px-4 py-3 text-center">
                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                <button
                  type="button"
                  onClick={() => start(selectedMode)}
                  className="mt-3 rounded-full bg-red-600 text-white px-4 py-1.5 text-sm font-medium"
                >
                  Retry
                </button>
              </div>
            )}

            {!isActive && status !== "error" && (
              <button
                type="button"
                onClick={() => start(selectedMode)}
                className="w-full max-w-sm rounded-full bg-emerald-600 hover:bg-emerald-700 text-white py-4 text-lg font-semibold shadow-md transition-colors"
              >
                Start Conversation
              </button>
            )}

            {isActive && (
              <div className="w-full max-w-sm flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void end()}
                  className="w-full rounded-full bg-red-600 hover:bg-red-700 text-white py-4 text-lg font-semibold shadow-md transition-colors"
                >
                  {isConnecting ? "Cancel" : "End Conversation"}
                </button>
                <p className="text-[11px] text-zinc-400 dark:text-zinc-600">Esc · or say &quot;on arrête&quot;</p>
              </div>
            )}

            <ModeChips selected={selectedMode} onSelect={setSelectedMode} disabled={isActive} />

            <LanguageToggle
              value={learnerState?.profile.preferences.language_mode ?? "auto"}
              onChange={handleLanguageModeChange}
              disabled={isActive}
            />
            {languageModeError && (
              <p className="text-xs text-red-600 dark:text-red-400 text-center max-w-sm">{languageModeError}</p>
            )}

            {error && status !== "error" && (
              <p className="text-xs text-amber-600 dark:text-amber-400 text-center max-w-sm">{error}</p>
            )}

            <TranscriptPanel transcript={transcript} canSendText={isConnected} onSendText={sendText} />
          </>
        )}
      </main>

      <footer className="text-[11px] text-zinc-400 dark:text-zinc-600 pb-4">
        Memory: {storeKind ?? "…"}
        {provider ? ` · Voice: ${provider}` : ""}
      </footer>
    </div>
  );
}
