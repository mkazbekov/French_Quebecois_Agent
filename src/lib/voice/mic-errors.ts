/**
 * Turns a getUserMedia failure into a clear, actionable message for the learner.
 * Pure and side-effect free so it can be unit tested without a real browser.
 */

export interface MicErrorLocation {
  /** Whether navigator.mediaDevices exists (false on an insecure origin, e.g. a LAN IP). */
  hasMediaDevices: boolean;
  /** window.location.port, so the message points at the right address. */
  port: string;
}

export function micErrorMessage(err: unknown, location: MicErrorLocation): string {
  if (!location.hasMediaDevices) {
    const port = location.port || "3000";
    return `This page can only use the microphone at http://localhost:${port} — open that address instead.`;
  }

  const name = errorName(err);

  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "The browser blocked the microphone. Click the icon at the left of the address bar (a lock or a microphone with a red cross), set Microphone to Allow, then press Retry. On a Mac, also check System Settings → Privacy & Security → Microphone and turn on your browser.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No microphone was found. Plug in a headset or microphone (or check it is switched on), then press Retry.";
    case "NotReadableError":
    case "AbortError":
      return "Your microphone is being used by another app (Zoom, Teams, …) or was blocked by the system. Close that app, then press Retry.";
    default:
      return `Could not access the microphone: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function errorName(err: unknown): string | undefined {
  if (err && typeof err === "object" && "name" in err) {
    const name = (err as { name?: unknown }).name;
    return typeof name === "string" ? name : undefined;
  }
  return undefined;
}
