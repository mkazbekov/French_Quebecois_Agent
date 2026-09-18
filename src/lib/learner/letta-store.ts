import Letta from "@letta-ai/letta-client";
import { defaultLearnerState } from "./defaults";
import { DOCUMENT_SCHEMAS, LEARNER_DOCUMENTS, LearnerStateSchema, type LearnerDocument, type LearnerState } from "./schema";
import type { LearnerStore, SessionRecord } from "./store";

/*
 * SDK methods used in this file (see node_modules/@letta-ai/letta-client/resources/{agents,blocks,passages}.d.ts):
 *  - client.agents.list({ name, tags, match_all_tags })         -> PagePromise<AgentStatesArrayPage, AgentState> (awaited page has `.items`)
 *  - client.agents.create({ name, tags, model, description, memory_blocks, embedding? }) -> APIPromise<AgentState>
 *  - client.agents.blocks.list(agentId)                          -> PagePromise<BlockResponsesArrayPage, BlockResponse> (`.items`)
 *  - client.agents.blocks.update(label, { agent_id, value })     -> APIPromise<BlockResponse>
 *  - client.agents.passages.create(agentId, { text })            -> APIPromise<Passage[]>
 *  - client.agents.passages.list(agentId, { limit, ascending })  -> APIPromise<Passage[]>
 */

const QUEBEC_TUTOR_TAG = "quebec-french-tutor";
const REQUEST_TIMEOUT_MS = 20_000;

const BLOCK_LIMITS: Record<LearnerDocument, number> = {
  errors: 30_000,
  vocabulary: 30_000,
  progress: 20_000,
  profile: 8_000,
  competencies: 8_000,
  grammar: 8_000,
  pronunciation: 8_000,
  roadmap: 8_000,
};

const BLOCK_DESCRIPTIONS: Record<LearnerDocument, string> = {
  profile: "Learner identity, goals, preferences and session totals.",
  competencies: "Échelle québécoise level (1-12, with CEFR equivalent), confidence and evidence per competency (oral/written production/comprehension).",
  errors: "Recurring error registry (ERROR-NNN): pattern, observed vs. preferred form, frequency, status.",
  vocabulary: "Known / shaky / target vocabulary, including Quebec-specific register.",
  grammar: "Grammar points the learner has practiced: status, successes/failures, notes.",
  pronunciation: "Reliably observed pronunciation issues and their frequency.",
  roadmap: "Current teaching focus, reason, next practice, and upcoming topic queue.",
  progress: "Compact per-session log: date, mode, minutes, topics, and what changed.",
};

export interface LettaLearnerStoreOptions {
  apiKey?: string;
  baseURL?: string;
  learnerId: string;
  learnerName: string;
  model: string;
}

/**
 * Letta-backed learner store: one Letta agent per learner. Memory blocks
 * (one per LEARNER_DOCUMENTS entry) hold the state documents; archival
 * passages hold compact session records. Canonical store in production.
 */
export class LettaLearnerStore implements LearnerStore {
  readonly kind = "letta" as const;

  private readonly client: Letta;
  private readonly learnerId: string;
  private readonly learnerName: string;
  private readonly model: string;
  private readonly baseURL: string | undefined;
  private readonly agentName: string;
  private readonly tags: string[];

  private _agentId: string | null = null;
  private initPromise: Promise<string> | null = null;

  constructor(opts: LettaLearnerStoreOptions) {
    this.learnerId = opts.learnerId;
    this.learnerName = opts.learnerName;
    this.model = opts.model;
    this.baseURL = opts.baseURL;
    this.agentName = `french-tutor-${opts.learnerId}`;
    this.tags = [QUEBEC_TUTOR_TAG, `learner:${opts.learnerId}`];

    this.client = new Letta({
      apiKey: opts.apiKey,
      ...(opts.baseURL ? { baseURL: opts.baseURL } : {}),
      timeout: REQUEST_TIMEOUT_MS,
    });
  }

  /** Diagnostics only. Throws if init() has not completed. */
  get agentId(): string {
    if (!this._agentId) throw new Error("[Letta] agentId requested before init() completed");
    return this._agentId;
  }

  async init(): Promise<void> {
    if (this._agentId) return;
    if (!this.initPromise) {
      this.initPromise = this.findOrCreateAgent().catch((err) => {
        this.initPromise = null;
        throw err;
      });
    }
    this._agentId = await this.initPromise;
  }

  private async findOrCreateAgent(): Promise<string> {
    const existing = await this.lookupAgent();
    if (existing) return existing;

    try {
      const agent = await this.client.agents.create({
        name: this.agentName,
        tags: this.tags,
        model: this.model,
        description: "Long-term learner memory for a Québec French voice tutor. Memory blocks are JSON documents owned by the tutor app.",
        memory_blocks: LEARNER_DOCUMENTS.map((label) => ({
          label,
          value: JSON.stringify(defaultLearnerState(this.learnerName)[label], null, 1),
          description: BLOCK_DESCRIPTIONS[label],
          limit: BLOCK_LIMITS[label],
        })),
        ...(this.baseURL ? { embedding: "openai/text-embedding-3-small" } : {}),
      });
      return agent.id;
    } catch (err) {
      // Race: another process created the agent between our lookup and create.
      const retry = await this.lookupAgent();
      if (retry) return retry;
      throw new Error(`[Letta] failed to create agent "${this.agentName}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async lookupAgent(): Promise<string | null> {
    try {
      const page = await this.client.agents.list({
        name: this.agentName,
        tags: this.tags,
        match_all_tags: true,
      });
      const items = page.items ?? [];
      return items.length > 0 ? items[0].id : null;
    } catch (err) {
      throw new Error(`[Letta] failed to list agents: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async load(): Promise<LearnerState> {
    await this.init();
    const blocks: Array<{ label?: string | null; value?: string | null }> = [];
    try {
      for await (const block of this.client.agents.blocks.list(this.agentId)) blocks.push(block);
    } catch (err) {
      throw new Error(`[Letta] failed to list memory blocks: ${err instanceof Error ? err.message : String(err)}`);
    }
    const defaults = defaultLearnerState(this.learnerName);
    const state = {} as LearnerState;

    for (const label of LEARNER_DOCUMENTS) {
      const block = blocks.find((b) => b.label === label);
      const schema = DOCUMENT_SCHEMAS[label];
      let parsed: unknown = undefined;
      if (block?.value) {
        try {
          parsed = JSON.parse(block.value);
        } catch (err) {
          console.warn(`[Letta] block "${label}" contains invalid JSON, falling back to default:`, err);
        }
      }
      const result = parsed === undefined ? undefined : schema.safeParse(parsed);
      if (result?.success) {
        (state as Record<LearnerDocument, unknown>)[label] = result.data;
      } else {
        if (block && !result?.success) console.warn(`[Letta] block "${label}" failed validation, falling back to default`);
        (state as Record<LearnerDocument, unknown>)[label] = defaults[label];
      }
    }

    return LearnerStateSchema.parse(state);
  }

  async save(partial: Partial<Pick<LearnerState, LearnerDocument>>): Promise<void> {
    await this.init();
    const entries = Object.entries(partial) as Array<[LearnerDocument, LearnerState[LearnerDocument]]>;

    await Promise.all(
      entries.map(async ([label, doc]) => {
        const trimmed = trimToFit(label, doc);
        const value = JSON.stringify(trimmed, null, 1);
        try {
          await this.client.agents.blocks.update(label, { agent_id: this.agentId, value });
        } catch (err) {
          throw new Error(`[Letta] failed to update block "${label}": ${err instanceof Error ? err.message : String(err)}`);
        }
      }),
    );
  }

  async addSessionRecord(record: SessionRecord): Promise<void> {
    await this.init();
    const text = `SESSION ${record.session_id} | ${record.date}\n${record.markdown}`;
    try {
      await this.client.agents.passages.create(this.agentId, { text });
    } catch (err) {
      throw new Error(`[Letta] failed to write session passage: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async recentSessionRecords(limit: number): Promise<SessionRecord[]> {
    await this.init();
    let passages;
    try {
      passages = await this.client.agents.passages.list(this.agentId, { limit, ascending: false });
    } catch (err) {
      throw new Error(`[Letta] failed to list session passages: ${err instanceof Error ? err.message : String(err)}`);
    }

    // `ascending: false` should already return newest first; sort defensively
    // in case a given server build does not honor ordering.
    const sorted = [...passages].sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime());

    const records: SessionRecord[] = [];
    for (const p of sorted) {
      if (!p.text || !p.text.startsWith("SESSION ")) continue;
      const newlineIdx = p.text.indexOf("\n");
      const header = newlineIdx === -1 ? p.text : p.text.slice(0, newlineIdx);
      const markdown = newlineIdx === -1 ? "" : p.text.slice(newlineIdx + 1);
      const match = /^SESSION (\S+) \| (.+)$/.exec(header);
      if (!match) continue;
      records.push({ session_id: match[1], date: match[2], markdown });
    }
    return records.slice(0, limit);
  }
}

/**
 * Best-effort trim so a document fits inside its Letta block character
 * limit. Only errors/vocabulary/progress have a defined drop strategy;
 * other documents are logged if still oversized (they have no natural list
 * to prune from a fixed-size profile/roadmap/competencies document).
 */
function trimToFit(label: LearnerDocument, doc: LearnerState[LearnerDocument]): LearnerState[LearnerDocument] {
  const limit = BLOCK_LIMITS[label];
  let value = JSON.stringify(doc, null, 1);
  if (value.length <= limit) return doc;

  const clone = structuredClone(doc) as unknown;
  let trimmed = false;

  if (label === "errors") {
    const errors = clone as LearnerState["errors"];
    const resolvedOldestFirst = () =>
      errors.items
        .map((e, i) => ({ e, i }))
        .filter((x) => x.e.status === "resolved")
        .sort((a, b) => new Date(a.e.first_observed).getTime() - new Date(b.e.first_observed).getTime());
    while (JSON.stringify(errors, null, 1).length > limit) {
      const candidates = resolvedOldestFirst();
      if (!candidates.length) break;
      errors.items.splice(candidates[0].i, 1);
      trimmed = true;
    }
    value = JSON.stringify(errors, null, 1);
  } else if (label === "vocabulary") {
    const vocab = clone as LearnerState["vocabulary"];
    const knownOldestLastSeen = () =>
      vocab.items
        .map((v, i) => ({ v, i }))
        .filter((x) => x.v.status === "known")
        .sort((a, b) => new Date(a.v.last_seen ?? 0).getTime() - new Date(b.v.last_seen ?? 0).getTime());
    while (JSON.stringify(vocab, null, 1).length > limit) {
      const candidates = knownOldestLastSeen();
      if (!candidates.length) break;
      vocab.items.splice(candidates[0].i, 1);
      trimmed = true;
    }
    value = JSON.stringify(vocab, null, 1);
  } else if (label === "progress") {
    const progress = clone as LearnerState["progress"];
    while (JSON.stringify(progress, null, 1).length > limit && progress.entries.length > 0) {
      progress.entries.pop(); // entries are newest-first; drop the oldest (last)
      trimmed = true;
    }
    value = JSON.stringify(progress, null, 1);
  }

  if (trimmed) {
    console.warn(`[Letta] trimmed document "${label}" to fit ${limit}-char block limit`);
    return JSON.parse(value) as LearnerState[LearnerDocument];
  }

  if (value.length > limit) {
    console.warn(`[Letta] document "${label}" exceeds its ${limit}-char block limit (${value.length} chars) and has no trim strategy; writing as-is`);
  }
  return doc;
}
