import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getLearnerStore } from "@/lib/learner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const store = await getLearnerStore();
  const state = await store.load();
  return NextResponse.json({ state, storeKind: store.kind });
}

const PatchBodySchema = z.object({
  language_mode: z.enum(["auto", "english_support", "french_only"]),
});

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = PatchBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const store = await getLearnerStore();
  const state = await store.load();
  state.profile.preferences.language_mode = parsed.data.language_mode;
  await store.save({ profile: state.profile });

  return NextResponse.json({ state, storeKind: store.kind });
}
