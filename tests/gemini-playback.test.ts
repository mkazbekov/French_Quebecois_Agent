import { describe, expect, it } from "vitest";
import { isStaleCapture, nextChunkStart } from "@/lib/voice/gemini-session";

describe("nextChunkStart", () => {
  it("adds a lead-in when the queue has drained", () => {
    // currentTime === nextStartTime: queue just drained, start of a turn.
    expect(nextChunkStart(10, 10, 0.15)).toBeCloseTo(10.15);
  });

  it("adds a lead-in when the schedule has fallen behind currentTime", () => {
    // nextStartTime in the past (e.g. after a stall): still treat as drained.
    expect(nextChunkStart(10, 5, 0.15)).toBeCloseTo(10.15);
  });

  it("keeps appending right after the last chunk mid-turn", () => {
    // nextStartTime ahead of currentTime: chunks already queued, no lead-in.
    expect(nextChunkStart(10, 12, 0.15)).toBe(12);
  });

  it("uses the default lead-in constant when none is passed", () => {
    expect(nextChunkStart(0, 0)).toBeCloseTo(0.15);
  });
});

describe("isStaleCapture", () => {
  it("keeps fresh chunks", () => {
    expect(isStaleCapture(10, 9.9, 0.75)).toBe(false);
  });

  it("drops backlog older than the max age", () => {
    expect(isStaleCapture(10, 5, 0.75)).toBe(true);
  });

  it("uses the default max age", () => {
    expect(isStaleCapture(10, 9.9)).toBe(false);
    expect(isStaleCapture(10, 8)).toBe(true);
  });
});
