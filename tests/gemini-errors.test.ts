import { describe, expect, it } from "vitest";
import { isGeminiKeyRejection } from "@/lib/tutor/gemini-errors";

describe("isGeminiKeyRejection", () => {
  it("treats 401 as a key rejection regardless of body", () => {
    expect(isGeminiKeyRejection(401, "")).toBe(true);
    expect(isGeminiKeyRejection(401, "anything")).toBe(true);
  });

  it("treats 403 as a key rejection regardless of body", () => {
    expect(isGeminiKeyRejection(403, "")).toBe(true);
  });

  it("treats a 400 with API_KEY_INVALID in error.details[].reason as a key rejection", () => {
    const body = JSON.stringify({
      error: {
        code: 400,
        message: "API key not valid. Please pass a valid API key.",
        status: "INVALID_ARGUMENT",
        details: [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "API_KEY_INVALID" }],
      },
    });
    expect(isGeminiKeyRejection(400, body)).toBe(true);
  });

  it("treats a 400 with 'API key not valid' in the message as a key rejection even without details", () => {
    const body = JSON.stringify({ error: { code: 400, message: "API key not valid." } });
    expect(isGeminiKeyRejection(400, body)).toBe(true);
  });

  it("treats a 400 with a raw (non-JSON) body mentioning API_KEY_INVALID as a key rejection", () => {
    expect(isGeminiKeyRejection(400, "API_KEY_INVALID: bad key")).toBe(true);
  });

  it("does NOT treat an unrelated 400 (bad request/schema) as a key rejection", () => {
    const body = JSON.stringify({
      error: { code: 400, message: "Invalid JSON payload received. Unknown name \"foo\"", status: "INVALID_ARGUMENT" },
    });
    expect(isGeminiKeyRejection(400, body)).toBe(false);
  });

  it("does NOT treat a 400 with unrelated details[].reason as a key rejection", () => {
    const body = JSON.stringify({
      error: { code: 400, details: [{ reason: "FIELD_MASK_MISSING" }] },
    });
    expect(isGeminiKeyRejection(400, body)).toBe(false);
  });

  it("does NOT treat other statuses (429, 500, 503) as a key rejection", () => {
    expect(isGeminiKeyRejection(429, "")).toBe(false);
    expect(isGeminiKeyRejection(500, "")).toBe(false);
    expect(isGeminiKeyRejection(503, "")).toBe(false);
  });
});
