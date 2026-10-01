"use client";

import { useEffect, useRef, useState } from "react";
import type { TranscriptTurn } from "@/lib/learner/schema";

const MAX_TURNS_SHOWN = 40;
/** Within this many px of the bottom counts as "reading the latest turn". */
const NEAR_BOTTOM_PX = 48;

export function TranscriptPanel({
  transcript,
  partial = [],
  live = false,
  canSendText,
  onSendText,
  fill = false,
}: {
  transcript: TranscriptTurn[];
  partial?: TranscriptTurn[];
  live?: boolean;
  canSendText: boolean;
  onSendText: (text: string) => void;
  /** In-call layout: always open, fills the height its parent gives it, input pinned at the bottom. */
  fill?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const open = fill || !collapsed;
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);

  const nearBottomRef = useRef(true);
  const lastCountRef = useRef(transcript.length);

  // Follow the conversation only while the learner is at the bottom, so they can
  // scroll up to re-read; their own new turn always jumps back down.
  useEffect(() => {
    const list = listRef.current;
    const grew = transcript.length > lastCountRef.current;
    lastCountRef.current = transcript.length;
    if (!open || !list) return;
    if (nearBottomRef.current || (grew && transcript[transcript.length - 1]?.role === "user")) {
      list.scrollTop = list.scrollHeight;
      nearBottomRef.current = true;
    }
  }, [transcript, partial, open]);

  function onListScroll() {
    const list = listRef.current;
    if (list) nearBottomRef.current = list.scrollHeight - list.scrollTop - list.clientHeight <= NEAR_BOTTOM_PX;
  }

  const shown = transcript.slice(-MAX_TURNS_SHOWN);

  function submitDraft() {
    const text = draft.trim();
    if (!text) return;
    onSendText(text);
    setDraft("");
  }

  return (
    <div className={`w-full bg-card border border-rule rounded-[13px] p-3.5 ${fill ? "flex min-h-0 flex-1 flex-col" : ""}`}>
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        disabled={fill}
        className="w-full flex items-center justify-between font-mono text-[9px] tracking-[.15em] uppercase text-muted focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
      >
        <span>Transcript</span>
        {live ? (
          <span className="inline-flex items-center gap-1.5 text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            <span className="font-mono text-[9px] tracking-[.15em] uppercase">live</span>
          </span>
        ) : (
          !fill && <span>{open ? "▲" : "▼"}</span>
        )}
      </button>
      {open && (
        <div className={fill ? "flex min-h-0 flex-1 flex-col" : ""}>
          <div
            ref={listRef}
            onScroll={onListScroll}
            className={`mt-2.5 space-y-2 overflow-y-auto text-sm sm:text-[13px] ${fill ? "min-h-0 flex-1" : "max-h-64"}`}
          >
            {shown.length === 0 && partial.length === 0 && (
              <p className="text-muted italic text-[13px]">The conversation will appear here.</p>
            )}
            {shown.map((turn, i) => (
              <div key={i} className="flex gap-2.5">
                <span
                  className={`w-10 shrink-0 sm:w-[46px] pt-[3px] font-mono text-[8.5px] tracking-[.1em] uppercase ${
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
                  className={`w-10 shrink-0 sm:w-[46px] pt-[3px] font-mono text-[8.5px] tracking-[.1em] uppercase ${
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
            className="flex items-center gap-2 border-t border-rule-soft mt-2.5 pt-2.5 shrink-0"
          >
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={!canSendText}
              placeholder="Type instead…"
              className="flex-1 rounded-full border border-rule bg-transparent px-3 py-1.5 text-base outline-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
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
