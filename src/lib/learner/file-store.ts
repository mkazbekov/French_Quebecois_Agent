import { promises as fs } from "node:fs";
import path from "node:path";
import { defaultLearnerState } from "./defaults";
import { DOCUMENT_SCHEMAS, LEARNER_DOCUMENTS, LearnerStateSchema, type LearnerDocument, type LearnerState } from "./schema";
import type { LearnerStore, SessionRecord } from "./store";

interface FileShape {
  version: 1;
  state: LearnerState;
  sessions: SessionRecord[];
}

const MAX_SESSIONS = 200;

export interface FileLearnerStoreOptions {
  dataDir: string;
  learnerId: string;
  learnerName: string;
}

/**
 * JSON-file-backed learner store for local dev / CI when Letta is not
 * configured. Same interface as the Letta store; never used alongside it.
 */
export class FileLearnerStore implements LearnerStore {
  readonly kind = "file" as const;

  private readonly dataDir: string;
  private readonly learnerId: string;
  private readonly learnerName: string;
  private readonly filePath: string;
  private initialized = false;

  constructor(opts: FileLearnerStoreOptions) {
    this.dataDir = opts.dataDir;
    this.learnerId = opts.learnerId;
    this.learnerName = opts.learnerName;
    this.filePath = path.join(this.dataDir, `learner-${this.learnerId}.json`);
  }

  async init(): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
    try {
      await fs.access(this.filePath);
    } catch {
      const initial: FileShape = { version: 1, state: defaultLearnerState(this.learnerName), sessions: [] };
      await this.writeAtomic(initial);
    }
    this.initialized = true;
  }

  private async readFile(): Promise<FileShape> {
    let raw: string;
    try {
      raw = await fs.readFile(this.filePath, "utf-8");
    } catch {
      const initial: FileShape = { version: 1, state: defaultLearnerState(this.learnerName), sessions: [] };
      return initial;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.warn(`[file-store] corrupt learner file at ${this.filePath}, falling back to defaults:`, err);
      return { version: 1, state: defaultLearnerState(this.learnerName), sessions: [] };
    }
    const obj = (parsed && typeof parsed === "object" ? parsed : {}) as Partial<FileShape>;
    const defaults = defaultLearnerState(this.learnerName);
    const rawState = (obj.state && typeof obj.state === "object" ? obj.state : {}) as Record<string, unknown>;
    const state = {} as LearnerState;
    for (const doc of LEARNER_DOCUMENTS) {
      const schema = DOCUMENT_SCHEMAS[doc];
      const result = schema.safeParse(rawState[doc]);
      if (result.success) {
        (state as Record<LearnerDocument, unknown>)[doc] = result.data;
      } else {
        console.warn(`[file-store] document "${doc}" missing or invalid, using default`);
        (state as Record<LearnerDocument, unknown>)[doc] = defaults[doc];
      }
    }
    const sessions = Array.isArray(obj.sessions) ? (obj.sessions as SessionRecord[]) : [];
    return { version: 1, state: LearnerStateSchema.parse(state), sessions };
  }

  private async writeAtomic(data: FileShape): Promise<void> {
    const tmpPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(data, null, 1), "utf-8");
    await fs.rename(tmpPath, this.filePath);
  }

  async load(): Promise<LearnerState> {
    if (!this.initialized) await this.init();
    const data = await this.readFile();
    return data.state;
  }

  async save(partial: Partial<Pick<LearnerState, LearnerDocument>>): Promise<void> {
    if (!this.initialized) await this.init();
    const data = await this.readFile();
    const merged = LearnerStateSchema.parse({ ...data.state, ...structuredClone(partial) });
    await this.writeAtomic({ ...data, state: merged });
  }

  async addSessionRecord(record: SessionRecord): Promise<void> {
    if (!this.initialized) await this.init();
    const data = await this.readFile();
    const sessions = [record, ...data.sessions].slice(0, MAX_SESSIONS);
    await this.writeAtomic({ ...data, sessions });
  }

  async recentSessionRecords(limit: number): Promise<SessionRecord[]> {
    if (!this.initialized) await this.init();
    const data = await this.readFile();
    return data.sessions.slice(0, limit);
  }
}
