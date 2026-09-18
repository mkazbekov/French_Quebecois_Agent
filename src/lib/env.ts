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

export const env = {
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
    return opt("LETTA_MODEL", "openai/gpt-4.1");
  },
  get LEARNER_ID() {
    return opt("LEARNER_ID", "mirza");
  },
  get LEARNER_NAME() {
    return opt("LEARNER_NAME", "Mirza");
  },
  get DATA_DIR() {
    return opt("DATA_DIR", "./data");
  },
};

export function lettaConfigured(): boolean {
  return Boolean(process.env.LETTA_API_KEY || process.env.LETTA_BASE_URL);
}
