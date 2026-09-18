import { LiveEvidenceSchema, type LiveEvidence, type TranscriptTurn } from "@/lib/learner/schema";
import { CALL_START_SENTINEL } from "@/lib/tutor/gemini-setup";

/**
 * Raw Gemini Live API protocol handling: WebSocket + message parsing only.
 * No DOM / Web Audio dependency so it can run in Node (see
 * scripts/check-gemini-protocol.mts) as well as the browser.
 */

const SETUP_TIMEOUT_MS = 15_000;

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
  onActivity(activity: "listening" | "speaking"): void;
  onEvidence(evidence: LiveEvidence): void;
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

  private turns: TranscriptTurn[] = [];
  private curUserText = "";
  private curAssistantText = "";
  private curTurnHasAudio = false;

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

      ws.onmessage = async (ev) => {
        try {
          const raw = typeof ev.data === "string" ? ev.data : await decodeFrame(ev.data);
          const msg = JSON.parse(raw) as Record<string, unknown>;
          this.handleMessage(msg);
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
    if (text === CALL_START_SENTINEL) return;
    this.turns.push({ role: "user", text });
  }

  private finalizeAssistantTurn() {
    const text = this.curAssistantText.trim();
    this.curAssistantText = "";
    if (text) this.turns.push({ role: "assistant", text });
  }

  private handleMessage(msg: Record<string, unknown>) {
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
    }

    if (sc?.modelTurn?.parts) {
      for (const part of sc.modelTurn.parts) {
        const data = part.inlineData?.data;
        if (data) {
          if (!this.curTurnHasAudio) {
            this.curTurnHasAudio = true;
            // User (if any) finished speaking now that the model is responding.
            this.finalizeUserTurn();
            this.callbacks.onActivity("speaking");
          }
          this.callbacks.onAudioChunk(base64ToBytes(data));
        }
      }
    }

    if (sc?.outputTranscription?.text) {
      this.curAssistantText += sc.outputTranscription.text;
    }

    if (sc?.interrupted) {
      this.finalizeAssistantTurn();
      this.curTurnHasAudio = false;
      this.callbacks.onActivity("listening");
      this.callbacks.onInterrupted();
      this.callbacks.onTranscript([...this.turns]);
    }

    if (sc?.turnComplete) {
      this.finalizeUserTurn();
      this.finalizeAssistantTurn();
      this.curTurnHasAudio = false;
      this.callbacks.onActivity("listening");
      this.callbacks.onTranscript([...this.turns]);
      this.callbacks.onTurnComplete();
    }

    const toolCall = msg.toolCall as { functionCalls?: GeminiFunctionCall[] } | undefined;
    if (toolCall?.functionCalls) {
      for (const fc of toolCall.functionCalls) {
        if (fc.name === "note_evidence") {
          const parsed = LiveEvidenceSchema.safeParse(fc.args ?? {});
          if (parsed.success) this.callbacks.onEvidence(parsed.data);
          this.sendToolResponse(fc.id, fc.name, { result: "noted" });
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
    this.ws.send(
      JSON.stringify({
        realtimeInput: {
          audio: { data: bytesToBase64(bytes), mimeType: "audio/pcm;rate=16000" },
        },
      }),
    );
  }

  sendText(text: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (text !== CALL_START_SENTINEL) {
      this.finalizeUserTurn();
      this.turns.push({ role: "user", text, typed: true });
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
    try {
      this.ws?.close();
    } catch {
      // ignore
    }
    this.ws = null;
  }
}
