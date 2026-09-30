"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { installLocalApi } from "@/lib/device/local-api";
import { readStoredGeminiKey, storeGeminiKey, validateGeminiKey } from "@/lib/device/api-key";

/** True only in the Android (Capacitor) build; a constant, so the desktop bundle drops the rest. */
export const IS_ANDROID_APP = process.env.NEXT_PUBLIC_TUTOR_TARGET === "android";

// Must run while this module is evaluated — before any component effect (the page
// fetches /api/learner in its first effect) — so the on-device API is already in
// place. On desktop this is a no-op.
if (IS_ANDROID_APP && typeof window !== "undefined") {
  installLocalApi();
}

const CHANGE_KEY_EVENT = "tutor:change-api-key";

type Gate = "checking" | "needs-key" | "ready";

/**
 * Android only: wraps the app. Until a Gemini key is saved on the phone it shows a
 * one-time full-screen card (paste key → validate with Google → save), then the app.
 * "Change API key" (ChangeApiKeyButton) reopens the same card over the running app.
 * The key lives in Capacitor Preferences and is never logged.
 */
export default function DeviceRuntime({ children }: { children: ReactNode }) {
  const [gate, setGate] = useState<Gate>("checking");
  const [changing, setChanging] = useState(false);

  useEffect(() => {
    if (!IS_ANDROID_APP) return;
    let cancelled = false;
    readStoredGeminiKey().then((key) => {
      if (!cancelled) setGate(key ? "ready" : "needs-key");
    });
    const onChange = () => setChanging(true);
    window.addEventListener(CHANGE_KEY_EVENT, onChange);
    return () => {
      cancelled = true;
      window.removeEventListener(CHANGE_KEY_EVENT, onChange);
    };
  }, []);

  if (!IS_ANDROID_APP) return <>{children}</>;
  if (gate === "checking") return null;
  if (gate === "needs-key") return <KeyCard onSaved={() => setGate("ready")} />;

  return (
    <>
      {children}
      {changing && (
        <KeyCard
          overlay
          onSaved={() => setChanging(false)}
          onCancel={() => setChanging(false)}
        />
      )}
    </>
  );
}

/** Small footer action, rendered only in the Android app. */
export function ChangeApiKeyButton() {
  if (!IS_ANDROID_APP) return null;
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(CHANGE_KEY_EVENT))}
      className="text-[11px] text-muted hover:text-ink border-b border-dotted border-rule focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
    >
      Change API key
    </button>
  );
}

function KeyCard({ onSaved, onCancel, overlay }: { onSaved: () => void; onCancel?: () => void; overlay?: boolean }) {
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const key = value.trim();
    if (!key || pending) return;
    setPending(true);
    setError(null);
    const check = await validateGeminiKey(key);
    if (!check.ok) {
      setPending(false);
      setError(check.message);
      return;
    }
    try {
      await storeGeminiKey(key);
    } catch {
      setPending(false);
      setError("Couldn't save the key on this phone. Try again.");
      return;
    }
    setValue("");
    onSaved();
  }

  return (
    <div className={`${overlay ? "fixed inset-0 z-50" : "min-h-screen"} bg-paper flex items-center justify-center px-4 py-8`}>
      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-card border border-rule rounded-[13px] p-6 flex flex-col items-center gap-4 text-center"
      >
        <h1 className="font-display text-[19px] font-semibold text-ink">Add your Gemini key</h1>
        <p className="text-[13px] text-ink-soft">
          The tutor talks to Google&apos;s Gemini directly from this phone. Get a free key at{" "}
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noreferrer"
            className="text-ink border-b border-dotted border-rule"
          >
            aistudio.google.com/apikey
          </a>
          , then paste it here. It stays on this phone.
        </p>
        <input
          autoFocus
          type="password"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Paste your API key"
          className="w-full rounded-[8px] border border-rule bg-transparent px-3.5 py-2.5 text-sm text-center text-ink focus:outline-none focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
        />
        <button
          type="submit"
          disabled={!value.trim() || pending}
          className="w-full rounded-full bg-primary-solid text-on-primary py-2.5 text-[14px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
        >
          {pending ? "Checking…" : "Save and continue"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="text-[11px] text-muted hover:text-ink disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
          >
            Cancel
          </button>
        )}
        {error && <p className="text-xs text-alert">{error}</p>}
      </form>
    </div>
  );
}
