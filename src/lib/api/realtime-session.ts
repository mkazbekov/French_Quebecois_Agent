import { z } from "zod";
import { SessionModeSchema } from "@/lib/learner/schema";
import { buildTutorInstructions } from "@/lib/tutor/instructions";
import { describeGeminiError, isGeminiKeyRejection } from "@/lib/tutor/gemini-errors";
import type { StartSessionResponse } from "@/lib/voice/types";
import { fail, keyFixHint, ok, type ApiDeps, type ApiResult, type TutorConfig } from "./types";

const BodySchema = z.object({ mode: SessionModeSchema.optional() });

/**
 * Loads the learner, builds the tutor instructions, and mints a short-lived
 * client credential for the configured voice provider. The permanent API key
 * is only ever used here, to mint that credential.
 */
export async function startSession(rawBody: unknown, { store, config }: ApiDeps): Promise<ApiResult> {
  const parsed = BodySchema.safeParse(rawBody ?? {});
  if (!parsed.success) return fail(400, "Invalid request body");
  const requestedMode = parsed.data.mode ?? "auto";

  const provider = config.voiceProvider;
  const hasKey = provider === "gemini" ? config.geminiApiKey : config.openaiApiKey;
  if (!hasKey) {
    const message =
      provider === "gemini"
        ? config.platform === "android"
          ? "No Gemini API key is saved on this phone yet. Tap Change API key at the bottom of the screen (free key at https://aistudio.google.com/apikey)."
          : "No Gemini API key is set up yet. Close the tutor window, then double-click Start Tutor again — it will ask for your key (free at https://aistudio.google.com/apikey). Developers: `npm run setup`."
        : "No OpenAI API key yet. Put OPENAI_API_KEY in .env (paid key at https://platform.openai.com/api-keys), then restart `npm run dev`.";
    return fail(500, message);
  }

  const state = await store.load();
  const records = await store.recentSessionRecords(3);
  const { instructions, mode } = buildTutorInstructions({ state, mode: requestedMode, recentRecords: records });

  const base = { sessionId: crypto.randomUUID(), startedAt: new Date().toISOString(), mode, instructions };

  try {
    if (provider === "gemini") {
      const token = await mintGeminiToken(config);
      const body: StartSessionResponse = {
        ...base,
        provider: "gemini",
        gemini: { token, model: config.geminiLiveModel, voice: config.geminiLiveVoice },
      };
      return ok(body);
    }
    const clientSecret = await mintOpenAISecret(config, instructions);
    const body: StartSessionResponse = {
      ...base,
      provider: "openai",
      openai: {
        clientSecret,
        model: config.openaiRealtimeModel ?? "",
        voice: config.openaiRealtimeVoice ?? "",
      },
    };
    return ok(body);
  } catch (err) {
    return fail(502, err instanceof Error ? err.message : String(err));
  }
}

/** Gemini ephemeral token: one session, usable for 2 minutes, valid for 30. */
async function mintGeminiToken(config: TutorConfig): Promise<string> {
  const now = Date.now();
  const res = await fetch("https://generativelanguage.googleapis.com/v1alpha/auth_tokens", {
    method: "POST",
    headers: { "x-goog-api-key": config.geminiApiKey ?? "", "Content-Type": "application/json" },
    body: JSON.stringify({
      uses: 1,
      expireTime: new Date(now + 30 * 60_000).toISOString(),
      newSessionExpireTime: new Date(now + 2 * 60_000).toISOString(),
    }),
  });
  if (!res.ok) throw new Error(await friendlyGeminiError(res, config));
  const data = (await res.json()) as { name?: string };
  if (!data.name) throw new Error("Gemini token response had no token");
  return data.name;
}

/**
 * Turn a failed Gemini REST response into a message a non-technical learner
 * can act on. Never includes the API key; keeps the raw status/reason short
 * for debugging. A 400 is only treated as a bad key when the body actually
 * blames the key (isGeminiKeyRejection) — other 400s are request/schema
 * problems, not something a new key would fix.
 */
async function friendlyGeminiError(res: Response, config: TutorConfig): Promise<string> {
  const bodyText = await res.text().catch(() => "");
  const detail = describeGeminiError(res.status, bodyText);

  if (res.status === 429) {
    return `Gemini's free quota is used up for now — wait a minute (or until tomorrow for the daily limit) and try again. ${detail}`;
  }
  if (isGeminiKeyRejection(res.status, bodyText)) {
    return `Google rejected your Gemini API key (it may be mistyped, deleted, or restricted). ${keyFixHint(config)} ${detail}`;
  }
  return `Gemini token request failed ${detail}`;
}

async function mintOpenAISecret(config: TutorConfig, instructions: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.openaiApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      expires_after: { anchor: "created_at", seconds: 600 },
      session: {
        type: "realtime",
        model: config.openaiRealtimeModel,
        instructions,
        audio: {
          input: {
            transcription: { model: "gpt-4o-transcribe", language: "fr" },
            // eagerness "low": wait for the learner to finish rather than jumping in at the first pause.
            turn_detection: { type: "semantic_vad", eagerness: "low", create_response: true, interrupt_response: true },
          },
          output: { voice: config.openaiRealtimeVoice },
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`OpenAI Realtime API returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { value?: string };
  if (!data.value) throw new Error("OpenAI client secret response had no value");
  return data.value;
}
