import { readFileSync } from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { FeedbackInputSchema, buildFeedbackPayload, buildMailtoUrl, type FeedbackDetails } from "@/lib/feedback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readAppVersion(): string {
  try {
    const pkgPath = path.join(process.cwd(), "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

function readDetails(): FeedbackDetails {
  return {
    version: readAppVersion(),
    platform: process.platform,
    provider: env.VOICE_PROVIDER,
  };
}

export async function GET() {
  return NextResponse.json({
    endpointConfigured: Boolean(env.FEEDBACK_ENDPOINT),
    contact: env.FEEDBACK_EMAIL,
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = FeedbackInputSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid feedback.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const contact = env.FEEDBACK_EMAIL;
  const payload = buildFeedbackPayload(parsed.data, readDetails());
  const endpoint = env.FEEDBACK_ENDPOINT;

  if (endpoint) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        return NextResponse.json({ delivered: true, autoReply: Boolean(payload.email) });
      }
      // Non-2xx from the relay: fall through to the mailto fallback below.
    } catch {
      // Network error / timeout: fall through to the mailto fallback below.
      // Never log the endpoint URL or any env value.
    }
  }

  const mailto = buildMailtoUrl({ to: contact, payload });
  return NextResponse.json({ delivered: false, mailto, contact });
}
