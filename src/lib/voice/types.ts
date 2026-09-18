import type { LiveEvidence, SessionMode, TranscriptTurn } from "@/lib/learner/schema";

/**
 * Provider-neutral contract between the UI hook and a realtime voice backend.
 * Exactly one VoiceSession is alive per call. Implementations:
 *   - src/lib/voice/openai-session.ts  (OpenAI Realtime via @openai/agents-realtime, WebRTC)
 *   - src/lib/voice/gemini-session.ts  (Gemini Live API, raw WebSocket + Web Audio)
 */

export type VoiceActivity = "listening" | "speaking";

export interface VoiceSessionHandlers {
  /** Full transcript so far (replace, don't append). Only user/assistant turns with text. */
  onTranscript(turns: TranscriptTurn[]): void;
  onActivity(activity: VoiceActivity): void;
  onEvidence(evidence: LiveEvidence): void;
  /** The remote side closed or the connection failed after connect(). */
  onDisconnected(reason: string): void;
  /** Non-fatal problem worth surfacing. */
  onError(message: string): void;
  /** Fired once the tutor's goodbye has finished playing. */
  onEndRequested(): void;
}

export interface VoiceSession {
  readonly provider: "openai" | "gemini";
  /** Opens the connection. Resolves once the tutor can be heard/heard from. Rejects on failure. */
  connect(): Promise<void>;
  /** Learner types instead of speaking. */
  sendText(text: string): void;
  mute(muted: boolean): void;
  /** Stops audio, closes the connection. Idempotent. */
  close(): void;
}

/** What POST /api/realtime/session returns. Discriminated by `provider`. */
export type StartSessionResponse = {
  sessionId: string;
  startedAt: string;
  mode: SessionMode;
  instructions: string;
} & (
  | {
      provider: "openai";
      openai: { clientSecret: string; model: string; voice: string };
    }
  | {
      provider: "gemini";
      gemini: { token: string; model: string; voice: string };
    }
);

export interface VoiceSessionDeps {
  /** Microphone stream owned by the caller (caller stops the tracks). */
  mediaStream: MediaStream;
  /** Element for playback (OpenAI WebRTC needs one; Gemini uses Web Audio). */
  audioElement: HTMLAudioElement;
  handlers: VoiceSessionHandlers;
}
