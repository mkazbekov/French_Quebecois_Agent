import { describe, expect, it, vi } from "vitest";
import { GeminiLiveProtocol, type GeminiLiveProtocolCallbacks } from "@/lib/voice/gemini-protocol";
import { CALL_START_SENTINEL } from "@/lib/tutor/gemini-setup";
import type { TranscriptTurn } from "@/lib/learner/schema";

function makeCallbacks(): GeminiLiveProtocolCallbacks {
  return {
    onAudioChunk: vi.fn(),
    onTranscript: vi.fn(),
    onPartialTranscript: vi.fn(),
    onActivity: vi.fn(),
    onEvidence: vi.fn(),
    onQuiz: vi.fn(),
    onInterrupted: vi.fn(),
    onSetupComplete: vi.fn(),
    onDisconnected: vi.fn(),
    onError: vi.fn(),
    onEndCallRequested: vi.fn(),
    onTurnComplete: vi.fn(),
  };
}

function makeProtocol() {
  const callbacks = makeCallbacks();
  const protocol = new GeminiLiveProtocol(callbacks);
  return { protocol, callbacks };
}

describe("GeminiLiveProtocol partial transcripts", () => {
  it("emits growing partials as inputTranscription deltas arrive, then finalizes on turnComplete", () => {
    const { protocol, callbacks } = makeProtocol();

    protocol.handleServerMessage({ serverContent: { inputTranscription: { text: "Bon" } } });
    protocol.handleServerMessage({ serverContent: { inputTranscription: { text: "jour" } } });

    const partialCalls = (callbacks.onPartialTranscript as ReturnType<typeof vi.fn>).mock.calls as [TranscriptTurn[]][];
    expect(partialCalls.length).toBeGreaterThanOrEqual(2);
    expect(partialCalls[0][0]).toEqual([{ role: "user", text: "Bon" }]);
    expect(partialCalls[1][0]).toEqual([{ role: "user", text: "Bonjour" }]);

    protocol.handleServerMessage({ serverContent: { turnComplete: true } });

    const transcriptCalls = (callbacks.onTranscript as ReturnType<typeof vi.fn>).mock.calls as [TranscriptTurn[]][];
    const finalTurns = transcriptCalls[transcriptCalls.length - 1][0];
    expect(finalTurns).toEqual([{ role: "user", text: "Bonjour" }]);

    // Partials cleared after turnComplete.
    const lastPartialCall = partialCalls[partialCalls.length - 1][0];
    expect(lastPartialCall).toEqual([]);
  });

  it("emits assistant partials from outputTranscription and finalizes them too", () => {
    const { protocol, callbacks } = makeProtocol();

    protocol.handleServerMessage({ serverContent: { outputTranscription: { text: "Salut" } } });
    protocol.handleServerMessage({ serverContent: { outputTranscription: { text: " toi" } } });
    protocol.handleServerMessage({ serverContent: { turnComplete: true } });

    const transcriptCalls = (callbacks.onTranscript as ReturnType<typeof vi.fn>).mock.calls as [TranscriptTurn[]][];
    const finalTurns = transcriptCalls[transcriptCalls.length - 1][0];
    expect(finalTurns).toEqual([{ role: "assistant", text: "Salut toi" }]);
  });

  it("clears partials after an interrupted turn too", () => {
    const { protocol, callbacks } = makeProtocol();
    protocol.handleServerMessage({ serverContent: { outputTranscription: { text: "En train de parler" } } });
    protocol.handleServerMessage({ serverContent: { interrupted: true } });

    const partialCalls = (callbacks.onPartialTranscript as ReturnType<typeof vi.fn>).mock.calls as [TranscriptTurn[]][];
    expect(partialCalls[partialCalls.length - 1][0]).toEqual([]);
  });

  it("never lets the CALL_START_SENTINEL leak into a partial or a final turn", () => {
    const { protocol, callbacks } = makeProtocol();
    protocol.handleServerMessage({ serverContent: { inputTranscription: { text: CALL_START_SENTINEL } } });

    const partialCalls = (callbacks.onPartialTranscript as ReturnType<typeof vi.fn>).mock.calls as [TranscriptTurn[]][];
    for (const [partials] of partialCalls) {
      expect(partials.some((t) => t.text.includes(CALL_START_SENTINEL))).toBe(false);
    }

    protocol.handleServerMessage({ serverContent: { turnComplete: true } });
    const transcriptCalls = (callbacks.onTranscript as ReturnType<typeof vi.fn>).mock.calls as [TranscriptTurn[]][];
    for (const [turns] of transcriptCalls) {
      expect(turns.some((t) => t.text.includes(CALL_START_SENTINEL))).toBe(false);
    }
  });
});

describe("GeminiLiveProtocol ask_choice tool call", () => {
  function fakeWs() {
    return {
      readyState: (globalThis.WebSocket as unknown as { OPEN: number }).OPEN,
      send: vi.fn(),
    };
  }

  it("fires onQuiz with parsed values for a valid toolCall", () => {
    const { protocol, callbacks } = makeProtocol();
    const ws = fakeWs();
    (protocol as unknown as { ws: unknown }).ws = ws;

    protocol.handleServerMessage({
      toolCall: {
        functionCalls: [
          {
            id: "call-1",
            name: "ask_choice",
            args: {
              question: "Comment dit-on 'hello'?",
              options: ["Bonjour", "Au revoir", "Merci"],
              answer_index: 0,
              explanation: "Bonjour is the greeting.",
            },
          },
        ],
      },
    });

    expect(callbacks.onQuiz).toHaveBeenCalledTimes(1);
    expect(callbacks.onQuiz).toHaveBeenCalledWith({
      question: "Comment dit-on 'hello'?",
      options: ["Bonjour", "Au revoir", "Merci"],
      answer_index: 0,
      explanation: "Bonjour is the greeting.",
    });
    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ toolResponse: { functionResponses: [{ id: "call-1", name: "ask_choice", response: { result: "shown" } }] } }),
    );
  });

  it("clamps an out-of-range answer_index into bounds", () => {
    const { protocol, callbacks } = makeProtocol();
    const ws = fakeWs();
    (protocol as unknown as { ws: unknown }).ws = ws;

    protocol.handleServerMessage({
      toolCall: {
        functionCalls: [
          {
            id: "call-2",
            name: "ask_choice",
            args: {
              question: "Q?",
              options: ["A", "B"],
              answer_index: 99,
            },
          },
        ],
      },
    });

    expect(callbacks.onQuiz).toHaveBeenCalledWith(expect.objectContaining({ answer_index: 1 }));
  });

  it("fires nothing and does not throw for malformed args", () => {
    const { protocol, callbacks } = makeProtocol();
    const ws = fakeWs();
    (protocol as unknown as { ws: unknown }).ws = ws;

    expect(() =>
      protocol.handleServerMessage({
        toolCall: {
          functionCalls: [
            {
              id: "call-3",
              name: "ask_choice",
              args: { question: "Q?", options: ["only-one"] },
            },
          ],
        },
      }),
    ).not.toThrow();

    expect(callbacks.onQuiz).not.toHaveBeenCalled();
    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ toolResponse: { functionResponses: [{ id: "call-3", name: "ask_choice", response: { result: "invalid" } }] } }),
    );
  });
});

describe("GeminiLiveProtocol sendText with choice source", () => {
  it("records a choice turn with choice: true and no typed flag", () => {
    const { protocol, callbacks } = makeProtocol();
    const ws = {
      readyState: (globalThis.WebSocket as unknown as { OPEN: number }).OPEN,
      send: vi.fn(),
    };
    (protocol as unknown as { ws: unknown }).ws = ws;

    protocol.sendText("Bonjour", "choice");

    const transcriptCalls = (callbacks.onTranscript as ReturnType<typeof vi.fn>).mock.calls as [TranscriptTurn[]][];
    const lastTurns = transcriptCalls[transcriptCalls.length - 1][0];
    expect(lastTurns).toEqual([{ role: "user", text: "Bonjour", choice: true }]);
    expect(lastTurns[0]).not.toHaveProperty("typed");
  });

  it("still records a plain typed turn by default", () => {
    const { protocol, callbacks } = makeProtocol();
    const ws = {
      readyState: (globalThis.WebSocket as unknown as { OPEN: number }).OPEN,
      send: vi.fn(),
    };
    (protocol as unknown as { ws: unknown }).ws = ws;

    protocol.sendText("Salut");

    const transcriptCalls = (callbacks.onTranscript as ReturnType<typeof vi.fn>).mock.calls as [TranscriptTurn[]][];
    const lastTurns = transcriptCalls[transcriptCalls.length - 1][0];
    expect(lastTurns).toEqual([{ role: "user", text: "Salut", typed: true }]);
  });
});

describe("GeminiLiveProtocol turn hand-over", () => {
  it("publishes the learner turn as soon as the tutor starts answering, with no gap", () => {
    const { protocol, callbacks } = makeProtocol();

    protocol.handleServerMessage({ serverContent: { inputTranscription: { text: "Je vais bien" } } });
    // The model starts speaking: the learner turn is finalized mid-message.
    protocol.handleServerMessage({
      serverContent: { modelTurn: { parts: [{ inlineData: { data: "AAAA", mimeType: "audio/pcm" } }] } },
    });

    const transcriptCalls = (callbacks.onTranscript as ReturnType<typeof vi.fn>).mock.calls as [TranscriptTurn[]][];
    expect(transcriptCalls.length).toBeGreaterThan(0);
    expect(transcriptCalls[transcriptCalls.length - 1][0]).toEqual([{ role: "user", text: "Je vais bien" }]);

    // ...and it is no longer duplicated as a partial.
    const partialCalls = (callbacks.onPartialTranscript as ReturnType<typeof vi.fn>).mock.calls as [TranscriptTurn[]][];
    expect(partialCalls[partialCalls.length - 1][0]).toEqual([]);
  });
});
