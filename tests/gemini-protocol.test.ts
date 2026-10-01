import { afterEach, describe, expect, it, vi } from "vitest";
import { GeminiLiveProtocol, MAX_BUFFERED_AUDIO_BYTES, shouldSendAudio } from "@/lib/voice/gemini-protocol";
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

afterEach(() => vi.unstubAllGlobals());

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
