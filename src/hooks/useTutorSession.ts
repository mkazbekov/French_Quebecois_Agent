"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { OpenAIRealtimeWebRTC, RealtimeAgent, RealtimeSession, tool } from "@openai/agents/realtime";
import {
  LiveEvidenceSchema,
  type LiveEvidence,
  type SessionEvidence,
  type SessionMode,
  type SessionSummary,
  type TranscriptTurn,
} from "@/lib/learner/schema";

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

interface StartSessionResponse {
  sessionId: string;
  startedAt: string;
  clientSecret: { value: string; expiresAt: number };
  model: string;
  voice: string;
  instructions: string;
  mode: SessionMode;
}

function extractUserText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  for (const part of content) {
    if (part && typeof part === "object") {
      const p = part as Record<string, unknown>;
      if (p.type === "input_audio" && typeof p.transcript === "string") return p.transcript;
      if (p.type === "input_text" && typeof p.text === "string") return p.text;
    }
  }
  return "";
}

function extractAssistantText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  for (const part of content) {
    if (part && typeof part === "object") {
      const p = part as Record<string, unknown>;
      if (p.type === "output_audio" && typeof p.transcript === "string") return p.transcript;
      if (p.type === "output_text" && typeof p.text === "string") return p.text;
    }
  }
  return "";
}

function deriveTranscript(history: unknown[]): TranscriptTurn[] {
  const turns: TranscriptTurn[] = [];
  for (const item of history) {
    if (!item || typeof item !== "object") continue;
    const it = item as Record<string, unknown>;
    if (it.type !== "message") continue;
    if (it.role === "user") {
      const text = extractUserText(it.content);
      if (text) turns.push({ role: "user", text });
    } else if (it.role === "assistant") {
      const text = extractAssistantText(it.content);
      if (text) turns.push({ role: "assistant", text });
    }
  }
  return turns;
}

export interface UseTutorSessionResult {
  status: TutorStatus;
  error: string | null;
  transcript: TranscriptTurn[];
  summary: SessionSummary | null;
  mode: SessionMode;
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

  const sessionRef = useRef<RealtimeSession | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const evidenceRef = useRef<LiveEvidence[]>([]);
  const transcriptRef = useRef<TranscriptTurn[]>([]);
  const sessionIdRef = useRef<string>("");
  const startedAtRef = useRef<string>("");
  const modeRef = useRef<SessionMode>("auto");
  const activeRef = useRef(false);
  const endingRef = useRef(false);

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
      sessionRef.current?.close();
    } catch {
      // ignore
    }
    sessionRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
  }, []);

  const postEnd = useCallback(async (disconnected: boolean): Promise<SessionSummary | null> => {
    const endedAt = new Date().toISOString();
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
    if (endingRef.current || !activeRef.current) return;
    endingRef.current = true;
    activeRef.current = false;
    setStatus("ending");
    // Give the server a moment to deliver the transcription of the last utterance.
    try {
      sessionRef.current?.mute(true);
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 1200));
    teardown();
    const s = await postEnd(false);
    if (s) setSummary(s);
    setStatus("done");
    endingRef.current = false;
  }, [postEnd, teardown]);

  const startingRef = useRef(false);

  const start = useCallback(async (requestedMode: SessionMode) => {
    if (startingRef.current || activeRef.current) return;
    startingRef.current = true;
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
        err instanceof Error && err.name === "NotAllowedError"
          ? "Microphone access was denied. Allow microphone access and try again."
          : `Could not access the microphone: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }
    mediaStreamRef.current = stream;

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

      sessionIdRef.current = data.sessionId;
      startedAtRef.current = data.startedAt;
      modeRef.current = data.mode;
      setMode(data.mode);

      if (!audioElRef.current) {
        const audioEl = document.createElement("audio");
        audioEl.autoplay = true;
        audioElRef.current = audioEl;
      }

      const noteEvidence = tool({
        name: "note_evidence",
        description:
          "Silently record one piece of learning evidence about the learner (error, vocabulary gap, good usage, comprehension or pronunciation issue).",
        parameters: LiveEvidenceSchema,
        execute: async (input) => {
          evidenceRef.current = [...evidenceRef.current, input];
          return "noted";
        },
      });

      const agent = new RealtimeAgent({
        name: "Tutrice",
        instructions: data.instructions,
        tools: [noteEvidence],
      });

      const session = new RealtimeSession(agent, {
        transport: new OpenAIRealtimeWebRTC({ mediaStream: stream, audioElement: audioElRef.current }),
        model: data.model,
        config: {
          outputModalities: ["audio"],
          audio: {
            input: {
              transcription: { model: "gpt-4o-transcribe", language: "fr" },
              turnDetection: {
                type: "semantic_vad",
                eagerness: "medium",
                createResponse: true,
                interruptResponse: true,
              },
            },
            output: { voice: data.voice },
          },
        },
      });
      sessionRef.current = session;

      session.on("history_updated", (history) => {
        const turns = deriveTranscript(history);
        transcriptRef.current = turns;
        setTranscript(turns);
      });

      session.on("error", (e) => {
        console.error("realtime session error", e);
      });

      session.on("transport_event", (e) => {
        if (e.type === "output_audio_buffer.started") {
          setStatus((prev) => (prev === "ending" || prev === "done" ? prev : "speaking"));
        } else if (e.type === "output_audio_buffer.stopped" || e.type === "output_audio_buffer.cleared") {
          setStatus((prev) => (prev === "ending" || prev === "done" ? prev : "listening"));
        } else if (e.type === "input_audio_buffer.speech_started") {
          setStatus((prev) => (prev === "ending" || prev === "done" ? prev : "listening"));
        }
      });

      session.transport.on("connection_change", (connStatus) => {
        if (connStatus === "disconnected" && activeRef.current) {
          activeRef.current = false;
          setStatus("ending");
          teardown();
          void postEnd(true).then((s) => {
            if (s) setSummary(s);
            setStatus("done");
          });
        }
      });

      await session.connect({ apiKey: data.clientSecret.value });
      activeRef.current = true;
      setStatus("listening");
      if (session.transport.requestResponse) session.transport.requestResponse();
      else session.transport.sendEvent({ type: "response.create" });
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
      teardown();
    } finally {
      startingRef.current = false;
    }
  }, [postEnd, teardown]);

  const sendText = useCallback((text: string) => {
    if (!sessionRef.current || !activeRef.current) return;
    sessionRef.current.sendMessage(text);
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

  return { status, error, transcript, summary, mode, start, end, sendText, reset };
}
