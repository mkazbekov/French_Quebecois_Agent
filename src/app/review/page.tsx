import Link from "next/link";
import { getLearnerStore } from "@/lib/learner";
import { COMPETENCY_KEYS } from "@/lib/learner/schema";
import { cefrEquivalent, stageOf } from "@/lib/learner/levels";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const store = await getLearnerStore();
  const state = await store.load();

  return (
    <div className="flex-1 flex flex-col gap-8 py-10 px-4 max-w-2xl mx-auto w-full">
      <div>
        <Link href="/" className="text-xs text-zinc-400 underline decoration-dotted hover:text-zinc-600">
          ← Back
        </Link>
        <h1 className="text-2xl font-semibold mt-2">Review</h1>
      </div>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400 mb-2">Competencies</h2>
        <p className="text-xs text-zinc-400 mb-2">
          Échelle québécoise des niveaux de compétence en français (1–12), with the approximate CEFR equivalent.
        </p>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-zinc-400 border-b border-zinc-200 dark:border-zinc-800">
              <th className="py-1.5 pr-2 font-medium">Competency</th>
              <th className="py-1.5 pr-2 font-medium">Level</th>
              <th className="py-1.5 pr-2 font-medium">Confidence</th>
              <th className="py-1.5 pr-2 font-medium">Evidence</th>
            </tr>
          </thead>
          <tbody>
            {COMPETENCY_KEYS.map((key) => {
              const c = state.competencies[key];
              return (
                <tr key={key} className="border-b border-zinc-100 dark:border-zinc-900">
                  <td className="py-1.5 pr-2">{key.replace("_", " ")}</td>
                  <td className="py-1.5 pr-2">
                    {c.level}
                    <span className="text-zinc-400"> / 12 · {stageOf(c.level)} · ≈ {cefrEquivalent(c.level)}</span>
                  </td>
                  <td className="py-1.5 pr-2">{Math.round(c.confidence * 100)}%</td>
                  <td className="py-1.5 pr-2">{c.evidence_count}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400 mb-2">Recurring errors</h2>
        {state.errors.items.length === 0 ? (
          <p className="text-sm text-zinc-400 italic">None recorded yet.</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-zinc-400 border-b border-zinc-200 dark:border-zinc-800">
                <th className="py-1.5 pr-2 font-medium">ID</th>
                <th className="py-1.5 pr-2 font-medium">Pattern</th>
                <th className="py-1.5 pr-2 font-medium">Observed → Preferred</th>
                <th className="py-1.5 pr-2 font-medium">Freq.</th>
                <th className="py-1.5 pr-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {state.errors.items.map((e) => (
                <tr key={e.id} className="border-b border-zinc-100 dark:border-zinc-900">
                  <td className="py-1.5 pr-2">{e.id}</td>
                  <td className="py-1.5 pr-2">{e.pattern}</td>
                  <td className="py-1.5 pr-2">
                    {e.observed} → {e.preferred}
                  </td>
                  <td className="py-1.5 pr-2">{e.frequency}</td>
                  <td className="py-1.5 pr-2">{e.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400 mb-2">Vocabulary</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <h3 className="text-xs font-medium text-zinc-500 mb-1">Shaky</h3>
            <p className="text-zinc-700 dark:text-zinc-300">
              {state.vocabulary.items
                .filter((v) => v.status === "shaky")
                .map((v) => v.word)
                .join(", ") || "(none)"}
            </p>
          </div>
          <div>
            <h3 className="text-xs font-medium text-zinc-500 mb-1">Target</h3>
            <p className="text-zinc-700 dark:text-zinc-300">
              {state.vocabulary.items
                .filter((v) => v.status === "target")
                .map((v) => v.word)
                .join(", ") || "(none)"}
            </p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400 mb-2">Roadmap</h2>
        <dl className="text-sm space-y-1">
          <div>
            <dt className="inline font-medium text-zinc-500">Current focus: </dt>
            <dd className="inline">{state.roadmap.current_focus}</dd>
          </div>
          <div>
            <dt className="inline font-medium text-zinc-500">Reason: </dt>
            <dd className="inline">{state.roadmap.reason}</dd>
          </div>
          <div>
            <dt className="inline font-medium text-zinc-500">Next practice: </dt>
            <dd className="inline">{state.roadmap.next_practice}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
