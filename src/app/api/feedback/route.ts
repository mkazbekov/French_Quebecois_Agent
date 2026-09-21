import { readFileSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import type { FeedbackDetails } from "@/lib/feedback";

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

/**
 * Everything the feedback form needs to compose an email draft: who it goes to,
 * and the three technical details the sender may choose to attach. There is no
 * POST — the app never transmits feedback itself; the learner's own mail app
 * does, so nothing leaves the machine that they haven't seen and sent.
 */
export async function GET() {
  const details: FeedbackDetails = {
    version: readAppVersion(),
    platform: process.platform,
    provider: env.VOICE_PROVIDER,
  };
  return NextResponse.json({ contact: env.FEEDBACK_EMAIL, details });
}
