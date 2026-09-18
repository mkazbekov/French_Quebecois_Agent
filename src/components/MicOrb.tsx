import type { TutorStatus } from "@/hooks/useTutorSession";

const STATUS_LABEL: Record<TutorStatus, string> = {
  idle: "Ready",
  requesting_mic: "Requesting microphone…",
  connecting: "Connecting…",
  listening: "Listening…",
  speaking: "Speaking…",
  ending: "Saving your progress…",
  done: "Session complete",
  error: "Connection lost",
};

export function MicOrb({ status }: { status: TutorStatus }) {
  const listening = status === "listening";
  const speaking = status === "speaking";
  const busy = status === "connecting" || status === "requesting_mic" || status === "ending";

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative flex items-center justify-center h-36 w-36">
        {listening && (
          <span className="absolute inset-0 rounded-full bg-emerald-400/30 animate-ping" />
        )}
        {speaking && (
          <span className="absolute inset-0 rounded-full bg-sky-400/40 animate-pulse" />
        )}
        {busy && (
          <span className="absolute inset-0 rounded-full border-2 border-zinc-300 border-t-zinc-500 animate-spin dark:border-zinc-700 dark:border-t-zinc-300" />
        )}
        <div
          className={`relative h-24 w-24 rounded-full flex items-center justify-center shadow-lg transition-colors ${
            speaking
              ? "bg-sky-500"
              : listening
                ? "bg-emerald-500"
                : status === "error"
                  ? "bg-red-500"
                  : "bg-zinc-400 dark:bg-zinc-600"
          }`}
        >
          <MicIcon />
        </div>
      </div>
      <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">{STATUS_LABEL[status]}</p>
    </div>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10 text-white" aria-hidden="true">
      <path
        d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M19 11a7 7 0 0 1-14 0M12 18v3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
