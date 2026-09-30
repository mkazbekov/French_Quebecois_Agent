import { NextResponse } from "next/server";
import { endSession } from "@/lib/api/session-end";
import { serverDeps } from "@/lib/server-deps";

export const runtime = "nodejs";

/** POST /api/session/end — thin wrapper over src/lib/api/session-end.ts (evidence → review → merge → persist). */
export async function POST(req: Request) {
  const raw = await req.json().catch(() => null);
  const { status, body } = await endSession(raw, await serverDeps());
  return NextResponse.json(body, { status });
}
