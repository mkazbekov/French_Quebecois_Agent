import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getLearnerStore } from "@/lib/learner";
import { completeOnboarding, normalizeName, retakePlacement, setStartingLevel } from "@/lib/learner/placement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const store = await getLearnerStore();
  const state = await store.load();
  return NextResponse.json({ state, storeKind: store.kind });
}

const LevelOrTestSchema = z.union([z.number().int().min(1).max(12), z.literal("test")]);

const PatchBodySchema = z.union([
  z.object({ language_mode: z.enum(["auto", "english_support", "french_only"]) }),
  z.object({ starting_level: z.number().int().min(1).max(12) }),
  z.object({ placement: z.literal("test") }),
  z.object({ name: z.string() }),
  z.object({ onboarding: z.object({ name: z.string(), level: LevelOrTestSchema }) }),
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

  if ("name" in parsed.data) {
    const name = normalizeName(parsed.data.name);
    if (!name) return NextResponse.json({ error: "Name can't be empty." }, { status: 400 });
    state.profile.name = name;
    await store.save({ profile: state.profile });
    return NextResponse.json({ state, storeKind: store.kind });
  }

  if ("onboarding" in parsed.data) {
    const name = normalizeName(parsed.data.onboarding.name);
    if (!name) return NextResponse.json({ error: "Name can't be empty." }, { status: 400 });
    const next = completeOnboarding(state, { name, level: parsed.data.onboarding.level }, new Date());
    await store.save({ profile: next.profile, competencies: next.competencies, roadmap: next.roadmap });
    return NextResponse.json({ state: next, storeKind: store.kind });
  }

  const next =
    "starting_level" in parsed.data
      ? setStartingLevel(state, parsed.data.starting_level, new Date())
      : retakePlacement(state);

  await store.save({ profile: next.profile, competencies: next.competencies, roadmap: next.roadmap });

  return NextResponse.json({ state: next, storeKind: store.kind });
}
