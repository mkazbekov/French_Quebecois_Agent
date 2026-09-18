import { NextResponse } from "next/server";
import { getLearnerStore } from "@/lib/learner";
import { applyReviewDelta } from "@/lib/learner/merge";
import { renderSessionRecordMarkdown } from "@/lib/learner/render";
import { SessionEvidenceSchema, type SessionSummary } from "@/lib/learner/schema";
import { hasEnoughForReview, reviewSession } from "@/lib/tutor/review";

export const runtime = "nodejs";

/**
 * POST /api/session/end
 * Body: SessionEvidence.
 * Returns { summary: SessionSummary, persisted: boolean, reason?: string }.
 *
 * temporary evidence → structured review → deterministic merge → learner store
 */
export async function POST(req: Request) {
  const parsed = SessionEvidenceSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid session evidence", issues: parsed.error.issues }, { status: 400 });
  }
  const evidence = parsed.data;
  const now = new Date();
  const minutes =
    Math.round(Math.max(0, (new Date(evidence.ended_at).getTime() - new Date(evidence.started_at).getTime()) / 6_000)) / 10;

  if (!hasEnoughForReview(evidence)) {
    const summary: SessionSummary = {
      session_id: evidence.session_id,
      practiced: [],
      new_vocabulary: [],
      recurring_issues: [],
      next: ["Too short to review. Next time, try to keep talking for a few minutes."],
      minutes,
    };
    return NextResponse.json({ summary, persisted: false, reason: "too_short" });
  }

  const store = await getLearnerStore();
  const before = await store.load();

  // Idempotency: crash recovery may re-submit a session whose save already succeeded.
  if (before.progress.entries.some((e) => e.session_id === evidence.session_id)) {
    const summary: SessionSummary = {
      session_id: evidence.session_id,
      practiced: [],
      new_vocabulary: [],
      recurring_issues: [],
      next: [before.roadmap.next_practice],
      minutes,
    };
    return NextResponse.json({ summary, persisted: true, reason: "already_saved" });
  }

  let delta;
  try {
    delta = await reviewSession(before, evidence);
  } catch (err) {
    console.error("[session/end] review failed", err);
    return NextResponse.json(
      { error: `Session review failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }

  const { state: after, summary } = applyReviewDelta(before, delta, evidence, now);

  try {
    await store.save(after);
    await store.addSessionRecord({
      session_id: evidence.session_id,
      date: now.toISOString(),
      markdown: renderSessionRecordMarkdown(delta, summary, evidence, now),
    });
  } catch (err) {
    console.error("[session/end] persist failed", err);
    return NextResponse.json(
      { summary, persisted: false, error: `Could not save progress: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }

  console.log(
    `[session/end] ${evidence.session_id} reviewed: ${delta.errors.length} errors, ${delta.vocabulary.length} vocab, focus="${after.roadmap.current_focus}" (${store.kind})`,
  );
  return NextResponse.json({ summary, persisted: true });
}
