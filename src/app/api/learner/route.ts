import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getLearnerStore } from "@/lib/learner";
import { resetToPlacementTest, setStartingLevel } from "@/lib/learner/placement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const store = await getLearnerStore();
  const state = await store.load();
  return NextResponse.json({ state, storeKind: store.kind });
}

const PatchBodySchema = z.union([
  z.object({ language_mode: z.enum(["auto", "english_support", "french_only"]) }),
  z.object({ starting_level: z.number().int().min(1).max(12) }),
  z.object({ placement: z.literal("test") }),
]);

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = PatchBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const store = await getLearnerStore();
  const state = await store.load();

  if ("language_mode" in parsed.data) {
    state.profile.preferences.language_mode = parsed.data.language_mode;
    await store.save({ profile: state.profile });
    return NextResponse.json({ state, storeKind: store.kind });
  }

  if (state.profile.sessions_completed !== 0) {
    return NextResponse.json(
      { error: "Starting level can only be changed before your first session is finished." },
      { status: 409 },
    );
  }

  const next =
    "starting_level" in parsed.data
      ? setStartingLevel(state, parsed.data.starting_level, new Date())
      : resetToPlacementTest(state);

  await store.save({ profile: next.profile, competencies: next.competencies, roadmap: next.roadmap });

  return NextResponse.json({ state: next, storeKind: store.kind });
}
