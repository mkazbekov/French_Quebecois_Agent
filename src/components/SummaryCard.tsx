import type { SessionSummary } from "@/lib/learner/schema";

function Section({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{title}</h3>
      <ul className="mt-1 space-y-1 text-sm">
        {items.map((item, i) => (
          <li key={i} className="text-zinc-700 dark:text-zinc-300">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SummaryCard({ summary, onStartAnother }: { summary: SessionSummary; onStartAnother: () => void }) {
  return (
    <div className="w-full max-w-xl mx-auto rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Session complete</h2>
        <p className="text-xs text-zinc-400">{summary.minutes} minute(s)</p>
      </div>
      <Section title="Practiced" items={summary.practiced} />
      <Section title="New vocabulary" items={summary.new_vocabulary} />
      <Section title="Recurring issues" items={summary.recurring_issues} />
      <Section title="Next" items={summary.next} />
      <button
        type="button"
        onClick={onStartAnother}
        className="w-full rounded-full bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 py-2.5 text-sm font-medium"
      >
        Start another
      </button>
    </div>
  );
}
