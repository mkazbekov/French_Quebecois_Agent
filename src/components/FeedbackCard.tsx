"use client";

import { useState } from "react";

type Status = "idle" | "sending" | "delivered" | "fallback" | "error";

export function FeedbackCard() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [includeDetails, setIncludeDetails] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [deliveredWithEmail, setDeliveredWithEmail] = useState(false);

  function reset() {
    setOpen(false);
    setMessage("");
    setEmail("");
    setIncludeDetails(false);
    setStatus("idle");
    setErrorText(null);
  }

  async function submit() {
    if (!message.trim()) return;
    setStatus("sending");
    setErrorText(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, email, include_details: includeDetails }),
      });
      const data = (await res.json().catch(() => null)) as
        | { delivered: true; autoReply: boolean }
        | { delivered: false; mailto: string; contact: string }
        | { error: string }
        | null;

      if (!res.ok || !data || "error" in data) {
        setStatus("error");
        setErrorText((data && "error" in data && data.error) || "Couldn't send feedback. Please try again.");
        return;
      }

      if (data.delivered) {
        setDeliveredWithEmail(data.autoReply);
        setStatus("delivered");
        return;
      }

      // No relay configured, or it failed: open a pre-filled email draft.
      window.location.href = data.mailto;
      setStatus("fallback");
    } catch {
      setStatus("error");
      setErrorText("Couldn't send feedback. Please try again.");
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[11px] text-zinc-400 dark:text-zinc-600 underline decoration-dotted hover:text-zinc-600 dark:hover:text-zinc-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded"
      >
        Send feedback
      </button>
    );
  }

  return (
    <div className="w-full max-w-sm rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 text-left space-y-3">
      {status === "delivered" ? (
        <div className="space-y-2 text-center">
          <p className="text-sm text-zinc-700 dark:text-zinc-200">
            Thanks — this went to Mirzabek.
            {deliveredWithEmail ? ` You'll get a confirmation at ${email.trim()}.` : ""}
          </p>
          <button
            type="button"
            onClick={reset}
            className="text-[11px] text-zinc-400 dark:text-zinc-600 underline decoration-dotted"
          >
            Close
          </button>
        </div>
      ) : status === "fallback" ? (
        <div className="space-y-2 text-center">
          <p className="text-sm text-zinc-700 dark:text-zinc-200">
            Your email app should open with the message ready — just press send.
          </p>
          <button
            type="button"
            onClick={reset}
            className="text-[11px] text-zinc-400 dark:text-zinc-600 underline decoration-dotted"
          >
            Close
          </button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="space-y-3"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-200">Send feedback</h3>
            <button
              type="button"
              onClick={reset}
              className="text-[11px] text-zinc-400 dark:text-zinc-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded"
            >
              Cancel
            </button>
          </div>

          <div className="space-y-1">
            <label htmlFor="feedback-message" className="sr-only">
              What&apos;s working, what isn&apos;t, what you&apos;d like?
            </label>
            <textarea
              id="feedback-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What's working, what isn't, what you'd like?"
              rows={4}
              maxLength={4000}
              className="w-full resize-none rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="feedback-email" className="block text-[11px] text-zinc-500 dark:text-zinc-400">
              Your email (optional — only used to reply)
            </label>
            <input
              id="feedback-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-full border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <label className="flex items-start gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
            <input
              type="checkbox"
              checked={includeDetails}
              onChange={(e) => setIncludeDetails(e.target.checked)}
              className="mt-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            />
            <span title="App version, operating system, and voice provider (gemini/openai) only.">
              Include technical details (app version, system, voice provider)
            </span>
          </label>

          <p className="text-[10px] text-zinc-400 dark:text-zinc-600">
            Nothing else from your session is sent — no transcript, no profile.
          </p>

          {status === "error" && errorText && (
            <p className="text-xs text-red-600 dark:text-red-400">{errorText}</p>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={!message.trim() || status === "sending"}
              className="flex-1 rounded-full bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 py-1.5 text-sm font-medium disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              {status === "sending" ? "Sending…" : "Send"}
            </button>
            <button
              type="button"
              onClick={reset}
              className="rounded-full border border-zinc-300 dark:border-zinc-700 px-3.5 py-1.5 text-sm text-zinc-600 dark:text-zinc-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
