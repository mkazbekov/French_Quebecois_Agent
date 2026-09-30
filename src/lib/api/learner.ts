import { z } from "zod";
import { clearLearningHistory, completeOnboarding, normalizeName, retakePlacement, setStartingLevel } from "@/lib/learner/placement";
import { LEARNER_DOCUMENTS, type LearnerState } from "@/lib/learner/schema";
import { resolveMode } from "@/lib/tutor/instructions";
import { fail, ok, type ApiDeps, type ApiResult } from "./types";

/**
 * Shared response shape. `plannedMode` is what an "auto" call would pick
 * right now — read-only and deterministic — so the mode picker can tell the
 * learner what "Tutor decides" is actually going to do before they press Start.
 */
function payload(state: LearnerState, storeKind: string) {
  return { state, storeKind, plannedMode: resolveMode("auto", state) };
}

export async function getLearner({ store }: Pick<ApiDeps, "store">): Promise<ApiResult> {
  const state = await store.load();
  return ok(payload(state, store.kind));
}

/**
 * Wipes the learner's stored profile and history; the next GET returns fresh
 * defaults (back to onboarding). scope "history" instead clears only what the
 * tutor has learned while keeping name, preferences and onboarded_at (see
 * clearLearningHistory). Either way store.reset() first, since it also drops
 * session records / the Letta agent, then re-save what should survive.
 */
export async function deleteLearner(scope: string | null, { store }: Pick<ApiDeps, "store">): Promise<ApiResult> {
  if (scope === "history") {
    const state = await store.load();
    const cleared = clearLearningHistory(state);
    await store.reset();
    await store.save(Object.fromEntries(LEARNER_DOCUMENTS.map((doc) => [doc, cleared[doc]])) as Pick<
      LearnerState,
      (typeof LEARNER_DOCUMENTS)[number]
    >);
    const reloaded = await store.load();
    return ok(payload(reloaded, store.kind));
  }
  await store.reset();
  const state = await store.load();
  return ok(payload(state, store.kind));
}

const LevelOrTestSchema = z.union([z.number().int().min(1).max(12), z.literal("test")]);

const PatchBodySchema = z.union([
  z.object({ language_mode: z.enum(["auto", "english_support", "french_only"]) }),
  z.object({ starting_level: z.number().int().min(1).max(12) }),
  z.object({ placement: z.literal("test") }),
  z.object({ name: z.string() }),
  z.object({ onboarding: z.object({ name: z.string(), level: LevelOrTestSchema }) }),
]);

export async function patchLearner(rawBody: unknown, { store }: Pick<ApiDeps, "store">): Promise<ApiResult> {
  const parsed = PatchBodySchema.safeParse(rawBody);
  if (!parsed.success) return fail(400, "Invalid body");

  const state = await store.load();

  if ("language_mode" in parsed.data) {
    state.profile.preferences.language_mode = parsed.data.language_mode;
    await store.save({ profile: state.profile });
    return ok(payload(state, store.kind));
  }

  if ("name" in parsed.data) {
    const name = normalizeName(parsed.data.name);
    if (!name) return fail(400, "Name can't be empty.");
    state.profile.name = name;
    await store.save({ profile: state.profile });
    return ok(payload(state, store.kind));
  }

  if ("onboarding" in parsed.data) {
    const name = normalizeName(parsed.data.onboarding.name);
    if (!name) return fail(400, "Name can't be empty.");
    const next = completeOnboarding(state, { name, level: parsed.data.onboarding.level }, new Date());
    await store.save({ profile: next.profile, competencies: next.competencies, roadmap: next.roadmap });
    return ok(payload(next, store.kind));
  }

  const next =
    "starting_level" in parsed.data
      ? setStartingLevel(state, parsed.data.starting_level, new Date())
      : retakePlacement(state);

  await store.save({ profile: next.profile, competencies: next.competencies, roadmap: next.roadmap });
  return ok(payload(next, store.kind));
}
