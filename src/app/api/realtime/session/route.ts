import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { getLearnerStore } from "@/lib/learner";
import { SessionModeSchema } from "@/lib/learner/schema";
import { buildTutorInstructions } from "@/lib/tutor/instructions";

export const runtime = "nodejs";

const BodySchema = z.object({
  mode: SessionModeSchema.optional(),
});

export async function POST(req: Request) {
  let apiKey: string;
  try {
    apiKey = env.OPENAI_API_KEY;
  } catch {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not set. Copy .env.example to .env and add your key." },
      { status: 500 },
    );
  }

  const rawBody = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const requestedMode = parsed.data.mode ?? "auto";

  const store = await getLearnerStore();
  const state = await store.load();
  const records = await store.recentSessionRecords(3);

  const { instructions, mode } = buildTutorInstructions({ state, mode: requestedMode, recentRecords: records });

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        expires_after: { anchor: "created_at", seconds: 600 },
        session: {
          type: "realtime",
          model: env.OPENAI_REALTIME_MODEL,
          instructions,
          audio: {
            input: {
              transcription: { model: "gpt-4o-transcribe", language: "fr" },
              turn_detection: {
                type: "semantic_vad",
                eagerness: "medium",
                create_response: true,
                interrupt_response: true,
              },
            },
            output: { voice: env.OPENAI_REALTIME_VOICE },
          },
        },
      }),
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to reach OpenAI Realtime API", detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }

  if (!upstreamResponse.ok) {
    const detail = (await upstreamResponse.text().catch(() => "")).slice(0, 500);
    return NextResponse.json(
      { error: `OpenAI Realtime API returned ${upstreamResponse.status}`, detail },
      { status: 502 },
    );
  }

  const data = (await upstreamResponse.json()) as {
    value: string;
    expires_at: number;
  };

  return NextResponse.json({
    sessionId: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    clientSecret: { value: data.value, expiresAt: data.expires_at },
    model: env.OPENAI_REALTIME_MODEL,
    voice: env.OPENAI_REALTIME_VOICE,
    instructions,
    mode,
  });
}
