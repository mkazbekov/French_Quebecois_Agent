import { Preferences } from "@capacitor/preferences";
import { isGeminiKeyRejection } from "@/lib/tutor/gemini-errors";

/** Where the phone keeps the learner's own Gemini API key. Never in the bundle, never logged. */
export const GEMINI_KEY_PREF = "tutor.gemini_api_key";

export async function readStoredGeminiKey(): Promise<string | null> {
  try {
    const { value } = await Preferences.get({ key: GEMINI_KEY_PREF });
    return value && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

export async function storeGeminiKey(key: string): Promise<void> {
  await Preferences.set({ key: GEMINI_KEY_PREF, value: key.trim() });
}

export async function clearGeminiKey(): Promise<void> {
  await Preferences.remove({ key: GEMINI_KEY_PREF });
}

export type KeyCheck = { ok: true } | { ok: false; message: string };

/**
 * Asks Google whether the key is accepted (a one-model list call, no quota used).
 * Reuses isGeminiKeyRejection so the verdict matches the rest of the app.
 */
export async function validateGeminiKey(key: string, fetchImpl: typeof fetch = fetch): Promise<KeyCheck> {
  let res: Response;
  try {
    res = await fetchImpl("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", {
      headers: { "x-goog-api-key": key.trim() },
    });
  } catch {
    return { ok: false, message: "Couldn't reach Google. Check your internet connection and try again." };
  }
  if (res.ok) return { ok: true };
  const bodyText = await res.text().catch(() => "");
  if (isGeminiKeyRejection(res.status, bodyText)) {
    return { ok: false, message: "Google rejected that key. It may be mistyped, deleted, or restricted — copy it again from AI Studio." };
  }
  if (res.status === 429) return { ok: true }; // a rate limit still means the key itself is fine
  return { ok: false, message: `Google answered ${res.status}. Try again in a moment.` };
}
