import type { SessionSummary } from "@/lib/learner/schema";

function Section({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h3 className="font-mono text-[9px] tracking-[.15em] uppercase text-muted">{title}</h3>
      <div className="mt-1">
        {items.map((item, i) => (
          <div
            key={i}
            className={`py-1.5 text-[13px] text-ink-soft ${i === 0 ? "" : "border-t border-rule-soft"}`}
          >
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SummaryCard({ summary, onStartAnother }: { summary: SessionSummary; onStartAnother: () => void }) {
  return (
    <div className="w-full max-w-xl mx-auto bg-card border border-rule rounded-[13px] p-3.5 space-y-4">
      <div>
        <h2 className="font-display text-[19px] font-semibold text-ink">Session complete</h2>
        <p className="text-[11px] text-muted">{summary.minutes} minute(s)</p>
      </div>
      <Section title="Practiced" items={summary.practiced} />
      <Section title="New vocabulary" items={summary.new_vocabulary} />
      <Section title="Recurring issues" items={summary.recurring_issues} />
      <Section title="Next" items={summary.next} />
      <button
        type="button"
        onClick={onStartAnother}
        className="w-full rounded-full bg-primary-solid text-on-primary py-3 text-[14.5px] font-semibold focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
      >
        Start another
      </button>
    </div>
  );
}
