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
  const active = listening || speaking;
  const error = status === "error";

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative grid h-[122px] w-[122px] place-items-center">
        {active && <span className="absolute inset-6 rounded-full bg-primary/20 animate-breathe" />}
        <span className="absolute inset-0 rounded-full border border-rule" />
        <div
          className={`relative grid h-[82px] w-[82px] place-items-center rounded-full transition-colors ${
            error
              ? "bg-danger text-on-primary"
              : active
                ? "bg-primary-solid text-on-primary"
                : "border-[1.5px] border-rule bg-transparent text-muted"
          }`}
        >
          <MicIcon />
        </div>
      </div>
      <p className="flex items-center gap-1.5 font-display text-[15px] text-ink-soft">
        {active && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
        {STATUS_LABEL[status]}
      </p>
    </div>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8" aria-hidden="true">
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
