import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { getLearnerStore } from "@/lib/learner";
import { SessionModeSchema } from "@/lib/learner/schema";
import { buildTutorInstructions } from "@/lib/tutor/instructions";
import { describeGeminiError, isGeminiKeyRejection } from "@/lib/tutor/gemini-errors";
import type { StartSessionResponse } from "@/lib/voice/types";

export const runtime = "nodejs";

const BodySchema = z.object({ mode: SessionModeSchema.optional() });

/**
 * POST /api/realtime/session
 * Loads the learner, builds the tutor instructions, and mints a short-lived
 * client credential for the configured voice provider. The permanent API key
 * never leaves the server.
 */
export async function POST(req: Request) {
  const rawBody = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(rawBody);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  const requestedMode = parsed.data.mode ?? "auto";

  const provider = env.VOICE_PROVIDER;
  const keyCheck = provider === "gemini" ? "GEMINI_API_KEY" : "OPENAI_API_KEY";
  if (!process.env[keyCheck]) {
    const message =
      provider === "gemini"
        ? "No Gemini API key is set up yet. Close the tutor window, then double-click Start Tutor again — it will ask for your key (free at https://aistudio.google.com/apikey). Developers: `npm run setup`."
        : "No OpenAI API key yet. Put OPENAI_API_KEY in .env (paid key at https://platform.openai.com/api-keys), then restart `npm run dev`.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const store = await getLearnerStore();
  const state = await store.load();
  const records = await store.recentSessionRecords(3);
  const { instructions, mode } = buildTutorInstructions({ state, mode: requestedMode, recentRecords: records });

  const base = { sessionId: crypto.randomUUID(), startedAt: new Date().toISOString(), mode, instructions };

  try {
    if (provider === "gemini") {
      const token = await mintGeminiToken();
      const body: StartSessionResponse = {
        ...base,
        provider: "gemini",
        gemini: { token, model: env.GEMINI_LIVE_MODEL, voice: env.GEMINI_LIVE_VOICE },
      };
      return NextResponse.json(body);
    }
    const clientSecret = await mintOpenAISecret(instructions);
    const body: StartSessionResponse = {
      ...base,
      provider: "openai",
      openai: { clientSecret, model: env.OPENAI_REALTIME_MODEL, voice: env.OPENAI_REALTIME_VOICE },
    };
    return NextResponse.json(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/** Gemini ephemeral token: one session, usable for 2 minutes, valid for 30. */
async function mintGeminiToken(): Promise<string> {
  const now = Date.now();
  const res = await fetch("https://generativelanguage.googleapis.com/v1alpha/auth_tokens", {
    method: "POST",
    headers: { "x-goog-api-key": env.GEMINI_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      uses: 1,
      expireTime: new Date(now + 30 * 60_000).toISOString(),
      newSessionExpireTime: new Date(now + 2 * 60_000).toISOString(),
    }),
  });
  if (!res.ok) throw new Error(await friendlyGeminiError(res));
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
async function friendlyGeminiError(res: Response): Promise<string> {
  const bodyText = await res.text().catch(() => "");
  const detail = describeGeminiError(res.status, bodyText);

  if (res.status === 429) {
    return `Gemini's free quota is used up for now — wait a minute (or until tomorrow for the daily limit) and try again. ${detail}`;
  }
  if (isGeminiKeyRejection(res.status, bodyText)) {
    return `Google rejected your Gemini API key (it may be mistyped, deleted, or restricted). Close the tutor window and double-click Start Tutor again — it will check the key and ask for a new one. ${detail}`;
  }
  return `Gemini token request failed ${detail}`;
}

async function mintOpenAISecret(instructions: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      expires_after: { anchor: "created_at", seconds: 600 },
      session: {
        type: "realtime",
        model: env.OPENAI_REALTIME_MODEL,
        instructions,
        audio: {
          input: {
            transcription: { model: "gpt-4o-transcribe", language: "fr" },
            // eagerness "low": wait for the learner to finish rather than jumping in at the first pause.
            turn_detection: { type: "semantic_vad", eagerness: "low", create_response: true, interrupt_response: true },
          },
          output: { voice: env.OPENAI_REALTIME_VOICE },
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`OpenAI Realtime API returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { value?: string };
  if (!data.value) throw new Error("OpenAI client secret response had no value");
  return data.value;
}
