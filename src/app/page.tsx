"use client";

import { useEffect, useState } from "react";
import { useTutorSession } from "@/hooks/useTutorSession";
import type { LearnerState, SessionMode } from "@/lib/learner/schema";
import { TutorHeader } from "@/components/TutorHeader";
import { MicOrb } from "@/components/MicOrb";
import { ModePicker } from "@/components/ModePicker";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Onboarding } from "@/components/Onboarding";
import { ProgramCard } from "@/components/ProgramCard";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { SummaryCard } from "@/components/SummaryCard";
import { QuizCard } from "@/components/QuizCard";
import { FeedbackCard } from "@/components/FeedbackCard";
import VersionBadge from "@/components/VersionBadge";
import { modeBlurb, modeLabel, type PickableMode } from "@/lib/tutor/modes";

/*
  Cahier: paper and ink carrying a two-card bento. The call is the left card
  and stays the primary object on the screen; the learner's program — level,
  current unit, recurring errors, reviews due — is the right card, pulled
  forward from /review so it is visible without leaving the page. One column
  on a phone, side by side from `lg` (1024px) up.
*/

type LanguageMode = "auto" | "english_support" | "french_only";

type ProfilePhase = "loading" | "error" | "ready";

const CARD = "bg-card border border-rule rounded-[13px] p-3.5";

export default function Home() {
  const { status, error, transcript, partialTranscript, summary, mode, provider, quiz, start, end, sendText, answerQuiz, reset } =
    useTutorSession();
  const [learnerState, setLearnerState] = useState<LearnerState | null>(null);
  const [storeKind, setStoreKind] = useState<string | null>(null);
  const [plannedMode, setPlannedMode] = useState<PickableMode | null>(null);
  const [selectedMode, setSelectedMode] = useState<SessionMode>("auto");
  const [languageModeError, setLanguageModeError] = useState<string | null>(null);
  const [profilePhase, setProfilePhase] = useState<ProfilePhase>("loading");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/learner")
      .then((res) => {
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        return res.json();
      })
      .then((data: { state: LearnerState; storeKind: string; plannedMode: PickableMode }) => {
        if (cancelled) return;
        setLearnerState(data.state);
        setStoreKind(data.storeKind);
        setPlannedMode(data.plannedMode);
        setProfilePhase("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // Only the very first load blocks on an error card; a mid-session
        // refresh failure just keeps the last known state.
        setProfileError(err instanceof Error ? err.message : "Couldn't load your profile.");
        setProfilePhase((phase) => (phase === "loading" ? "error" : phase));
      });
    return () => {
      cancelled = true;
    };
  }, [status, retryToken]);

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

  const onboarded = learnerState !== null && learnerState.profile.onboarded_at !== null;

  // TutorHeader/ProfileSettings (name, starting level, "Retake the level test") and Onboarding
  // all PATCH /api/learner and hand back a new state directly; several of those edits change
  // what "auto" would pick (e.g. a fresh pending placement), so bump retryToken to make the
  // existing effect refetch /api/learner and pick up a fresh plannedMode.
  const handleLearnerStateChange = (next: LearnerState) => {
    setLearnerState(next);
    setRetryToken((t) => t + 1);
  };

  return (
    <div className="flex-1 flex flex-col">
      <TutorHeader state={learnerState} onChange={handleLearnerStateChange} disabled={isActive} />

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-4 flex flex-col gap-3">
        {profilePhase === "loading" ? (
          <p className="text-[13px] text-muted py-10 text-center">Loading your profile…</p>
        ) : profilePhase === "error" ? (
          <div className={`${CARD} w-full max-w-sm mx-auto text-center space-y-3 border-alert`}>
            <h2 className="font-display text-[19px] font-semibold text-ink">Couldn&apos;t load your profile</h2>
            {profileError && <p className="text-[13px] text-alert">{profileError}</p>}
            <button
              type="button"
              onClick={() => {
                setProfilePhase("loading");
                setProfileError(null);
                setRetryToken((t) => t + 1);
              }}
              className="rounded-full bg-primary-solid text-on-primary px-4 py-1.5 text-[13px] font-semibold focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
            >
              Retry
            </button>
          </div>
        ) : learnerState && !onboarded ? (
          <div className="w-full max-w-sm mx-auto">
            <Onboarding state={learnerState} onChange={handleLearnerStateChange} />
          </div>
        ) : status === "done" && summary ? (
          <div className="w-full max-w-xl mx-auto">
            <SummaryCard summary={summary} mode={mode} onStartAnother={reset} />
          </div>
        ) : status === "done" && !summary ? (
          <div className={`${CARD} w-full max-w-sm mx-auto text-center space-y-3 border-due`}>
            <h2 className="font-display text-[19px] font-semibold text-ink">Call ended</h2>
            <p className="text-[13px] text-ink-soft">
              The review couldn&apos;t finish; it will retry next time you open the app.
            </p>
            {error && <p className="text-[11px] text-due">{error}</p>}
            <button
              type="button"
              onClick={reset}
              className="w-full rounded-full bg-primary-solid text-on-primary py-2.5 text-[14px] font-semibold focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
            >
              Start another
            </button>
          </div>
        ) : status === "ending" ? (
          <div className={`${CARD} w-full max-w-sm mx-auto text-center space-y-2`}>
            <h2 className="font-display text-[19px] font-semibold text-ink">Call ended</h2>
            <p className="text-[13px] text-ink-soft">
              Saving your progress… you can close this tab; nothing will be lost.
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-3 items-start lg:grid-cols-[1.15fr_1fr]">
              {/* the call — always the primary object on the page */}
              <div className={`${CARD} flex flex-col items-center gap-3 text-center`}>
                <MicOrb status={status} />

                {status === "error" && (
                  <div className="w-full rounded-[8px] border border-alert bg-alert-tint px-3.5 py-2.5 text-center">
                    <p className="text-[13px] text-alert">{error}</p>
                    <button
                      type="button"
                      onClick={() => start(selectedMode)}
                      className="mt-2.5 rounded-full bg-danger text-on-primary px-4 py-1.5 text-[13px] font-semibold focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
                    >
                      Retry
                    </button>
                  </div>
                )}

                {!isActive && status !== "error" && (
                  <button
                    type="button"
                    onClick={() => start(selectedMode)}
                    className="w-full rounded-full bg-primary-solid text-on-primary py-3.5 text-[15px] font-semibold transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
                  >
                    Start conversation
                  </button>
                )}

                {!isActive && status === "idle" && learnerState?.profile.sessions_completed === 0 && (
                  <p className="text-[10px] text-muted max-w-[30ch] leading-relaxed">
                    Your browser will ask to use your microphone — click <strong className="text-ink-soft">Allow</strong>.
                    Turn your sound on or plug in headphones: the tutor speaks first.
                  </p>
                )}

                {isActive && (
                  <>
                    <button
                      type="button"
                      onClick={() => void end()}
                      className="w-full rounded-full bg-danger text-on-primary py-3.5 text-[15px] font-semibold transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
                    >
                      {isConnecting ? "Cancel" : "End conversation"}
                    </button>
                    <p className="text-[10px] text-muted -mt-1.5">Esc · or say &laquo;&nbsp;on arrête&nbsp;&raquo;</p>

                    {/* Once the server has resolved a real mode, say which call this is; while
                        it's still "auto" (connecting, or the learner picked "Tutor decides")
                        fall back to what was selected rather than ever showing "auto". */}
                    <div className="rounded-[10px] border border-primary bg-primary-tint px-3 py-2 text-left w-full">
                      <p className="font-mono text-[9px] tracking-[.14em] uppercase text-primary">
                        {mode !== "auto" && selectedMode === "auto" ? "Now running · chosen by your tutor" : "Now running"}
                      </p>
                      <p className="text-[13px] font-semibold text-ink">{modeLabel(mode !== "auto" ? mode : selectedMode)}</p>
                      <p className="text-[11px] text-ink-soft">{modeBlurb(mode !== "auto" ? mode : selectedMode)}</p>
                    </div>
                  </>
                )}

                {!isActive && (
                  <ModePicker selected={selectedMode} plannedMode={plannedMode} onSelect={setSelectedMode} disabled={isActive} />
                )}

                <LanguageToggle
                  value={learnerState?.profile.preferences.language_mode ?? "auto"}
                  onChange={handleLanguageModeChange}
                  disabled={isActive}
                />
                {languageModeError && <p className="text-[11px] text-alert">{languageModeError}</p>}

                {error && status !== "error" && <p className="text-[11px] text-due">{error}</p>}
              </div>

              {/* the program — the half of the design that used to live only on /review */}
              {learnerState && onboarded && <ProgramCard state={learnerState} />}
            </div>

            {isActive && quiz && (
              <QuizCard quiz={quiz.quiz} answeredIndex={quiz.answeredIndex} onAnswer={answerQuiz} />
            )}

            <TranscriptPanel
              transcript={transcript}
              partial={partialTranscript}
              live={isConnected}
              canSendText={isConnected}
              onSendText={sendText}
            />
          </>
        )}
      </main>

      <footer className="w-full max-w-5xl mx-auto flex flex-col items-center gap-2 px-4 pb-6 pt-2">
        <p className="font-mono text-[9px] tracking-[.12em] uppercase text-muted">
          Memory: {storeKind ?? "…"}
          {provider ? ` · Voice: ${provider}` : ""}
          <VersionBadge />
        </p>
        <FeedbackCard />
      </footer>
    </div>
  );
}
