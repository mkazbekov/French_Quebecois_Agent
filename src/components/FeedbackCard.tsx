"use client";

import { useEffect, useState } from "react";
import {
  FeedbackInputSchema,
  buildFeedbackBody,
  buildGmailComposeUrl,
  buildMailtoUrl,
  type FeedbackDetails,
} from "@/lib/feedback";

type Status = "idle" | "sent" | "error";

const FALLBACK_CONTACT = "mjkazbekov@gmail.com";
const UNKNOWN_DETAILS: FeedbackDetails = { version: "unknown", platform: "unknown", provider: "unknown" };

export function FeedbackCard() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [includeDetails, setIncludeDetails] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [contact, setContact] = useState(FALLBACK_CONTACT);
  const [details, setDetails] = useState<FeedbackDetails | null>(null);
  const [draftBody, setDraftBody] = useState("");
  const [copied, setCopied] = useState(false);

  // Only asks the server who the mail goes to and (for the opt-in checkbox)
  // the version/platform/provider. Nothing is ever posted back.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void fetch("/api/feedback")
      .then((res) => res.json())
      .then((data: { contact?: string; details?: FeedbackDetails }) => {
        if (cancelled) return;
        if (data?.contact) setContact(data.contact);
        if (data?.details) setDetails(data.details);
      })
      .catch(() => {
        // Keep the default address; the form still works offline.
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  function reset() {
    setOpen(false);
    setMessage("");
    setIncludeDetails(false);
    setStatus("idle");
    setErrorText(null);
    setDraftBody("");
    setCopied(false);
  }

  function submit() {
    const parsed = FeedbackInputSchema.safeParse({ message, include_details: includeDetails });
    if (!parsed.success) {
      setStatus("error");
      setErrorText(parsed.error.issues[0]?.message ?? "Please write a message before sending.");
      return;
    }

    const body = buildFeedbackBody(parsed.data, details ?? UNKNOWN_DETAILS);
    setDraftBody(body);
    setErrorText(null);
    setStatus("sent");
    // A mailto: hand-off, not a navigation — the tutor page stays where it is.
    window.location.href = buildMailtoUrl({ to: contact, body });
  }

  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(`To: ${contact}\n\n${draftBody}`);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[11px] text-muted underline decoration-dotted hover:text-ink-soft focus:outline-none focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 rounded"
      >
        Send feedback
      </button>
    );
  }

  return (
    <div className="w-full max-w-sm bg-card border border-rule rounded-[13px] p-3.5 text-left space-y-3">
      {status === "sent" ? (
        <div className="space-y-3 text-center">
          <p className="text-sm text-ink-soft">
            Your email app should have opened with the message ready for{" "}
            <span className="font-medium text-ink">{contact}</span> — just press send.
          </p>
          <p className="text-[11px] text-muted">Nothing opened? Use one of these instead:</p>
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => void copyDraft()}
              className="rounded-[8px] border border-rule px-3 py-1 text-xs text-ink-soft focus:outline-none focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
            >
              {copied ? "Copied" : "Copy message"}
            </button>
            <a
              href={buildGmailComposeUrl({ to: contact, body: draftBody })}
              target="_blank"
              rel="noreferrer"
              className="rounded-[8px] border border-rule px-3 py-1 text-xs text-ink-soft focus:outline-none focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
            >
              Open in Gmail
            </a>
          </div>
          <button
            type="button"
            onClick={reset}
            className="text-[11px] text-muted underline decoration-dotted focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
          >
            Close
          </button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="space-y-3"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-mono text-[9px] tracking-[.15em] uppercase text-muted">Send feedback</h3>
            <button
              type="button"
              onClick={reset}
              className="text-[11px] text-muted focus:outline-none focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 rounded"
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
              className="w-full resize-none rounded-[8px] border border-rule bg-transparent px-3 py-2 text-sm text-ink outline-none focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
            />
          </div>

          <label className="flex items-start gap-2 text-[11px] text-muted">
            <input
              type="checkbox"
              checked={includeDetails}
              onChange={(e) => setIncludeDetails(e.target.checked)}
              className="mt-0.5 focus:outline-none focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
            />
            <span title="App version, operating system, and voice provider (gemini/openai) only.">
              Include technical details (app version, system, voice provider)
            </span>
          </label>

          <p className="text-[10px] text-muted">
            This opens an email to {contact} that you send yourself — the app sends nothing. Nothing else from your
            session goes with it: no transcript, no profile.
          </p>

          {status === "error" && errorText && <p className="text-xs text-alert">{errorText}</p>}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={!message.trim()}
              className="flex-1 rounded-full bg-primary-solid text-on-primary py-1.5 text-sm font-medium disabled:opacity-40 focus:outline-none focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
            >
              Write the email
            </button>
            <button
              type="button"
              onClick={reset}
              className="rounded-[8px] border border-rule px-3.5 py-1.5 text-sm text-ink-soft focus:outline-none focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
