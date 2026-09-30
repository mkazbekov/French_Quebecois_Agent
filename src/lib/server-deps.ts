import { readFileSync } from "node:fs";
import path from "node:path";
import { env } from "@/lib/env";
import { getLearnerStore } from "@/lib/learner";
import type { ApiDeps, TutorConfig } from "@/lib/api/types";

/** Server-only: the desktop app's handler dependencies, read from .env and the Letta/file store. */
export function readAppVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as { version?: string };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

export function serverConfig(): TutorConfig {
  return {
    platform: "desktop",
    platformLabel: process.platform,
    version: readAppVersion(),
    voiceProvider: env.VOICE_PROVIDER,
    reviewProvider: env.REVIEW_PROVIDER,
    geminiApiKey: process.env.GEMINI_API_KEY || undefined,
    geminiLiveModel: env.GEMINI_LIVE_MODEL,
    geminiLiveVoice: env.GEMINI_LIVE_VOICE,
    geminiReviewModels: env.GEMINI_REVIEW_MODELS,
    openaiApiKey: process.env.OPENAI_API_KEY || undefined,
    openaiRealtimeModel: env.OPENAI_REALTIME_MODEL,
    openaiRealtimeVoice: env.OPENAI_REALTIME_VOICE,
    openaiReviewModel: env.OPENAI_REVIEW_MODEL,
    feedbackEmail: env.FEEDBACK_EMAIL,
  };
}

export async function serverDeps(): Promise<ApiDeps> {
  return { store: await getLearnerStore(), config: serverConfig() };
}
