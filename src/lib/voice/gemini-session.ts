import { buildGeminiLiveSetup, geminiLiveUrlForToken } from "@/lib/tutor/gemini-setup";
import { GeminiLiveProtocol } from "./gemini-protocol";
import type { VoiceSession, VoiceSessionDeps } from "./types";

const CAPTURE_SAMPLE_RATE = 16000;
const PLAYBACK_SAMPLE_RATE = 24000;
const CAPTURE_CHUNK_SAMPLES = 1600; // ~100ms at 16kHz
/** Grace period after scheduled playback drains before hanging up. */
const END_CALL_DRAIN_MS = 400;
/** Hang up no later than this after end_call arrives, even with no turnComplete. */
const END_CALL_SAFETY_MS = 8000;

// Runs on the audio rendering thread. Buffers incoming Float32 samples and
// posts ~100ms Int16 PCM chunks back to the main thread.
const WORKLET_SOURCE = `
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Int16Array(${CAPTURE_CHUNK_SAMPLES});
    this.offset = 0;
  }
  process(inputs) {
    const input = inputs[0];
    if (input && input[0]) {
      const channel = input[0];
      for (let i = 0; i < channel.length; i++) {
        const s = Math.max(-1, Math.min(1, channel[i]));
        this.buffer[this.offset++] = s < 0 ? s * 0x8000 : s * 0x7fff;
        if (this.offset >= this.buffer.length) {
          this.port.postMessage(this.buffer.buffer.slice(0));
          this.offset = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor("pcm-capture", PcmCaptureProcessor);
`;

function floatToInt16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

export interface GeminiVoiceSessionParams {
  token: string;
  model: string;
  voice: string;
  instructions: string;
}

/** Gemini Live voice session: raw WebSocket protocol + Web Audio capture/playback. */
export class GeminiVoiceSession implements VoiceSession {
  readonly provider = "gemini" as const;

  private readonly deps: VoiceSessionDeps;
  private readonly params: GeminiVoiceSessionParams;
  private readonly protocol: GeminiLiveProtocol;

  private captureCtx: AudioContext | null = null;
  private captureSource: MediaStreamAudioSourceNode | null = null;
  private captureWorklet: AudioWorkletNode | null = null;
  private captureProcessor: ScriptProcessorNode | null = null;
  private muted = false;

  private playCtx: AudioContext | null = null;
  private nextStartTime = 0;
  private scheduled: AudioBufferSourceNode[] = [];

  private closed = false;
  private endPending = false;
  private endFired = false;
  private endDrainTimer: ReturnType<typeof setTimeout> | null = null;
  private endSafetyTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(deps: VoiceSessionDeps, params: GeminiVoiceSessionParams) {
    this.deps = deps;
    this.params = params;
    this.protocol = new GeminiLiveProtocol({
      onAudioChunk: (bytes) => this.playChunk(bytes),
      onTranscript: (turns) => this.deps.handlers.onTranscript(turns),
      onActivity: (activity) => this.deps.handlers.onActivity(activity),
      onEvidence: (evidence) => this.deps.handlers.onEvidence(evidence),
      onInterrupted: () => this.stopPlayback(),
      onSetupComplete: () => {
        // no-op: greeting is sent by the protocol itself
      },
      onDisconnected: (reason) => this.deps.handlers.onDisconnected(reason),
      onError: (message) => this.deps.handlers.onError(message),
      onEndCallRequested: () => this.handleEndCallRequested(),
      onTurnComplete: () => this.handleTurnComplete(),
    });
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

  private handleTurnComplete(): void {
    if (!this.endPending || this.endFired) return;
    const ctx = this.playCtx;
    const remainingMs = ctx ? Math.max(0, (this.nextStartTime - ctx.currentTime) * 1000) : 0;
    if (this.endDrainTimer) clearTimeout(this.endDrainTimer);
    this.endDrainTimer = setTimeout(() => this.fireEndRequested(), remainingMs + END_CALL_DRAIN_MS);
  }

  async connect(): Promise<void> {
    await this.setupCapture();
    this.setupPlayback();

    const url = geminiLiveUrlForToken(this.params.token);
    const setupMessage = buildGeminiLiveSetup({
      model: this.params.model,
      voice: this.params.voice,
      instructions: this.params.instructions,
    });
    await this.protocol.connect(url, setupMessage);
  }

  sendText(text: string): void {
    this.protocol.sendText(text);
  }

  mute(muted: boolean): void {
    this.muted = muted;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.endDrainTimer) clearTimeout(this.endDrainTimer);
    if (this.endSafetyTimer) clearTimeout(this.endSafetyTimer);
    this.protocol.close();
    this.stopPlayback();

    try {
      this.captureWorklet?.disconnect();
      this.captureProcessor?.disconnect();
      this.captureSource?.disconnect();
    } catch {
      // ignore
    }
    this.captureWorklet = null;
    this.captureProcessor = null;
    this.captureSource = null;
    void this.captureCtx?.close().catch(() => {});
    this.captureCtx = null;

    try {
      this.playCtx?.close();
    } catch {
      // ignore
    }
    this.playCtx = null;
  }

  // --- capture -------------------------------------------------------------

  private async setupCapture(): Promise<void> {
    const ctx = new AudioContext({ sampleRate: CAPTURE_SAMPLE_RATE });
    this.captureCtx = ctx;
    if (ctx.state === "suspended") await ctx.resume();

    const source = ctx.createMediaStreamSource(this.deps.mediaStream);
    this.captureSource = source;

    try {
      const blob = new Blob([WORKLET_SOURCE], { type: "application/javascript" });
      const blobUrl = URL.createObjectURL(blob);
      await ctx.audioWorklet.addModule(blobUrl);
      URL.revokeObjectURL(blobUrl);

      const worklet = new AudioWorkletNode(ctx, "pcm-capture");
      worklet.port.onmessage = (ev: MessageEvent<ArrayBuffer>) => {
        if (this.muted) return;
        this.protocol.sendAudioPcm16(ev.data);
      };
      source.connect(worklet);
      this.captureWorklet = worklet;
    } catch {
      // Fallback: ScriptProcessorNode
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (ev) => {
        if (this.muted) return;
        const int16 = floatToInt16(ev.inputBuffer.getChannelData(0));
        this.protocol.sendAudioPcm16(int16.buffer as ArrayBuffer);
      };
      const silentGain = ctx.createGain();
      silentGain.gain.value = 0;
      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(ctx.destination);
      this.captureProcessor = processor;
    }
  }

  // --- playback --------------------------------------------------------------

  private setupPlayback(): void {
    const ctx = new AudioContext({ sampleRate: PLAYBACK_SAMPLE_RATE });
    this.playCtx = ctx;
    if (ctx.state === "suspended") void ctx.resume();
    this.nextStartTime = ctx.currentTime;
  }

  private playChunk(bytes: ArrayBuffer): void {
    const ctx = this.playCtx;
    if (!ctx) return;
    const int16 = new Int16Array(bytes);
    const buffer = ctx.createBuffer(1, int16.length, PLAYBACK_SAMPLE_RATE);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < int16.length; i++) channel[i] = int16[i] / (int16[i] < 0 ? 0x8000 : 0x7fff);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    const startAt = Math.max(ctx.currentTime, this.nextStartTime);
    source.start(startAt);
    this.nextStartTime = startAt + buffer.duration;
    this.scheduled.push(source);
    source.onended = () => {
      this.scheduled = this.scheduled.filter((s) => s !== source);
    };
  }

  private stopPlayback(): void {
    for (const source of this.scheduled) {
      try {
        source.stop();
      } catch {
        // already stopped
      }
    }
    this.scheduled = [];
    if (this.playCtx) this.nextStartTime = this.playCtx.currentTime;
  }
}
