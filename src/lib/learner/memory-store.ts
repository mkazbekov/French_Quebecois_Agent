import { defaultLearnerState } from "./defaults";
import { LearnerStateSchema, type LearnerDocument, type LearnerState } from "./schema";
import type { LearnerStore, SessionRecord } from "./store";

/** In-process store for unit tests and as a safe placeholder. Nothing survives a restart. */
export class MemoryLearnerStore implements LearnerStore {
  readonly kind = "memory" as const;
  private state: LearnerState;
  private records: SessionRecord[] = [];

  constructor(name = "Learner", initial?: LearnerState) {
    this.state = initial ?? defaultLearnerState(name);
  }

  async init(): Promise<void> {}

  async load(): Promise<LearnerState> {
    return LearnerStateSchema.parse(structuredClone(this.state));
  }

  async save(partial: Partial<Pick<LearnerState, LearnerDocument>>): Promise<void> {
    this.state = LearnerStateSchema.parse({ ...this.state, ...structuredClone(partial) });
  }

  async addSessionRecord(record: SessionRecord): Promise<void> {
    this.records.unshift(record);
  }

  async recentSessionRecords(limit: number): Promise<SessionRecord[]> {
    return this.records.slice(0, limit);
  }

  async reset(): Promise<void> {
    this.state = defaultLearnerState("");
    this.records = [];
  }
}
