import { afterEach, describe, expect, it, vi } from "vitest";
import { GeminiLiveProtocol, MAX_BUFFERED_AUDIO_BYTES, REPLY_NUDGE_MS, shouldSendAudio } from "@/lib/voice/gemini-protocol";
import { REPLY_NUDGE_SENTINEL } from "@/lib/tutor/gemini-setup";
import type { GeminiLiveProtocolCallbacks } from "@/lib/voice/gemini-protocol";

class FakeWebSocket {
  static OPEN = 1;
  static last: FakeWebSocket;
  readyState = 1;
  bufferedAmount = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((ev: { code: number; reason: string }) => void) | null = null;
  constructor() {
    FakeWebSocket.last = this;
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {}
}

function makeCallbacks(log: string[]): GeminiLiveProtocolCallbacks {
  const noop = () => {};
  return {
    onAudioChunk: noop,
    onTranscript: noop,
    onPartialTranscript: (p) => log.push(`partial:${p.map((t) => t.text).join("|")}`),
    onActivity: noop,
    onEvidence: noop,
    onQuiz: noop,
    onInterrupted: noop,
    onSetupComplete: noop,
    onDisconnected: noop,
    onError: (m) => log.push(`error:${m}`),
    onEndCallRequested: noop,
    onTurnComplete: noop,
  };
}

async function connected(log: string[]) {
  vi.stubGlobal("WebSocket", FakeWebSocket);
  const proto = new GeminiLiveProtocol(makeCallbacks(log));
  const connecting = proto.connect("ws://x", {});
  const ws = FakeWebSocket.last;
  ws.onmessage!({ data: JSON.stringify({ setupComplete: {} }) });
  await connecting;
  return { proto, ws };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("shouldSendAudio", () => {
  it("allows sending while the buffer is small", () => {
    expect(shouldSendAudio(0)).toBe(true);
    expect(shouldSendAudio(MAX_BUFFERED_AUDIO_BYTES)).toBe(true);
  });

  it("drops audio once the buffer is backed up", () => {
    expect(shouldSendAudio(MAX_BUFFERED_AUDIO_BYTES + 1)).toBe(false);
  });
});

describe("GeminiLiveProtocol", () => {
  it("handles frames in arrival order even when a binary frame decodes slowly", async () => {
    const log: string[] = [];
    const { ws } = await connected(log);

    const first = JSON.stringify({ serverContent: { outputTranscription: { text: "first" } } });
    const slow = {
      arrayBuffer: () =>
        new Promise<ArrayBuffer>((r) =>
          setTimeout(() => r(new TextEncoder().encode(first).buffer as ArrayBuffer), 20),
        ),
    };
    ws.onmessage!({ data: slow });
    ws.onmessage!({ data: JSON.stringify({ serverContent: { outputTranscription: { text: " second" } } }) });
    await new Promise((r) => setTimeout(r, 60));

    expect(log.filter((l) => l.startsWith("partial:"))).toEqual(["partial:first", "partial:first second"]);
  });

  it("drops microphone chunks when the socket buffer is backed up", async () => {
    const { proto, ws } = await connected([]);
    const before = ws.sent.length;
    ws.bufferedAmount = MAX_BUFFERED_AUDIO_BYTES + 1;
    proto.sendAudioPcm16(new ArrayBuffer(3200));
    expect(ws.sent.length).toBe(before);
    ws.bufferedAmount = 0;
    proto.sendAudioPcm16(new ArrayBuffer(3200));
    expect(ws.sent.length).toBe(before + 1);
  });
});

describe("no-reply watchdog", () => {
  const nudges = (ws: FakeWebSocket) => ws.sent.filter((m) => m.includes(REPLY_NUDGE_SENTINEL)).length;
  const heard = (proto: GeminiLiveProtocol, text: string) => proto.handleServerMessage({ serverContent: { inputTranscription: { text } } });
  const audio = { serverContent: { modelTurn: { parts: [{ inlineData: { data: "AAAA", mimeType: "audio/pcm" } }] } } };

  it("nudges once when the learner spoke and no reply starts", async () => {
    vi.useFakeTimers();
    const log: string[] = [];
    const { proto, ws } = await connected(log);
    heard(proto, "Je suis allé au parc.");
    vi.advanceTimersByTime(REPLY_NUDGE_MS - 1);
    expect(nudges(ws)).toBe(0);
    vi.advanceTimersByTime(1);
    expect(nudges(ws)).toBe(1);
    // Still no answer: never a second nudge for the same turn.
    heard(proto, " Et toi ?");
    vi.advanceTimersByTime(REPLY_NUDGE_MS * 3);
    expect(nudges(ws)).toBe(1);
    // The nudge is not part of the learner's transcript.
    expect(log.some((l) => l.includes(REPLY_NUDGE_SENTINEL))).toBe(false);
  });

  it("does not nudge when the tutor answers, and re-arms for the next turn", async () => {
    vi.useFakeTimers();
    const { proto, ws } = await connected([]);
    heard(proto, "Bonjour");
    vi.advanceTimersByTime(2000);
    proto.handleServerMessage(audio);
    proto.handleServerMessage({ serverContent: { turnComplete: true } });
    vi.advanceTimersByTime(REPLY_NUDGE_MS * 2);
    expect(nudges(ws)).toBe(0);
    heard(proto, "Ça va bien");
    vi.advanceTimersByTime(REPLY_NUDGE_MS);
    expect(nudges(ws)).toBe(1);
  });

  it("restarts the wait while the learner keeps talking", async () => {
    vi.useFakeTimers();
    const { proto, ws } = await connected([]);
    heard(proto, "Hier");
    vi.advanceTimersByTime(REPLY_NUDGE_MS - 1000);
    heard(proto, " je suis allé");
    vi.advanceTimersByTime(REPLY_NUDGE_MS - 1000);
    expect(nudges(ws)).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(nudges(ws)).toBe(1);
  });

  it("ignores the tutor's own voice heard mid-answer, typed turns and closed calls", async () => {
    vi.useFakeTimers();
    const { proto, ws } = await connected([]);
    proto.handleServerMessage(audio);
    heard(proto, "echo");
    vi.advanceTimersByTime(REPLY_NUDGE_MS * 2);
    expect(nudges(ws)).toBe(0);
    proto.handleServerMessage({ serverContent: { turnComplete: true } });
    heard(proto, "Bonjour");
    proto.sendText("Bonjour !");
    vi.advanceTimersByTime(REPLY_NUDGE_MS * 2);
    expect(nudges(ws)).toBe(0);
    heard(proto, "Salut");
    proto.close();
    vi.advanceTimersByTime(REPLY_NUDGE_MS * 2);
    expect(nudges(ws)).toBe(0);
  });
});
