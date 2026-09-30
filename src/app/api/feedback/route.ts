import { NextResponse } from "next/server";
import { getFeedback } from "@/lib/api/feedback";
import { serverConfig } from "@/lib/server-deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/feedback — thin wrapper over the shared handler (see src/lib/api/feedback.ts). */
export async function GET() {
  const { status, body } = getFeedback({ config: serverConfig() });
  return NextResponse.json(body, { status });
}
