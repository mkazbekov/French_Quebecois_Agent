import type { LearnerDocument, LearnerState } from "./schema";

/** A compact, human-readable record of one finished session (Markdown). */
export interface SessionRecord {
  session_id: string;
  date: string; // ISO
  markdown: string;
}

/**
 * The only way the app reads or writes long-term learner state.
 *
 * Exactly one implementation is active per process (chosen in ./index.ts):
 *  - LettaLearnerStore  (canonical, production)
 *  - FileLearnerStore   (LETTA_API_KEY absent: local JSON file, dev/CI only)
 *  - MemoryLearnerStore (unit tests)
 */
export interface LearnerStore {
  /** Human-readable name of the backend, shown in logs / UI footer. */
  readonly kind: "letta" | "file" | "memory";

  /** Creates the learner (Letta agent / file) if missing. Idempotent. */
  init(): Promise<void>;

  /** Full validated state. Missing or corrupt documents fall back to defaults. */
  load(): Promise<LearnerState>;

  /** Write the given documents. Only documents present in `partial` are written. */
  save(partial: Partial<Pick<LearnerState, LearnerDocument>>): Promise<void>;

  /** Append a session record (archival memory). */
  addSessionRecord(record: SessionRecord): Promise<void>;

  /** Most recent session records, newest first. */
  recentSessionRecords(limit: number): Promise<SessionRecord[]>;

  /**
   * Delete everything stored for this learner (profile, documents, session
   * records). The next load() returns fresh defaults with onboarded_at null.
   */
  reset(): Promise<void>;
}
