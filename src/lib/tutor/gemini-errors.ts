/**
 * Classifies a failed Gemini REST response so callers can tell "this API key
 * is bad" apart from "this particular request was bad" (wrong model, bad
 * schema, malformed body, ...). Both come back as HTTP 400 from Google, so
 * the status code alone isn't enough — 400 only means "bad key" when the
 * body actually blames the key (API_KEY_INVALID / "API key not valid" /
 * a details[].reason containing API_KEY). 401 and 403 always mean a bad key.
 *
 * Used by both src/app/api/realtime/session/route.ts (auth_tokens) and
 * src/lib/tutor/review.ts (generateContent), and mirrored in plain JS in
 * scripts/gemini-key.mjs (verifyGeminiKey) for the launcher/setup scripts,
 * which can't import from src/.
 */

interface GeminiErrorBody {
  error?: {
    message?: string;
    status?: string;
    details?: Array<{ reason?: string; [key: string]: unknown }>;
  };
}

const KEY_REJECTION_MARKERS = ["API_KEY_INVALID", "API key not valid"];

export function isGeminiKeyRejection(status: number, bodyText: string): boolean {
  if (status === 401 || status === 403) return true;
  if (status !== 400) return false;

  if (KEY_REJECTION_MARKERS.some((marker) => bodyText.includes(marker))) return true;

  try {
    const body = JSON.parse(bodyText) as GeminiErrorBody;
    const reasons = body.error?.details?.map((d) => d.reason ?? "") ?? [];
    if (reasons.some((r) => r.includes("API_KEY"))) return true;
  } catch {
    // Not JSON (or unexpected shape) — the marker check above already covered it.
  }

  return false;
}

/** Short "(Google said: 400 API_KEY_INVALID)"-style suffix for debugging. Never includes the key. */
export function describeGeminiError(status: number, bodyText: string): string {
  let reason = "";
  try {
    const body = JSON.parse(bodyText) as GeminiErrorBody;
    reason = body.error?.status || body.error?.message || "";
  } catch {
    reason = bodyText.slice(0, 120);
  }
  return `(Google said: ${status}${reason ? ` ${reason}` : ""})`;
}
