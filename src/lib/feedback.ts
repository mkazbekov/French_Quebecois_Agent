/**
 * Feedback payload building. Pure, no I/O — kept separate from the API route
 * so the shape of what gets sent (and what never does) is unit-testable.
 *
 * Nothing outside this file's exported shapes may be sent to the relay: no
 * transcript, no learner profile, no API keys. See CLAUDE.md.
 */
import { z } from "zod";

export function looksLikeEmail(s: string): boolean {
  // Deliberately simple: this only gates "does this look like an email
  // address" for a reply, not RFC 5322 validation.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export const FeedbackInputSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, "Please write a message before sending.")
    .max(4000, "Please keep feedback under 4000 characters."),
  email: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : undefined))
    .refine((v) => v === undefined || looksLikeEmail(v), {
      message: "That doesn't look like a valid email address.",
    }),
  include_details: z.boolean().default(false),
});

export type FeedbackInput = z.infer<typeof FeedbackInputSchema>;

/** Technical details a submitter can opt into attaching. Nothing else is ever included. */
export type FeedbackDetails = {
  version: string;
  platform: string;
  provider: string;
};

export type FeedbackPayload = {
  message: string;
  email?: string;
  app: "quebec-french-tutor";
  sent_at: string;
} & Partial<FeedbackDetails>;

/**
 * Builds the exact JSON posted to the relay. `details` is only merged in
 * when `input.include_details` is true, and only those three fields.
 */
export function buildFeedbackPayload(input: FeedbackInput, details: FeedbackDetails): FeedbackPayload {
  return {
    message: input.message,
    ...(input.email ? { email: input.email } : {}),
    app: "quebec-french-tutor",
    sent_at: new Date().toISOString(),
    ...(input.include_details
      ? { version: details.version, platform: details.platform, provider: details.provider }
      : {}),
  };
}

/** Pre-filled mailto: URL used when there's no relay endpoint, or the relay failed. */
export function buildMailtoUrl({
  to,
  payload,
}: {
  to: string;
  payload: FeedbackPayload;
}): string {
  const subject = "Québec French Tutor feedback";
  const lines = [payload.message];
  if (payload.version || payload.platform || payload.provider) {
    lines.push("");
    lines.push("---");
    if (payload.version) lines.push(`App version: ${payload.version}`);
    if (payload.platform) lines.push(`System: ${payload.platform}`);
    if (payload.provider) lines.push(`Voice provider: ${payload.provider}`);
  }
  if (payload.email) {
    lines.push("");
    lines.push(`(Reply to: ${payload.email})`);
  }
  const body = lines.join("\n");
  // The address goes in as-is apart from characters that would break the URL:
  // percent-encoding the "@" (as encodeURIComponent does) leaves some mail
  // clients showing a broken recipient instead of opening a draft.
  const recipient = to.trim().replace(/[\s<>"]/g, "");
  return `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
