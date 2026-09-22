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
    <div className="w-full bg-card border border-rule rounded-[13px] p-3.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between font-mono text-[9px] tracking-[.15em] uppercase text-muted focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
      >
        <span>Transcript</span>
        {live ? (
          <span className="inline-flex items-center gap-1.5 text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            <span className="font-mono text-[9px] tracking-[.15em] uppercase">live</span>
          </span>
        ) : (
          <span>{open ? "▲" : "▼"}</span>
        )}
      </button>
      {open && (
        <div>
          <div ref={listRef} className="max-h-64 overflow-y-auto mt-2.5 space-y-2 text-[13px]">
            {shown.length === 0 && partial.length === 0 && (
              <p className="text-muted italic text-[13px]">The conversation will appear here.</p>
            )}
            {shown.map((turn, i) => (
              <div key={i} className="flex gap-2.5">
                <span
                  className={`w-[46px] shrink-0 pt-[3px] font-mono text-[8.5px] tracking-[.1em] uppercase ${
                    turn.role === "user" ? "text-primary" : "text-muted"
                  }`}
                >
                  {turn.role === "user" ? "Vous" : "Tutrice"}
                </span>
                <p
                  className={`m-0 min-w-0 ${turn.role === "user" ? "text-ink" : "text-ink-soft"}`}
                >
                  {turn.text}
                </p>
              </div>
            ))}
            {partial.map((turn, i) => (
              <div key={`partial-${i}`} className="flex gap-2.5">
                <span
                  className={`w-[46px] shrink-0 pt-[3px] font-mono text-[8.5px] tracking-[.1em] uppercase ${
                    turn.role === "user" ? "text-primary" : "text-muted"
                  }`}
                >
                  {turn.role === "user" ? "Vous" : "Tutrice"}
                </span>
                <p className="m-0 min-w-0 text-muted italic">
                  {turn.text}
                  <span className="ml-0.5 inline-block animate-pulse">▍</span>
                </p>
              </div>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitDraft();
            }}
            className="flex items-center gap-2 border-t border-rule-soft mt-2.5 pt-2.5"
          >
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={!canSendText}
              placeholder="Type instead…"
              className="flex-1 rounded-full border border-rule bg-transparent px-3 py-1.5 text-sm outline-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
            />
            <button
              type="submit"
              disabled={!canSendText || !draft.trim()}
              className="rounded-full bg-ink text-paper text-[11.5px] font-medium px-3 py-1.5 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
            >
              Send
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
