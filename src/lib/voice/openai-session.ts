import { OpenAIRealtimeWebRTC, RealtimeAgent, RealtimeSession, tool } from "@openai/agents/realtime";
import { z } from "zod";
import { LiveEvidenceSchema, type TranscriptTurn } from "@/lib/learner/schema";
import type { VoiceSession, VoiceSessionDeps } from "./types";

/** Grace period after playback stops before hanging up. */
const END_CALL_DRAIN_MS = 400;
/** Hang up no later than this after end_call arrives, even with no stopped event. */
const END_CALL_SAFETY_MS = 8000;

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

function deriveTranscript(history: unknown[], typedTexts: Set<string>): TranscriptTurn[] {
  const turns: TranscriptTurn[] = [];
  for (const item of history) {
    if (!item || typeof item !== "object") continue;
    const it = item as Record<string, unknown>;
    if (it.type !== "message") continue;
    if (it.role === "user") {
      const text = extractUserText(it.content);
      if (text) turns.push(typedTexts.has(text.trim()) ? { role: "user", text, typed: true } : { role: "user", text });
    } else if (it.role === "assistant") {
      const text = extractAssistantText(it.content);
      if (text) turns.push({ role: "assistant", text });
    }
  }
  return turns;
}

export interface OpenAIVoiceSessionParams {
  clientSecret: string;
  model: string;
  voice: string;
  instructions: string;
}

/** OpenAI Realtime voice session, WebRTC via @openai/agents-realtime. */
export class OpenAIVoiceSession implements VoiceSession {
  readonly provider = "openai" as const;

  private readonly deps: VoiceSessionDeps;
  private readonly params: OpenAIVoiceSessionParams;
  private session: RealtimeSession | null = null;
  /** Texts the learner typed (vs. spoke), so the transcript can flag written production. */
  private readonly typedTexts = new Set<string>();
  private connected = false;
  private closedByUs = false;
  private endPending = false;
  private endFired = false;
  private endDrainTimer: ReturnType<typeof setTimeout> | null = null;
  private endSafetyTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(deps: VoiceSessionDeps, params: OpenAIVoiceSessionParams) {
    this.deps = deps;
    this.params = params;
  }

  async connect(): Promise<void> {
    const { mediaStream, audioElement, handlers } = this.deps;
    const { clientSecret, model, voice, instructions } = this.params;

    const noteEvidence = tool({
      name: "note_evidence",
      description:
        "Silently record one piece of learning evidence about the learner (error, vocabulary gap, good usage, comprehension or pronunciation issue).",
      parameters: LiveEvidenceSchema,
      execute: async (input) => {
        handlers.onEvidence(input);
        return "noted";
      },
    });

    const endCall = tool({
      name: "end_call",
      description:
        "Hang up the call. Call it only right after you have said goodbye because the learner clearly wants to stop.",
      parameters: z.object({}),
      execute: async () => {
        this.handleEndCallRequested();
        return "ok";
      },
    });

    const agent = new RealtimeAgent({
      name: "Tutrice",
      instructions,
      tools: [noteEvidence, endCall],
    });

    const session = new RealtimeSession(agent, {
      transport: new OpenAIRealtimeWebRTC({ mediaStream, audioElement }),
      model,
      config: {
        outputModalities: ["audio"],
        audio: {
          input: {
            transcription: { model: "gpt-4o-transcribe", language: "fr" },
            turnDetection: {
              type: "semantic_vad",
              eagerness: "low",
              createResponse: true,
              interruptResponse: true,
            },
          },
          output: { voice },
        },
      },
    });
    this.session = session;

    session.on("history_updated", (history) => {
      handlers.onTranscript(deriveTranscript(history, this.typedTexts));
    });

    session.on("error", (e) => {
      const message = e instanceof Error ? e.message : e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e);
      handlers.onError(message);
    });

    session.on("transport_event", (e) => {
      if (e.type === "output_audio_buffer.started") {
        handlers.onActivity("speaking");
      } else if (e.type === "output_audio_buffer.stopped" || e.type === "output_audio_buffer.cleared") {
        handlers.onActivity("listening");
        if (e.type === "output_audio_buffer.stopped" && this.endPending && !this.endFired) {
          if (this.endDrainTimer) clearTimeout(this.endDrainTimer);
          this.endDrainTimer = setTimeout(() => this.fireEndRequested(), END_CALL_DRAIN_MS);
        }
      } else if (e.type === "input_audio_buffer.speech_started") {
        handlers.onActivity("listening");
      }
    });

    session.transport.on("connection_change", (connStatus) => {
      if (connStatus === "disconnected" && this.connected && !this.closedByUs) {
        handlers.onDisconnected("transport disconnected");
      }
    });

    await session.connect({ apiKey: clientSecret });
    this.connected = true;
    if (session.transport.requestResponse) session.transport.requestResponse();
    else session.transport.sendEvent({ type: "response.create" });
  }

  sendText(text: string): void {
    this.typedTexts.add(text.trim());
    this.session?.sendMessage(text);
  }

  mute(muted: boolean): void {
    this.session?.mute(muted);
  }

  close(): void {
    if (this.closedByUs) return;
    this.closedByUs = true;
    if (this.endDrainTimer) clearTimeout(this.endDrainTimer);
    if (this.endSafetyTimer) clearTimeout(this.endSafetyTimer);
    try {
      this.session?.close();
    } catch {
      // ignore
    }
    this.session = null;
  }

  /** Fires onEndRequested exactly once, clearing any pending timers. */
  private fireEndRequested(): void {
    if (this.endFired) return;
    this.endFired = true;
    if (this.endDrainTimer) clearTimeout(this.endDrainTimer);
    if (this.endSafetyTimer) clearTimeout(this.endSafetyTimer);
    this.endDrainTimer = null;
    this.endSafetyTimer = null;
    this.deps.handlers.onEndRequested();
  }

  private handleEndCallRequested(): void {
    if (this.endPending || this.endFired) return;
    this.endPending = true;
    this.endSafetyTimer = setTimeout(() => this.fireEndRequested(), END_CALL_SAFETY_MS);
  }
}
