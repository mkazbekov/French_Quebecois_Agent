/**
 * Builds the Gemini Live API `setup` message for a tutor call.
 * Pure and client-safe (no env access): the server decides model/voice and the
 * instructions, the browser sends this as the first WebSocket frame.
 *
 * Verified against the live API on 2026-09-17 with model gemini-3.8-live.
 */

export const NOTE_EVIDENCE_TOOL = {
  name: "note_evidence",
  description:
    "Silently record one piece of learning evidence about the learner (error, vocabulary gap, good usage, comprehension or pronunciation issue). Never mention this tool to the learner.",
  parameters: {
    type: "OBJECT",
    properties: {
      kind: {
        type: "STRING",
        enum: [
          "grammar_error",
          "vocabulary_gap",
          "vocabulary_success",
          "comprehension_problem",
          "pronunciation_issue",
          "grammar_success",
          "quebec_usage",
        ],
      },
      observed: { type: "STRING", description: "What the learner said, if relevant" },
      preferred: { type: "STRING", description: "The correct or better form, if relevant" },
      note: { type: "STRING", description: "Short note" },
    },
    required: ["kind"],
  },
} as const;

export interface GeminiSetupInput {
  model: string;
  voice: string;
  instructions: string;
}

export function buildGeminiLiveSetup({ model, voice, instructions }: GeminiSetupInput) {
  return {
    setup: {
      model: `models/${model}`,
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
      },
      systemInstruction: { parts: [{ text: instructions }] },
      tools: [{ functionDeclarations: [NOTE_EVIDENCE_TOOL] }],
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      realtimeInputConfig: {
        automaticActivityDetection: {
          disabled: false,
          prefixPaddingMs: 100,
          silenceDurationMs: 600,
        },
      },
      // Lets calls run past the 15-minute audio session cap by compressing old context.
      contextWindowCompression: { slidingWindow: {} },
    },
  };
}

/** WebSocket URL for a browser holding an ephemeral token (auth_tokens/...). */
export function geminiLiveUrlForToken(token: string): string {
  return `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(token)}`;
}

/** WebSocket URL for a server-side check holding the real API key. */
export function geminiLiveUrlForApiKey(apiKey: string): string {
  return `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(apiKey)}`;
}

/** Sentinel first user turn that asks the tutor to open the call; filtered out of transcripts. */
export const CALL_START_SENTINEL = "[L'appel vient de commencer. Salue l'apprenant et pose ta première question.]";
