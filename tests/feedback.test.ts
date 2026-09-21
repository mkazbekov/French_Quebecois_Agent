import { describe, expect, it } from "vitest";
import {
  FEEDBACK_SUBJECT,
  FeedbackInputSchema,
  buildFeedbackBody,
  buildGmailComposeUrl,
  buildMailtoUrl,
} from "@/lib/feedback";

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

  it("defaults include_details to false", () => {
    const result = FeedbackInputSchema.safeParse({ message: "hi" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.include_details).toBe(false);
  });

  it("does not carry any field beyond message and include_details", () => {
    const result = FeedbackInputSchema.safeParse({
      message: "hi",
      include_details: true,
      transcript: "ne me mets pas dans le courriel",
      profile: { name: "someone" },
    });
    expect(result.success).toBe(true);
    if (result.success) expect(Object.keys(result.data).sort()).toEqual(["include_details", "message"]);
  });
});

const details = { version: "0.2.1", platform: "win32", provider: "gemini" };

describe("buildFeedbackBody", () => {
  it("is just the message when details are not opted into", () => {
    const body = buildFeedbackBody({ message: "hello", include_details: false }, details);
    expect(body).toBe("hello");
  });

  it("appends exactly version, platform and provider when opted in", () => {
    const body = buildFeedbackBody({ message: "it broke", include_details: true }, details);
    expect(body).toContain("it broke");
    expect(body).toContain("App version: 0.2.1");
    expect(body).toContain("System: win32");
    expect(body).toContain("Voice provider: gemini");
  });

  it("never includes anything the sender did not type or tick", () => {
    const body = buildFeedbackBody({ message: "hello", include_details: true }, details);
    const allowed = ["hello", "", "---", "App version: 0.2.1", "System: win32", "Voice provider: gemini"];
    expect(body.split("\n")).toEqual(allowed);
  });
});

describe("buildMailtoUrl", () => {
  it("encodes the recipient, subject and body", () => {
    const body = buildFeedbackBody({ message: "hello, world!", include_details: false }, details);
    const url = buildMailtoUrl({ to: "mjkazbekov@gmail.com", body });

    // The address is left readable: a percent-encoded "@" breaks some mail clients.
    expect(url.startsWith("mailto:mjkazbekov@gmail.com?")).toBe(true);
    expect(url).toContain(`subject=${encodeURIComponent(FEEDBACK_SUBJECT)}`);
    expect(decodeURIComponent(url.split("body=")[1])).toBe("hello, world!");
  });

  it("strips characters that would break the mailto URL", () => {
    const url = buildMailtoUrl({ to: ' "me@example.com" ', body: "hi" });
    expect(url.startsWith("mailto:me@example.com?")).toBe(true);
  });
});

describe("buildGmailComposeUrl", () => {
  it("builds a compose link carrying the same subject and body", () => {
    const body = buildFeedbackBody({ message: "it broke", include_details: true }, details);
    const url = new URL(buildGmailComposeUrl({ to: "mjkazbekov@gmail.com", body }));

    expect(url.origin + url.pathname).toBe("https://mail.google.com/mail/");
    expect(url.searchParams.get("view")).toBe("cm");
    expect(url.searchParams.get("to")).toBe("mjkazbekov@gmail.com");
    expect(url.searchParams.get("su")).toBe(FEEDBACK_SUBJECT);
    expect(url.searchParams.get("body")).toBe(body);
  });
});
