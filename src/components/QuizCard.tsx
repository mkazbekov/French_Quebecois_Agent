"use client";

import { useEffect } from "react";
import type { QuizQuestion } from "@/lib/learner/schema";

const LETTERS = ["A", "B", "C", "D"];

export function QuizCard({
  quiz,
  answeredIndex,
  onAnswer,
}: {
  quiz: QuizQuestion;
  answeredIndex: number | null;
  onAnswer: (index: number) => void;
}) {
  const answered = answeredIndex !== null;

  useEffect(() => {
    if (answered) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= quiz.options.length) {
        onAnswer(n - 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [answered, quiz.options.length, onAnswer]);

  return (
    <div className="w-full max-w-xl mx-auto bg-card border border-primary rounded-[13px] p-3.5 space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[9px] tracking-[.15em] uppercase text-primary">Check</span>
        <span className="font-mono text-[9px] tracking-[.15em] uppercase text-muted">Say it or tap it</span>
      </div>
      <h3 className="font-display text-[15px] leading-[1.35] text-ink">{quiz.question}</h3>
      <ol className="list-none m-0 p-0">
        {quiz.options.map((option, i) => {
          const isCorrect = i === quiz.answer_index;
          const isChosen = i === answeredIndex;

          let textClass = "text-ink";
          let markerClass = "border-rule text-muted";
          if (answered) {
            if (isCorrect) {
              textClass = "text-ok font-semibold";
              markerClass = "bg-ok border-ok text-on-primary";
            } else if (isChosen) {
              textClass = "text-alert font-semibold";
              markerClass = "bg-alert border-alert text-on-primary";
            } else {
              textClass = "text-muted";
            }
          }

          return (
            <li key={i}>
              <button
                type="button"
                disabled={answered}
                onClick={() => onAnswer(i)}
                className={`group w-full flex items-center gap-2.5 text-left py-2.5 px-0.5 text-[12.5px] ${textClass} ${
                  i === 0 ? "" : "border-t border-rule-soft"
                } ${
                  !answered ? "hover:text-primary" : ""
                } focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2`}
              >
                <span
                  className={`h-5 w-5 shrink-0 rounded-[4px] border grid place-items-center font-mono text-[9.5px] font-bold ${markerClass} ${
                    !answered ? "group-hover:border-primary group-hover:text-primary" : ""
                  }`}
                >
                  {LETTERS[i] ?? i + 1}
                </span>
                <span>{option}</span>
              </button>
            </li>
          );
        })}
      </ol>
      {!answered && (
        <p className="text-[10px] text-muted italic mt-2">Click, type, or just say your answer.</p>
      )}
      {answered && quiz.explanation && (
        <p className="text-[12px] text-ink-soft mt-2">{quiz.explanation}</p>
      )}
    </div>
  );
}
