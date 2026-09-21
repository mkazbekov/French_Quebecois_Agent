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
    <div className="w-full max-w-xl mx-auto rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 space-y-3">
      <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{quiz.question}</h3>
      <div className="space-y-2">
        {quiz.options.map((option, i) => {
          const isCorrect = i === quiz.answer_index;
          const isChosen = i === answeredIndex;
          let className =
            "w-full flex items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors border-zinc-300 dark:border-zinc-700";
          if (answered) {
            if (isCorrect) {
              className =
                "w-full flex items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300";
            } else if (isChosen) {
              className =
                "w-full flex items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm border-red-500 bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300";
            } else {
              className =
                "w-full flex items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-500";
            }
          } else {
            className +=
              " hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-zinc-700 dark:text-zinc-200";
          }
          return (
            <button
              key={i}
              type="button"
              disabled={answered}
              onClick={() => onAnswer(i)}
              className={className}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-[11px] font-semibold">
                {LETTERS[i] ?? i + 1}
              </span>
              <span>{option}</span>
            </button>
          );
        })}
      </div>
      {!answered && (
        <p className="text-[11px] text-zinc-400 dark:text-zinc-600">Click, type, or just say your answer.</p>
      )}
      {answered && quiz.explanation && (
        <p className="text-xs text-zinc-600 dark:text-zinc-300">{quiz.explanation}</p>
      )}
    </div>
  );
}
