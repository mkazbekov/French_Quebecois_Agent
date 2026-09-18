"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createVoiceSession } from "@/lib/voice";
import { micErrorMessage } from "@/lib/voice/mic-errors";
import type { StartSessionResponse, VoiceSession } from "@/lib/voice/types";
import type { LiveEvidence, SessionEvidence, SessionMode, SessionSummary, TranscriptTurn } from "@/lib/learner/schema";

export type TutorStatus =
  | "idle"
  | "requesting_mic"
  | "connecting"
  | "listening"
  | "speaking"
  | "ending"
  | "done"
  | "error";

const PENDING_KEY = "tutor.pendingSession";

interface PendingSession {
  evidence: SessionEvidence;
}

/** Clear any crash-recovery evidence mirrored to localStorage (e.g. before resetting the profile). */
export function clearPendingSession(): void {
  try {
    window.localStorage.removeItem(PENDING_KEY);
  } catch {
    // ignore
  }
}

export interface UseTutorSessionResult {
  status: TutorStatus;
  error: string | null;
  transcript: TranscriptTurn[];
  summary: SessionSummary | null;
  mode: SessionMode;
  provider: "openai" | "gemini" | null;
  start(mode: SessionMode): Promise<void>;
  end(): Promise<void>;
  sendText(text: string): void;
  reset(): void;
}

export function useTutorSession(): UseTutorSessionResult {
  const [status, setStatus] = useState<TutorStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [mode, setMode] = useState<SessionMode>("auto");
  const [provider, setProvider] = useState<"openai" | "gemini" | null>(null);

  const voiceRef = useRef<VoiceSession | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const evidenceRef = useRef<LiveEvidence[]>([]);
  const transcriptRef = useRef<TranscriptTurn[]>([]);
  const sessionIdRef = useRef<string>("");
  const startedAtRef = useRef<string>("");
  const modeRef = useRef<SessionMode>("auto");
  const activeRef = useRef(false);
  const endingRef = useRef(false);
  const startingRef = useRef(false);
  const cancelledRef = useRef(false);
  const endRef = useRef<() => Promise<void>>(async () => {});

  const mirrorPending = useCallback((disconnected: boolean, endedAt?: string) => {
    try {
      const evidence: SessionEvidence = {
        session_id: sessionIdRef.current,
        mode: modeRef.current,
        started_at: startedAtRef.current,
        ended_at: endedAt ?? new Date().toISOString(),
        transcript: transcriptRef.current,
        live_evidence: evidenceRef.current,
        disconnected,
      };
      const pending: PendingSession = { evidence };
      window.localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    } catch {
      // ignore storage errors
    }
  }, []);

  const teardown = useCallback(() => {
    try {
      voiceRef.current?.close();
    } catch {
      // ignore
    }
    voiceRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
  }, []);

  const postEnd = useCallback(async (disconnected: boolean, endedAtOverride?: string): Promise<SessionSummary | null> => {
    const endedAt = endedAtOverride ?? new Date().toISOString();
    const evidence: SessionEvidence = {
      session_id: sessionIdRef.current,
      mode: modeRef.current,
      started_at: startedAtRef.current,
      ended_at: endedAt,
      transcript: transcriptRef.current,
      live_evidence: evidenceRef.current,
      disconnected,
    };
    try {
      const res = await fetch("/api/session/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(evidence),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as { summary: SessionSummary };
      try {
        window.localStorage.removeItem(PENDING_KEY);
      } catch {
        // ignore
      }
      return data.summary;
    } catch (err) {
      setError(`Session saved locally; review failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }, []);

  const end = useCallback(async () => {
    if (endingRef.current) return;
    if (!activeRef.current) {
      // Not connected yet: cancel an in-flight start (mic request or connect).
      if (startingRef.current) {
        cancelledRef.current = true;
        teardown();
        setStatus("idle");
      }
      return;
    }
    endingRef.current = true;
    activeRef.current = false;
    setStatus("ending");
    const endedAt = new Date().toISOString();
    // Mirror the pending session before the wait/teardown so closing the tab
    // during the review is safe; on-mount recovery will post it next time.
    mirrorPending(false, endedAt);
    // Give the server a moment to deliver the transcription of the last utterance.
    try {
      voiceRef.current?.mute(true);
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 1200));
    teardown();
    const s = await postEnd(false, endedAt);
    if (s) setSummary(s);
    setStatus("done");
    endingRef.current = false;
  }, [postEnd, teardown, mirrorPending]);

  useEffect(() => {
    endRef.current = end;
  }, [end]);

  const start = useCallback(async (requestedMode: SessionMode) => {
    if (startingRef.current || activeRef.current) return;
    startingRef.current = true;
    cancelledRef.current = false;
    setError(null);
    setSummary(null);
    setTranscript([]);
    transcriptRef.current = [];
    evidenceRef.current = [];
    setStatus("requesting_mic");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      setStatus("error");
      setError(
        micErrorMessage(err, {
          hasMediaDevices: typeof navigator !== "undefined" && !!navigator.mediaDevices,
          port: typeof window !== "undefined" ? window.location.port : "",
        }),
      );
      startingRef.current = false;
      cancelledRef.current = false;
      return;
    }
    mediaStreamRef.current = stream;
    if (cancelledRef.current) {
      teardown();
      setStatus("idle");
      startingRef.current = false;
      cancelledRef.current = false;
      return;
    }

    setStatus("connecting");
    try {
      const res = await fetch("/api/realtime/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: requestedMode }),
      });
      const data = (await res.json()) as StartSessionResponse & { error?: string; detail?: string };
      if (!res.ok) {
        throw new Error(data.error ?? `Server returned ${res.status}`);
      }
      if (cancelledRef.current) {
        setStatus("idle");
        return;
      }

      sessionIdRef.current = data.sessionId;
      startedAtRef.current = data.startedAt;
      modeRef.current = data.mode;
      setMode(data.mode);
      setProvider(data.provider);

      if (!audioElRef.current) {
        const audioEl = document.createElement("audio");
        audioEl.autoplay = true;
        audioElRef.current = audioEl;
      }

      const voice = createVoiceSession(data, {
        mediaStream: stream,
        audioElement: audioElRef.current,
        handlers: {
          onTranscript: (turns) => {
            transcriptRef.current = turns;
            setTranscript(turns);
          },
          onActivity: (activity) => {
            setStatus((prev) => (prev === "ending" || prev === "done" ? prev : activity));
          },
          onEvidence: (evidence) => {
            evidenceRef.current = [...evidenceRef.current, evidence];
          },
          onDisconnected: () => {
            if (!activeRef.current) return;
            activeRef.current = false;
            setStatus("ending");
            teardown();
            void postEnd(true).then((s) => {
              if (s) setSummary(s);
              setStatus("done");
            });
          },
          onError: (message) => {
            console.error("voice session error", message);
          },
          onEndRequested: () => {
            void endRef.current();
          },
        },
      });
      voiceRef.current = voice;

      await voice.connect();
      if (cancelledRef.current) {
        teardown();
        setStatus("idle");
        return;
      }
      activeRef.current = true;
      setStatus("listening");
    } catch (err) {
      if (cancelledRef.current) {
        teardown();
        setStatus("idle");
      } else {
        setStatus("error");
        setError(err instanceof Error ? err.message : String(err));
        teardown();
      }
    } finally {
      startingRef.current = false;
      cancelledRef.current = false;
    }
  }, [postEnd, teardown]);

  const sendText = useCallback((text: string) => {
    if (!voiceRef.current || !activeRef.current) return;
    voiceRef.current.sendText(text);
  }, []);

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
    setSummary(null);
    setTranscript([]);
    evidenceRef.current = [];
  }, []);

  // Crash recovery mirror
  useEffect(() => {
    if (activeRef.current && sessionIdRef.current) {
      mirrorPending(false);
    }
  }, [transcript, mirrorPending]);

  // On mount: recover any pending session from a previous crash
  useEffect(() => {
    (async () => {
      try {
        const raw = window.localStorage.getItem(PENDING_KEY);
        if (!raw) return;
        const pending = JSON.parse(raw) as PendingSession;
        const userTurns = pending.evidence.transcript.filter((t) => t.role === "user").length;
        if (userTurns >= 2) {
          console.info("Recovering pending tutor session from a previous run.");
          fetch("/api/session/end", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...pending.evidence, disconnected: true }),
          })
            .then((res) => {
              if (res.ok) window.localStorage.removeItem(PENDING_KEY);
              else console.info("Pending session recovery failed", res.status);
            })
            .catch((err) => console.info("Pending session recovery failed", err));
        } else {
          window.localStorage.removeItem(PENDING_KEY);
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      teardown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { status, error, transcript, summary, mode, provider, start, end, sendText, reset };
}
