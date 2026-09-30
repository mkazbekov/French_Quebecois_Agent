import { NextResponse } from "next/server";
import { startSession } from "@/lib/api/realtime-session";
import { serverDeps } from "@/lib/server-deps";

export const runtime = "nodejs";

/**
 * POST /api/realtime/session — thin wrapper over src/lib/api/realtime-session.ts.
 * Mints a short-lived client credential; the permanent API key never leaves the server.
 */
export async function POST(req: Request) {
  const raw = await req.json().catch(() => ({}));
  const { status, body } = await startSession(raw, await serverDeps());
  return NextResponse.json(body, { status });
}
