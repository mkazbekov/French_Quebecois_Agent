import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * env.ts reads process.env live (via getters), so tests can mutate
 * process.env directly and re-import via a fresh dynamic import each time —
 * but since Node's ESM module cache would otherwise return the same module
 * object, we instead just re-check the getters, which read process.env on
 * every access (no caching), so no re-import is actually needed.
 */
import { env } from "@/lib/env";

const KEYS = ["GEMINI_API_KEY", "OPENAI_API_KEY", "VOICE_PROVIDER", "REVIEW_PROVIDER"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of KEYS) saved[k] = process.env[k];
  for (const k of KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("env provider auto-pick", () => {
  it("picks gemini when neither key is set (brand-new install, before setup runs)", () => {
    expect(env.VOICE_PROVIDER).toBe("gemini");
    expect(env.REVIEW_PROVIDER).toBe("gemini");
  });

  it("picks gemini when only GEMINI_API_KEY is set", () => {
    process.env.GEMINI_API_KEY = "test-key";
    expect(env.VOICE_PROVIDER).toBe("gemini");
    expect(env.REVIEW_PROVIDER).toBe("gemini");
  });

  it("picks openai only when OPENAI_API_KEY is set and GEMINI_API_KEY is not", () => {
    process.env.OPENAI_API_KEY = "test-key";
    expect(env.VOICE_PROVIDER).toBe("openai");
    expect(env.REVIEW_PROVIDER).toBe("openai");
  });

  it("prefers gemini when both keys are set", () => {
    process.env.GEMINI_API_KEY = "gem-key";
    process.env.OPENAI_API_KEY = "oai-key";
    expect(env.VOICE_PROVIDER).toBe("gemini");
    expect(env.REVIEW_PROVIDER).toBe("gemini");
  });

  it("respects an explicit VOICE_PROVIDER / REVIEW_PROVIDER override", () => {
    process.env.GEMINI_API_KEY = "gem-key";
    process.env.VOICE_PROVIDER = "openai";
    process.env.REVIEW_PROVIDER = "openai";
    expect(env.VOICE_PROVIDER).toBe("openai");
    expect(env.REVIEW_PROVIDER).toBe("openai");
  });
});
