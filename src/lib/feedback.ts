/**
 * Feedback composing. Pure, no I/O — no network call is ever made with this.
 *
 * "Send feedback" opens a pre-addressed email in the learner's own mail app.
 * The app never transmits the message itself: the learner presses send in
 * their own client, so they see exactly what leaves their machine, and the
 * reply address is simply whatever they send from.
 *
 * Nothing outside the shapes below may go into that draft: no transcript, no
 * learner profile, no API keys. See CLAUDE.md.
 */
import { z } from "zod";

export const FEEDBACK_SUBJECT = "Québec French Tutor feedback";

export const FeedbackInputSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, "Please write a message before sending.")
    .max(4000, "Please keep feedback under 4000 characters."),
  include_details: z.boolean().default(false),
});

export type FeedbackInput = z.infer<typeof FeedbackInputSchema>;

/** Technical details a sender can opt into attaching. Nothing else is ever included. */
export type FeedbackDetails = {
  version: string;
  platform: string;
  provider: string;
};

/**
 * Builds the body of the email draft. `details` is only appended when
 * `input.include_details` is true, and only those three fields.
 */
export function buildFeedbackBody(input: FeedbackInput, details: FeedbackDetails): string {
  const lines = [input.message.trim()];
  if (input.include_details) {
    lines.push("", "---", `App version: ${details.version}`, `System: ${details.platform}`, `Voice provider: ${details.provider}`);
  }
  return lines.join("\n");
}

/** `mailto:` URL — opens the learner's own mail app with everything filled in. */
export function buildMailtoUrl({ to, body }: { to: string; body: string }): string {
  // The address goes in as-is apart from characters that would break the URL:
  // percent-encoding the "@" (as encodeURIComponent does) leaves some mail
  // clients showing a broken recipient instead of opening a draft.
  const recipient = to.trim().replace(/[\s<>"]/g, "");
  return `mailto:${recipient}?subject=${encodeURIComponent(FEEDBACK_SUBJECT)}&body=${encodeURIComponent(body)}`;
}

/**
 * Gmail's web compose URL. The escape hatch for someone with no mail app
 * configured — most learners here read mail in a browser tab.
 */
export function buildGmailComposeUrl({ to, body }: { to: string; body: string }): string {
  const params = new URLSearchParams({
    view: "cm",
    fs: "1",
    to: to.trim(),
    su: FEEDBACK_SUBJECT,
    body,
  });
  return `https://mail.google.com/mail/?${params.toString()}`;
}
