import { Preferences } from "@capacitor/preferences";
import { defaultLearnerState } from "@/lib/learner/defaults";
import { DOCUMENT_SCHEMAS, LEARNER_DOCUMENTS, LearnerStateSchema, type LearnerDocument, type LearnerState } from "@/lib/learner/schema";
import type { LearnerStore, SessionRecord } from "@/lib/learner/store";

export const STATE_KEY = "tutor.learner.state";
export const SESSIONS_KEY = "tutor.learner.sessions";
const MAX_SESSIONS = 200;

/** The slice of @capacitor/preferences this store uses (so tests can pass an in-memory map). */
export interface PreferencesLike {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
}

/**
 * Learner store for the Android app: the same documents as the file store, kept
 * in the app's private Capacitor Preferences (SharedPreferences on Android).
 * One key for the state JSON, one for the session records. Like FileLearnerStore,
 * every document is validated on its own and falls back to its default.
 */
export class DeviceLearnerStore implements LearnerStore {
  readonly kind = "device" as const;
  private readonly prefs: PreferencesLike;
  /** Serialises read-modify-write cycles so two quick saves can't overwrite each other. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(prefs: PreferencesLike = Preferences) {
    this.prefs = prefs;
  }

  async init(): Promise<void> {}

  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async readJson(key: string): Promise<unknown> {
    const { value } = await this.prefs.get({ key });
    if (!value) return undefined;
    try {
      return JSON.parse(value);
    } catch {
      console.warn(`[device-store] corrupt "${key}", falling back to defaults`);
      return undefined;
    }
  }

  private async readState(): Promise<LearnerState> {
    const raw = await this.readJson(STATE_KEY);
    const rawState = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const defaults = defaultLearnerState("");
    const state = {} as LearnerState;
    for (const doc of LEARNER_DOCUMENTS) {
      const result = DOCUMENT_SCHEMAS[doc].safeParse(rawState[doc]);
      if (result.success) {
        (state as Record<LearnerDocument, unknown>)[doc] = result.data;
      } else {
        if (rawState[doc] !== undefined) console.warn(`[device-store] document "${doc}" invalid, using default`);
        (state as Record<LearnerDocument, unknown>)[doc] = defaults[doc];
      }
    }
    return LearnerStateSchema.parse(state);
  }

  private async readSessions(): Promise<SessionRecord[]> {
    const raw = await this.readJson(SESSIONS_KEY);
    return Array.isArray(raw) ? (raw as SessionRecord[]) : [];
  }

  async load(): Promise<LearnerState> {
    return this.exclusive(() => this.readState());
  }

  async save(partial: Partial<Pick<LearnerState, LearnerDocument>>): Promise<void> {
    await this.exclusive(async () => {
      const current = await this.readState();
      const merged = LearnerStateSchema.parse({ ...current, ...structuredClone(partial) });
      await this.prefs.set({ key: STATE_KEY, value: JSON.stringify(merged) });
    });
  }

  async addSessionRecord(record: SessionRecord): Promise<void> {
    await this.exclusive(async () => {
      const sessions = [record, ...(await this.readSessions())].slice(0, MAX_SESSIONS);
      await this.prefs.set({ key: SESSIONS_KEY, value: JSON.stringify(sessions) });
    });
  }

  async recentSessionRecords(limit: number): Promise<SessionRecord[]> {
    return this.exclusive(async () => (await this.readSessions()).slice(0, limit));
  }

  async reset(): Promise<void> {
    await this.exclusive(async () => {
      await this.prefs.remove({ key: STATE_KEY });
      await this.prefs.remove({ key: SESSIONS_KEY });
    });
  }
}
