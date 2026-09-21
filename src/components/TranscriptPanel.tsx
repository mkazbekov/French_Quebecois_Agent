"use client";

import { useEffect, useRef, useState } from "react";
import type { TranscriptTurn } from "@/lib/learner/schema";

const MAX_TURNS_SHOWN = 40;

export function TranscriptPanel({
  transcript,
  partial = [],
  live = false,
  canSendText,
  onSendText,
}: {
  transcript: TranscriptTurn[];
  partial?: TranscriptTurn[];
  live?: boolean;
  canSendText: boolean;
  onSendText: (text: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [transcript, partial, open]);

  const shown = transcript.slice(-MAX_TURNS_SHOWN);

  function submitDraft() {
    const text = draft.trim();
    if (!text) return;
    onSendText(text);
    setDraft("");
  }

  return (
    <div className="w-full max-w-xl mx-auto rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium bg-zinc-100 dark:bg-zinc-900"
      >
        <span className="flex items-center gap-2">
          Transcript
          {live && (
            <span className="inline-flex items-center gap-1 text-[10px] font-normal text-emerald-600 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              live
            </span>
          )}
        </span>
        <span className="text-zinc-400">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div>
          <div ref={listRef} className="max-h-64 overflow-y-auto px-4 py-3 space-y-2 text-sm">
            {shown.length === 0 && partial.length === 0 && (
              <p className="text-zinc-400 dark:text-zinc-600 italic">The conversation will appear here.</p>
            )}
            {shown.map((turn, i) => (
              <div key={i} className={turn.role === "user" ? "text-right" : "text-left"}>
                <span
                  className={`inline-block max-w-[85%] rounded-2xl px-3 py-1.5 ${
                    turn.role === "user"
                      ? "bg-emerald-500 text-white"
                      : "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
                  }`}
                >
                  {turn.text}
                </span>
              </div>
            ))}
            {partial.map((turn, i) => (
              <div key={`partial-${i}`} className={turn.role === "user" ? "text-right" : "text-left"}>
                <span
                  className={`inline-block max-w-[85%] rounded-2xl px-3 py-1.5 opacity-60 ${
                    turn.role === "user"
                      ? "bg-emerald-500 text-white"
                      : "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
                  }`}
                >
                  {turn.text}
                  <span className="ml-0.5 inline-block animate-pulse">▍</span>
                </span>
              </div>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitDraft();
            }}
            className="flex items-center gap-2 border-t border-zinc-200 dark:border-zinc-800 px-3 py-2"
          >
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={!canSendText}
              placeholder="Type instead…"
              className="flex-1 rounded-full border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-1.5 text-sm outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!canSendText || !draft.trim()}
              className="rounded-full bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 px-3.5 py-1.5 text-sm font-medium disabled:opacity-40"
            >
              Send
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
