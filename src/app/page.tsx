"use client";

import { useEffect, useState } from "react";
import { useTutorSession } from "@/hooks/useTutorSession";
import type { LearnerState, SessionMode } from "@/lib/learner/schema";
import { TutorHeader } from "@/components/TutorHeader";
import { MicOrb } from "@/components/MicOrb";
import { ModeChips } from "@/components/ModeChips";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { SummaryCard } from "@/components/SummaryCard";

export default function Home() {
  const { status, error, transcript, summary, provider, start, end, sendText, reset } = useTutorSession();
  const [learnerState, setLearnerState] = useState<LearnerState | null>(null);
  const [storeKind, setStoreKind] = useState<string | null>(null);
  const [selectedMode, setSelectedMode] = useState<SessionMode>("auto");

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

  return (
    <div className="flex-1 flex flex-col items-center gap-8 py-10 px-4">
      <TutorHeader state={learnerState} />

      <main className="flex-1 w-full max-w-xl mx-auto flex flex-col items-center gap-8">
        {status === "done" && summary ? (
          <SummaryCard summary={summary} onStartAnother={reset} />
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
              <button
                type="button"
                onClick={() => void end()}
                className="w-full max-w-sm rounded-full bg-red-600 hover:bg-red-700 text-white py-4 text-lg font-semibold shadow-md transition-colors"
              >
                End Conversation
              </button>
            )}

            <ModeChips selected={selectedMode} onSelect={setSelectedMode} disabled={isActive} />

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
