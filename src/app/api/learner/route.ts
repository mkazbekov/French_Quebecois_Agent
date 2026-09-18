import { NextResponse } from "next/server";
import { getLearnerStore } from "@/lib/learner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const store = await getLearnerStore();
  const state = await store.load();
  return NextResponse.json({ state, storeKind: store.kind });
}
