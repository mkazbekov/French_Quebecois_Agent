import type { FeedbackDetails } from "@/lib/feedback";
import { ok, type ApiDeps, type ApiResult } from "./types";

/**
 * Everything the feedback form needs to compose an email draft: who it goes to,
 * and the three technical details the sender may choose to attach. There is no
 * POST — the app never transmits feedback itself; the learner's own mail app
 * does, so nothing leaves the device that they haven't seen and sent.
 */
export function getFeedback({ config }: Pick<ApiDeps, "config">): ApiResult {
  const details: FeedbackDetails = {
    version: config.version,
    platform: config.platformLabel,
    provider: config.voiceProvider,
  };
  return ok({ contact: config.feedbackEmail, details });
}
