import { NextRequest, NextResponse } from "next/server";
import { deleteLearner, getLearner, patchLearner } from "@/lib/api/learner";
import { serverDeps } from "@/lib/server-deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Thin wrappers over the shared handlers in src/lib/api/learner.ts. */
export async function GET() {
  const { status, body } = await getLearner(await serverDeps());
  return NextResponse.json(body, { status });
}

export async function DELETE(request: NextRequest) {
  const scope = new URL(request.url).searchParams.get("scope");
  const { status, body } = await deleteLearner(scope, await serverDeps());
  return NextResponse.json(body, { status });
}

export async function PATCH(request: NextRequest) {
  const raw = await request.json().catch(() => null);
  const { status, body } = await patchLearner(raw, await serverDeps());
  return NextResponse.json(body, { status });
}
