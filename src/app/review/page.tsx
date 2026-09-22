import Link from "next/link";
import { getLearnerStore } from "@/lib/learner";
import { COMPETENCY_KEYS } from "@/lib/learner/schema";
import { LEVELS, cefrEquivalent, stageOf } from "@/lib/learner/levels";
import { findUnit, levelProgress, statusOf, unitsForLevel } from "@/lib/learner/syllabus";
import { dueItems } from "@/lib/learner/spacing";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const store = await getLearnerStore();
  const state = await store.load();

  return (
    <div className="flex-1 flex flex-col gap-8 py-10 px-4 max-w-2xl mx-auto w-full">
      <div>
        <Link href="/" className="text-[11.5px] text-muted hover:text-ink border-b border-dotted border-rule focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2">
          ← Back
        </Link>
        <h1 className="font-display text-[28px] font-semibold mt-2 text-ink">Review</h1>
      </div>

      <section>
        <h2 className="font-mono text-[9px] tracking-[.15em] uppercase text-muted mb-2">Competencies</h2>
        <p className="text-xs text-muted mb-2">
          Échelle québécoise des niveaux de compétence en français (1–12), with the approximate CEFR equivalent.
        </p>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-muted border-b border-rule">
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
                <tr key={key} className="border-b border-rule-soft">
                  <td className="py-1.5 pr-2 text-ink-soft">{key.replace("_", " ")}</td>
                  <td className="py-1.5 pr-2 text-ink tabular-nums">
                    {c.level}
                    <span className="text-muted"> / 12 · {stageOf(c.level)} · ≈ {cefrEquivalent(c.level)}</span>
                  </td>
                  <td className="py-1.5 pr-2 text-ink-soft tabular-nums">{Math.round(c.confidence * 100)}%</td>
                  <td className="py-1.5 pr-2 text-ink-soft tabular-nums">{c.evidence_count}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="font-mono text-[9px] tracking-[.15em] uppercase text-muted mb-2">Recurring errors</h2>
        {state.errors.items.length === 0 ? (
          <p className="text-[13px] text-muted italic">None recorded yet.</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-muted border-b border-rule">
                <th className="py-1.5 pr-2 font-medium">ID</th>
                <th className="py-1.5 pr-2 font-medium">Pattern</th>
                <th className="py-1.5 pr-2 font-medium">Observed → Preferred</th>
                <th className="py-1.5 pr-2 font-medium">Freq.</th>
                <th className="py-1.5 pr-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {state.errors.items.map((e) => (
                <tr key={e.id} className="border-b border-rule-soft">
                  <td className="py-1.5 pr-2 text-ink-soft">{e.id}</td>
                  <td className="py-1.5 pr-2 text-ink">{e.pattern}</td>
                  <td className="py-1.5 pr-2 text-ink-soft">
                    {e.observed} → {e.preferred}
                  </td>
                  <td className="py-1.5 pr-2 text-ink-soft tabular-nums">{e.frequency}</td>
                  <td className="py-1.5 pr-2 text-ink-soft">{e.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2 className="font-mono text-[9px] tracking-[.15em] uppercase text-muted mb-2">Vocabulary</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <h3 className="text-xs font-medium text-muted mb-1">Shaky</h3>
            <p className="text-ink-soft">
              {state.vocabulary.items
                .filter((v) => v.status === "shaky")
                .map((v) => v.word)
                .join(", ") || "(none)"}
            </p>
          </div>
          <div>
            <h3 className="text-xs font-medium text-muted mb-1">Target</h3>
            <p className="text-ink-soft">
              {state.vocabulary.items
                .filter((v) => v.status === "target")
                .map((v) => v.word)
                .join(", ") || "(none)"}
            </p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="font-mono text-[9px] tracking-[.15em] uppercase text-muted mb-2">Due for review</h2>
        {(() => {
          const due = dueItems(state, new Date());
          const empty = !due.errors.length && !due.units.length && !due.vocabulary.length;
          if (empty) return <p className="text-[13px] text-muted italic">Nothing due. Spaced review dates are set after each call.</p>;
          return (
            <ul className="text-sm space-y-1">
              {due.errors.map((e) => (
                <li key={e.id} className="text-ink-soft">
                  <span className="font-mono text-xs text-muted">{e.id}</span> {e.pattern}
                  <span className="text-muted"> · {e.status}{e.unit_id ? ` · fix: ${e.unit_id}` : ""}</span>
                </li>
              ))}
              {due.units.map(({ unit }) => (
                <li key={unit.id} className="text-ink-soft">
                  <span className="font-mono text-xs text-muted">{unit.id}</span> {unit.title}
                  <span className="text-muted"> · finished unit, check it still holds</span>
                </li>
              ))}
              {due.vocabulary.length > 0 && (
                <li className="text-ink-soft">
                  <span className="text-muted">Words: </span>
                  {due.vocabulary.map((v) => v.word).join(", ")}
                </li>
              )}
            </ul>
          );
        })()}
      </section>

      <section>
        <h2 className="font-mono text-[9px] tracking-[.15em] uppercase text-muted mb-2">Program</h2>
        {(() => {
          const level = state.competencies.oral_production.level;
          const current = state.roadmap.current_unit ? findUnit(state.roadmap.current_unit) : undefined;
          const shown = new Set([level, ...(current ? [current.level] : [])]);
          return (
            <div className="space-y-3 text-sm">
              <p className="text-ink-soft">
                <span className="font-medium text-muted">Current unit: </span>
                {current ? `${current.id} · ${current.title}` : "not started (placement first)"}
              </p>
              <ul className="space-y-1">
                {LEVELS.map((l) => {
                  const { done, total } = levelProgress(l, state.roadmap.units);
                  const pct = total ? Math.round((100 * done) / total) : 0;
                  return (
                    <li key={l} className="flex items-center gap-2">
                      <span className={`w-28 shrink-0 ${l === level ? "font-medium text-ink" : "text-muted"}`}>
                        niveau {l} <span className="text-muted">≈ {cefrEquivalent(l)}</span>
                      </span>
                      <span className="flex-1 h-2 rounded bg-rule-soft overflow-hidden">
                        <span className="block h-full bg-primary-solid" style={{ width: `${pct}%` }} />
                      </span>
                      <span className="w-12 text-right text-muted tabular-nums">
                        {done}/{total}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {[...shown].sort((a, b) => a - b).map((l) => (
                <div key={l}>
                  <p className="text-xs font-medium text-muted mt-2 mb-1">Units at niveau {l}</p>
                  <ul className="space-y-0.5">
                    {unitsForLevel(l).map((u) => {
                      const st = statusOf(state.roadmap.units, u.id);
                      const isCurrent = u.id === state.roadmap.current_unit;
                      return (
                        <li key={u.id} className={`flex gap-2 ${st === "done" ? "text-muted line-through" : isCurrent ? "font-medium text-ink" : "text-ink-soft"}`}>
                          <span className="w-16 shrink-0 font-mono text-xs text-muted pt-0.5">{u.id}</span>
                          <span>
                            {u.title}
                            {isCurrent ? " ← now" : st === "in_progress" ? " (in progress)" : ""}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          );
        })()}
      </section>

      <section>
        <h2 className="font-mono text-[9px] tracking-[.15em] uppercase text-muted mb-2">Roadmap</h2>
        <dl className="text-sm space-y-1">
          <div>
            <dt className="inline font-medium text-muted">Current focus: </dt>
            <dd className="inline text-ink-soft">{state.roadmap.current_focus}</dd>
          </div>
          <div>
            <dt className="inline font-medium text-muted">Reason: </dt>
            <dd className="inline text-ink-soft">{state.roadmap.reason}</dd>
          </div>
          <div>
            <dt className="inline font-medium text-muted">Next practice: </dt>
            <dd className="inline text-ink-soft">{state.roadmap.next_practice}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
