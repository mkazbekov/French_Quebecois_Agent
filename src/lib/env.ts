/**
 * Server-only environment access. Never import from client components.
 */

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable ${name}. See .env.example.`);
  return v;
}

function opt(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

/**
 * Auto-pick: gemini unless only an OpenAI key is configured. With NEITHER key
 * set (a brand-new install, before setup has run) this must still resolve to
 * "gemini" — that's the free, zero-friction default the launcher sets up —
 * not "openai", which would show a "put a paid key in .env" error to someone
 * who was never asked for one.
 */
function autoPickProvider(): "gemini" | "openai" {
  const hasGemini = Boolean(process.env.GEMINI_API_KEY);
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
  return !hasGemini && hasOpenAI ? "openai" : "gemini";
}

export const env = {
  /** "gemini" | "openai". Auto: see autoPickProvider(). */
  get VOICE_PROVIDER(): "gemini" | "openai" {
    const v = process.env.VOICE_PROVIDER;
    if (v === "gemini" || v === "openai") return v;
    return autoPickProvider();
  },
  get REVIEW_PROVIDER(): "gemini" | "openai" {
    const v = process.env.REVIEW_PROVIDER;
    if (v === "gemini" || v === "openai") return v;
    return autoPickProvider();
  },
  get GEMINI_API_KEY() {
    return req("GEMINI_API_KEY");
  },
  get GEMINI_LIVE_MODEL() {
    return opt("GEMINI_LIVE_MODEL", "gemini-3.8-live");
  },
  get GEMINI_LIVE_VOICE() {
    return opt("GEMINI_LIVE_VOICE", "Kore");
  },
  /** Comma-separated fallback list; the first model that answers wins. */
  get GEMINI_REVIEW_MODELS(): string[] {
    return opt("GEMINI_REVIEW_MODELS", "gemini-3.8-flash,gemini-3.5-flash-lite").split(",").map((s) => s.trim()).filter(Boolean);
  },
  get OPENAI_API_KEY() {
    return req("OPENAI_API_KEY");
  },
  get OPENAI_REALTIME_MODEL() {
    return opt("OPENAI_REALTIME_MODEL", "gpt-realtime-2.1");
  },
  get OPENAI_REALTIME_VOICE() {
    return opt("OPENAI_REALTIME_VOICE", "marin");
  },
  get OPENAI_REVIEW_MODEL() {
    return opt("OPENAI_REVIEW_MODEL", "gpt-5.6-luna");
  },
  /** Optional. When absent the app runs with the local file store. */
  get LETTA_API_KEY(): string | undefined {
    return process.env.LETTA_API_KEY || undefined;
  },
  /** Optional. Self-hosted Letta server, e.g. http://localhost:8283 */
  get LETTA_BASE_URL(): string | undefined {
    return process.env.LETTA_BASE_URL || undefined;
  },
  get LETTA_MODEL() {
    return opt("LETTA_MODEL", "openai/gpt-5.6-luna");
  },
  get LEARNER_ID() {
    return opt("LEARNER_ID", "learner");
  },
  get DATA_DIR() {
    return opt("DATA_DIR", "./data");
  },
};

export function lettaConfigured(): boolean {
  return Boolean(process.env.LETTA_API_KEY || process.env.LETTA_BASE_URL);
}
