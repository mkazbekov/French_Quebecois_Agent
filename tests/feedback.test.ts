import { describe, expect, it } from "vitest";
import { FeedbackInputSchema, buildFeedbackPayload, buildMailtoUrl, looksLikeEmail } from "@/lib/feedback";

describe("FeedbackInputSchema", () => {
  it("rejects an empty message", () => {
    const result = FeedbackInputSchema.safeParse({ message: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a whitespace-only message and trims a real one", () => {
    expect(FeedbackInputSchema.safeParse({ message: "   " }).success).toBe(false);
    const result = FeedbackInputSchema.safeParse({ message: "  hello there  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.message).toBe("hello there");
  });

  it("rejects an oversize message", () => {
    const result = FeedbackInputSchema.safeParse({ message: "a".repeat(4001) });
    expect(result.success).toBe(false);
  });

  it("accepts a message right at the size limit", () => {
    const result = FeedbackInputSchema.safeParse({ message: "a".repeat(4000) });
    expect(result.success).toBe(true);
  });

  it("rejects a malformed email", () => {
    const result = FeedbackInputSchema.safeParse({ message: "hi", email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("accepts an empty-string email as absent", () => {
    const result = FeedbackInputSchema.safeParse({ message: "hi", email: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBeUndefined();
  });

  it("accepts a valid email and defaults include_details to false", () => {
    const result = FeedbackInputSchema.safeParse({ message: "hi", email: "learner@example.com" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("learner@example.com");
      expect(result.data.include_details).toBe(false);
    }
  });
});

describe("looksLikeEmail", () => {
  it("accepts a plausible address and rejects garbage", () => {
    expect(looksLikeEmail("a@b.com")).toBe(true);
    expect(looksLikeEmail("not-an-email")).toBe(false);
    expect(looksLikeEmail("a@b")).toBe(false);
    expect(looksLikeEmail("")).toBe(false);
  });
});

const details = { version: "0.2.0", platform: "win32", provider: "gemini" };

describe("buildFeedbackPayload", () => {
  it("omits details unless include_details is true", () => {
    const input = { message: "hello", email: undefined, include_details: false } as const;
    const payload = buildFeedbackPayload(input, details);
    expect(Object.keys(payload).sort()).toEqual(["app", "message", "sent_at"]);
  });

  it("includes exactly version/platform/provider when include_details is true", () => {
    const input = { message: "hello", email: undefined, include_details: true } as const;
    const payload = buildFeedbackPayload(input, details);
    expect(Object.keys(payload).sort()).toEqual(
      ["app", "message", "platform", "provider", "sent_at", "version"].sort(),
    );
    expect(payload).toMatchObject(details);
  });

  it("includes email only when given, and never any other key", () => {
    const input = { message: "hello", email: "learner@example.com", include_details: true } as const;
    const payload = buildFeedbackPayload(input, details);
    expect(Object.keys(payload).sort()).toEqual(
      ["app", "email", "message", "platform", "provider", "sent_at", "version"].sort(),
    );
    expect(payload.app).toBe("quebec-french-tutor");
    expect(payload.email).toBe("learner@example.com");
  });

  it("never leaks anything beyond the documented fields", () => {
    const input = { message: "hello", email: "learner@example.com", include_details: true } as const;
    const payload = buildFeedbackPayload(input, details);
    const allowed = new Set(["message", "email", "app", "sent_at", "version", "platform", "provider"]);
    for (const key of Object.keys(payload)) {
      expect(allowed.has(key)).toBe(true);
    }
  });
});

describe("buildMailtoUrl", () => {
  it("encodes the recipient, subject and message body", () => {
    const payload = buildFeedbackPayload({ message: "hello, world!", email: undefined, include_details: false }, details);
    const url = buildMailtoUrl({ to: "mjkazbekov@gmail.com", payload });

    // The address is left readable: a percent-encoded "@" breaks some mail clients.
    expect(url.startsWith("mailto:mjkazbekov@gmail.com?")).toBe(true);
    expect(url).toContain(`subject=${encodeURIComponent("Québec French Tutor feedback")}`);
    expect(url).toContain(encodeURIComponent("hello, world!"));
  });

  it("includes technical details and the reply email in the body when present", () => {
    const payload = buildFeedbackPayload(
      { message: "it broke", email: "learner@example.com", include_details: true },
      details,
    );
    const url = buildMailtoUrl({ to: "mjkazbekov@gmail.com", payload });
    const body = decodeURIComponent(url.split("body=")[1]);

    expect(body).toContain("it broke");
    expect(body).toContain("0.2.0");
    expect(body).toContain("win32");
    expect(body).toContain("gemini");
    expect(body).toContain("learner@example.com");
  });
});
