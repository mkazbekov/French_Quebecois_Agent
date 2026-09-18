import { OpenAIVoiceSession } from "./openai-session";
import { GeminiVoiceSession } from "./gemini-session";
import type { StartSessionResponse, VoiceSession, VoiceSessionDeps } from "./types";

export type { VoiceSession, VoiceSessionDeps, VoiceSessionHandlers, VoiceActivity, StartSessionResponse } from "./types";

/** Builds the right VoiceSession implementation for what the server minted. */
export function createVoiceSession(resp: StartSessionResponse, deps: VoiceSessionDeps): VoiceSession {
  if (resp.provider === "gemini") {
    return new GeminiVoiceSession(deps, {
      token: resp.gemini.token,
      model: resp.gemini.model,
      voice: resp.gemini.voice,
      instructions: resp.instructions,
    });
  }
  return new OpenAIVoiceSession(deps, {
    clientSecret: resp.openai.clientSecret,
    model: resp.openai.model,
    voice: resp.openai.voice,
    instructions: resp.instructions,
  });
}
