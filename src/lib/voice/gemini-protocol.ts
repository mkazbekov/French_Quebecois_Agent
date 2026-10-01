import { LiveEvidenceSchema, QuizQuestionSchema, type LiveEvidence, type QuizQuestion, type TranscriptTurn } from "@/lib/learner/schema";
import { CALL_START_SENTINEL, REPLY_NUDGE_SENTINEL, isControlTurn } from "@/lib/tutor/gemini-setup";

/**
 * Raw Gemini Live API protocol handling: WebSocket + message parsing only.
 * No DOM / Web Audio dependency so it can run in Node (see
 * scripts/check-gemini-protocol.mts) as well as the browser.
 */

const SETUP_TIMEOUT_MS = 15_000;

/**
 * Stop queueing microphone audio once this many bytes are waiting in the
 * WebSocket send buffer (~2 s of 16 kHz PCM16 as base64 JSON, about 43 KB/s).
 * Live audio that late is useless to the model, and flushing it in one burst
 * after a stall is what made the tutor answer minutes later.
 */
export const MAX_BUFFERED_AUDIO_BYTES = 96_000;

/**
 * If the learner has spoken and the tutor has not started answering this long
 * after their last transcribed words, nudge the model once with
 * REPLY_NUDGE_SENTINEL. A safety net for a turn the Live session leaves
 * hanging (the "it heard me but didn't answer" freeze); normal replies start
 * 1–4 s after the learner stops, and PATIENCE allows ~10 s for someone who is
 * still thinking, so this stays well clear of both.
 */
export const REPLY_NUDGE_MS = 8_000;

/** Pure backpressure check: is there room to send another microphone chunk? */
export function shouldSendAudio(bufferedAmount: number): boolean {
  return bufferedAmount <= MAX_BUFFERED_AUDIO_BYTES;
}

/** Binary frames arrive as Blob (browser, Node 24) or ArrayBuffer; both are UTF-8 JSON. */
async function decodeFrame(data: unknown): Promise<string> {
  const buf = data instanceof ArrayBuffer ? data : await (data as Blob).arrayBuffer();
  return new TextDecoder().decode(buf);
}

function bytesToBase64(bytes: ArrayBuffer): string {
  const arr = new Uint8Array(bytes);
  if (typeof Buffer !== "undefined") {
    return Buffer.from(arr).toString("base64");
  }
  let binary = "";
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
  return btoa(binary);
}

function base64ToBytes(b64: string): ArrayBuffer {
  if (typeof Buffer !== "undefined") {
    const buf = Buffer.from(b64, "base64");
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

interface GeminiFunctionCall {
  id: string;
  name: string;
  args?: unknown;
}

export interface GeminiLiveProtocolCallbacks {
  onAudioChunk(bytes: ArrayBuffer): void;
  onTranscript(turns: TranscriptTurn[]): void;
  /** In-flight (not yet finalized) turns, 0–2, user first then assistant; [] clears. */
  onPartialTranscript(partials: TranscriptTurn[]): void;
  onActivity(activity: "listening" | "speaking"): void;
  onEvidence(evidence: LiveEvidence): void;
  onQuiz(quiz: QuizQuestion): void;
  onInterrupted(): void;
  onSetupComplete(): void;
  onDisconnected(reason: string): void;
  onError(message: string): void;
  /** The model called the end_call tool; the tool response has already been sent. */
  onEndCallRequested(): void;
  /** The current model turn finished (fired alongside onTranscript's turnComplete case). */
  onTurnComplete(): void;
}

export class GeminiLiveProtocol {
  private ws: WebSocket | null = null;
  private readonly callbacks: GeminiLiveProtocolCallbacks;
  private setupDone = false;
  private closedByUs = false;
  /** Serializes inbound frames: Blob frames decode asynchronously and must not overtake text frames. */
  private inbox: Promise<void> = Promise.resolve();

  private turns: TranscriptTurn[] = [];
  private curUserText = "";
  private curAssistantText = "";
  private curTurnHasAudio = false;
  private nudgeTimer: ReturnType<typeof setTimeout> | null = null;
  /** One nudge per learner turn; reset once the tutor actually answers. */
  private nudgedThisTurn = false;

  constructor(callbacks: GeminiLiveProtocolCallbacks) {
    this.callbacks = callbacks;
  }

  connect(url: string, setupMessage: unknown): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error("Gemini Live setup timed out"));
      }, SETUP_TIMEOUT_MS);

      const ws = new WebSocket(url);
      this.ws = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify(setupMessage));
      };

      ws.onmessage = (ev) => {
        const data = ev.data;
        this.inbox = this.inbox.then(async () => {
          try {
            const raw = typeof data === "string" ? data : await decodeFrame(data);
            const msg = JSON.parse(raw) as Record<string, unknown>;
            this.handleServerMessage(msg);
            if (msg.setupComplete && !settled) {
              settled = true;
              clearTimeout(timer);
              this.setupDone = true;
              this.callbacks.onSetupComplete();
              // Greeting: ask the tutor to open the call.
              this.sendText(CALL_START_SENTINEL);
              resolve();
            }
          } catch (err) {
            this.callbacks.onError(err instanceof Error ? err.message : String(err));
          }
        });
      };

      ws.onerror = () => {
        this.callbacks.onError("Gemini Live WebSocket error");
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new Error("Gemini Live WebSocket error"));
        }
      };

      ws.onclose = (ev) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new Error(`Gemini Live closed before setup: ${ev.code} ${ev.reason}`));
          return;
        }
        if (!this.closedByUs) {
          this.callbacks.onDisconnected(`closed: ${ev.code} ${ev.reason}`);
        }
      };
    });
  }

  private finalizeUserTurn() {
    const text = this.curUserText.trim();
    this.curUserText = "";
    if (!text) return;
    if (isControlTurn(text)) return;
    this.turns.push({ role: "user", text });
  }

  private finalizeAssistantTurn() {
    const text = this.curAssistantText.trim();
    this.curAssistantText = "";
    if (text) this.turns.push({ role: "assistant", text });
  }

  /** Emits the current in-flight (not yet finalized) turns: user first, then assistant. */
  private emitPartial(): void {
    const partials: TranscriptTurn[] = [];
    const userText = this.curUserText.trim();
    if (userText && !isControlTurn(userText)) partials.push({ role: "user", text: userText });
    const assistantText = this.curAssistantText.trim();
    if (assistantText) partials.push({ role: "assistant", text: assistantText });
    this.callbacks.onPartialTranscript(partials);
  }

  /** (Re)starts the no-reply watchdog after the learner's latest words. */
  private armNudge(): void {
    this.disarmNudge();
    if (this.nudgedThisTurn || this.closedByUs) return;
    this.nudgeTimer = setTimeout(() => {
      this.nudgeTimer = null;
      this.nudgedThisTurn = true;
      this.sendText(REPLY_NUDGE_SENTINEL);
    }, REPLY_NUDGE_MS);
  }

  private disarmNudge(): void {
    if (this.nudgeTimer) clearTimeout(this.nudgeTimer);
    this.nudgeTimer = null;
  }

  /** The tutor is answering: stop the watchdog and allow a nudge on the next turn. */
  private tutorAnswered(): void {
    this.disarmNudge();
    this.nudgedThisTurn = false;
  }

  handleServerMessage(msg: Record<string, unknown>) {
    if (msg.goAway) {
      this.callbacks.onDisconnected("goAway");
      return;
    }

    const sc = msg.serverContent as
      | {
          modelTurn?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> };
          inputTranscription?: { text?: string };
          outputTranscription?: { text?: string };
          turnComplete?: boolean;
          interrupted?: boolean;
        }
      | undefined;

    if (sc?.inputTranscription?.text) {
      this.curUserText += sc.inputTranscription.text;
      this.emitPartial();
      // Only while the tutor is not mid-answer (echo of its own voice must not arm it).
      if (!this.curTurnHasAudio) this.armNudge();
    }

    if (sc?.modelTurn?.parts) {
      for (const part of sc.modelTurn.parts) {
        const data = part.inlineData?.data;
        if (data) {
          this.tutorAnswered();
          if (!this.curTurnHasAudio) {
            this.curTurnHasAudio = true;
            // User (if any) finished speaking now that the model is responding.
            // Publish the finalized turn straight away and drop it from the
            // partials in the same tick, otherwise the learner's own sentence
            // vanishes from the screen until the tutor's turn completes.
            this.finalizeUserTurn();
            this.callbacks.onTranscript([...this.turns]);
            this.emitPartial();
            this.callbacks.onActivity("speaking");
          }
          this.callbacks.onAudioChunk(base64ToBytes(data));
        }
      }
    }

    if (sc?.outputTranscription?.text) {
      this.tutorAnswered();
      this.curAssistantText += sc.outputTranscription.text;
      this.emitPartial();
    }

    if (sc?.interrupted) {
      this.finalizeAssistantTurn();
      this.curTurnHasAudio = false;
      this.callbacks.onActivity("listening");
      this.callbacks.onInterrupted();
      this.callbacks.onTranscript([...this.turns]);
      this.callbacks.onPartialTranscript([]);
    }

    if (sc?.turnComplete) {
      this.finalizeUserTurn();
      this.finalizeAssistantTurn();
      this.curTurnHasAudio = false;
      this.callbacks.onActivity("listening");
      this.callbacks.onTranscript([...this.turns]);
      this.callbacks.onPartialTranscript([]);
      this.callbacks.onTurnComplete();
    }

    const toolCall = msg.toolCall as { functionCalls?: GeminiFunctionCall[] } | undefined;
    if (toolCall?.functionCalls) {
      for (const fc of toolCall.functionCalls) {
        if (fc.name === "note_evidence") {
          const parsed = LiveEvidenceSchema.safeParse(fc.args ?? {});
          if (parsed.success) this.callbacks.onEvidence(parsed.data);
          this.sendToolResponse(fc.id, fc.name, { result: "noted" });
        } else if (fc.name === "ask_choice") {
          const parsed = QuizQuestionSchema.safeParse(fc.args ?? {});
          if (parsed.success) {
            const clamped: QuizQuestion = {
              ...parsed.data,
              answer_index: Math.min(Math.max(parsed.data.answer_index, 0), parsed.data.options.length - 1),
            };
            this.callbacks.onQuiz(clamped);
            this.sendToolResponse(fc.id, fc.name, { result: "shown" });
          } else {
            this.sendToolResponse(fc.id, fc.name, { result: "invalid" });
          }
        } else if (fc.name === "end_call") {
          this.sendToolResponse(fc.id, fc.name, { result: "ok" });
          this.callbacks.onEndCallRequested();
        } else {
          this.sendToolResponse(fc.id, fc.name, { result: "noted" });
        }
      }
    }

    if (msg.error) {
      this.callbacks.onError(typeof msg.error === "string" ? msg.error : JSON.stringify(msg.error));
    }
  }

  sendAudioPcm16(bytes: ArrayBuffer): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (!shouldSendAudio(this.ws.bufferedAmount)) return;
    this.ws.send(
      JSON.stringify({
        realtimeInput: {
          audio: { data: bytesToBase64(bytes), mimeType: "audio/pcm;rate=16000" },
        },
      }),
    );
  }

  sendText(text: string, source: "typed" | "choice" = "typed"): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (!isControlTurn(text)) {
      // The learner typed or clicked: that is a complete turn, no nudge needed.
      this.disarmNudge();
      this.finalizeUserTurn();
      this.turns.push(source === "choice" ? { role: "user", text, choice: true } : { role: "user", text, typed: true });
      this.callbacks.onTranscript([...this.turns]);
    }
    this.ws.send(
      JSON.stringify({
        clientContent: {
          turns: [{ role: "user", parts: [{ text }] }],
          turnComplete: true,
        },
      }),
    );
  }

  sendToolResponse(id: string, name: string, response: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        toolResponse: { functionResponses: [{ id, name, response }] },
      }),
    );
  }

  close(): void {
    if (this.closedByUs) return;
    this.closedByUs = true;
    this.disarmNudge();
    try {
      this.ws?.close();
    } catch {
      // ignore
    }
    this.ws = null;
  }
}
