import type { LearnerStore } from "@/lib/learner/store";

/**
 * Everything the API handlers need from their environment. The desktop routes
 * build this from process.env (server), the Android app from the key stored on
 * the phone. Handlers in this folder must never import `@/lib/env`.
 */
export interface TutorConfig {
  /** Where the handlers run: decides which hint a "bad key" message gives. */
  platform: "desktop" | "android";
  /** Shown in the feedback draft's optional details (process.platform / "android"). */
  platformLabel: string;
  version: string;
  voiceProvider: "gemini" | "openai";
  reviewProvider: "gemini" | "openai";
  geminiApiKey?: string;
  geminiLiveModel: string;
  geminiLiveVoice: string;
  /** Fallback list; the first model that answers wins. */
  geminiReviewModels: string[];
  openaiApiKey?: string;
  openaiRealtimeModel?: string;
  openaiRealtimeVoice?: string;
  openaiReviewModel?: string;
  feedbackEmail: string;
}

export interface ApiDeps {
  store: LearnerStore;
  config: TutorConfig;
}

export interface ApiResult<T = unknown> {
  status: number;
  body: T;
}

export function ok<T>(body: T, status = 200): ApiResult<T> {
  return { status, body };
}

export function fail(status: number, error: string, extra: Record<string, unknown> = {}): ApiResult<{ error: string }> {
  return { status, body: { error, ...extra } as { error: string } };
}

/** "Change the key" hint that fits the platform the learner is on. */
export function keyFixHint(config: Pick<TutorConfig, "platform">): string {
  return config.platform === "android"
    ? "Tap Change API key at the bottom of the screen and paste a new key."
    : "Close the tutor window, then double-click Start Tutor again — it will check the key and ask for a new one.";
}
