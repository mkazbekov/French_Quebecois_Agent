import { env, lettaConfigured } from "@/lib/env";
import { FileLearnerStore } from "./file-store";
import { LettaLearnerStore } from "./letta-store";
import type { LearnerStore } from "./store";

let storePromise: Promise<LearnerStore> | null = null;

/** Process-wide singleton. The only entry point API routes should use. */
export function getLearnerStore(): Promise<LearnerStore> {
  if (!storePromise) {
    storePromise = (async () => {
      const store: LearnerStore = lettaConfigured()
        ? new LettaLearnerStore({
            apiKey: env.LETTA_API_KEY,
            baseURL: env.LETTA_BASE_URL,
            learnerId: env.LEARNER_ID,
            model: env.LETTA_MODEL,
          })
        : new FileLearnerStore({ dataDir: env.DATA_DIR, learnerId: env.LEARNER_ID });
      await store.init();
      const agentInfo = store instanceof LettaLearnerStore ? ` agent=${store.agentId}` : "";
      console.log(`[learner-store] using ${store.kind}${agentInfo}`);
      return store;
    })().catch((err) => {
      storePromise = null; // allow retry after a transient failure
      throw err;
    });
  }
  return storePromise;
}

export type { LearnerStore, SessionRecord } from "./store";
