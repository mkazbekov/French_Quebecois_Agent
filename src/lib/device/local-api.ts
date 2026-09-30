import { deleteLearner, getLearner, patchLearner } from "@/lib/api/learner";
import { getFeedback } from "@/lib/api/feedback";
import { startSession } from "@/lib/api/realtime-session";
import { endSession } from "@/lib/api/session-end";
import type { ApiDeps, ApiResult, TutorConfig } from "@/lib/api/types";
import type { LearnerStore } from "@/lib/learner/store";
import {
  DEFAULT_FEEDBACK_EMAIL,
  DEFAULT_GEMINI_LIVE_MODEL,
  DEFAULT_GEMINI_LIVE_VOICE,
  DEFAULT_GEMINI_REVIEW_MODELS,
} from "@/lib/tutor/model-defaults";
import { DeviceLearnerStore } from "./device-store";
import { readStoredGeminiKey } from "./api-key";

/** The phone's handler config: always Gemini for voice and review, with the key the learner pasted. */
export function deviceConfig(geminiApiKey: string | undefined, version: string): TutorConfig {
  return {
    platform: "android",
    platformLabel: "android",
    version,
    voiceProvider: "gemini",
    reviewProvider: "gemini",
    geminiApiKey,
    geminiLiveModel: DEFAULT_GEMINI_LIVE_MODEL,
    geminiLiveVoice: DEFAULT_GEMINI_LIVE_VOICE,
    geminiReviewModels: DEFAULT_GEMINI_REVIEW_MODELS.split(",").map((s) => s.trim()).filter(Boolean),
    feedbackEmail: DEFAULT_FEEDBACK_EMAIL,
  };
}

export interface LocalApiOptions {
  store: LearnerStore;
  /** Looked up per request so "Change API key" takes effect immediately. */
  getKey: () => Promise<string | null | undefined>;
  version: string;
}

const JSON_HEADERS = { "content-type": "application/json" };

function toResponse(result: ApiResult): Response {
  return new Response(JSON.stringify(result.body), { status: result.status, headers: JSON_HEADERS });
}

/**
 * Serves one /api/* request with the shared handlers (src/lib/api/*) — the same
 * code the desktop routes run. Returns null when the request is not ours.
 */
export async function routeLocalApi(
  method: string,
  url: URL,
  readBody: () => Promise<unknown>,
  opts: LocalApiOptions,
): Promise<Response | null> {
  if (!url.pathname.startsWith("/api/")) return null;
  const path = url.pathname.replace(/\/+$/, "");
  const verb = method.toUpperCase();
  const store = opts.store;
  const deps = async (): Promise<ApiDeps> => ({ store, config: deviceConfig((await opts.getKey()) ?? undefined, opts.version) });

  try {
    if (path === "/api/learner") {
      if (verb === "GET") return toResponse(await getLearner({ store }));
      if (verb === "PATCH") return toResponse(await patchLearner(await readBody(), { store }));
      if (verb === "DELETE") return toResponse(await deleteLearner(url.searchParams.get("scope"), { store }));
    } else if (path === "/api/realtime/session" && verb === "POST") {
      return toResponse(await startSession(await readBody(), await deps()));
    } else if (path === "/api/session/end" && verb === "POST") {
      return toResponse(await endSession(await readBody(), await deps()));
    } else if (path === "/api/feedback" && verb === "GET") {
      return toResponse(getFeedback(await deps()));
    } else if (path === "/api/version" && verb === "GET") {
      // The phone app is updated by installing a new APK; there is nothing to check or prompt.
      return toResponse({
        status: 200,
        body: { current: opts.version, latest: null, updateAvailable: false, checkedAt: new Date().toISOString(), howToUpdate: "" },
      });
    }
  } catch (err) {
    console.error("[local-api] handler failed", err instanceof Error ? err.message : "unknown error");
    return toResponse({ status: 500, body: { error: err instanceof Error ? err.message : "Something went wrong." } });
  }
  return toResponse({ status: 404, body: { error: "Not found" } });
}

let installed = false;

/**
 * Replaces window.fetch so same-origin /api/* requests are answered on the
 * device; everything else (Google's APIs, the Live WebSocket token call…) goes
 * to the real fetch. Idempotent.
 */
export function installLocalApi(options?: Partial<LocalApiOptions>): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const opts: LocalApiOptions = {
    store: options?.store ?? new DeviceLearnerStore(),
    getKey: options?.getKey ?? readStoredGeminiKey,
    version: options?.version ?? process.env.NEXT_PUBLIC_APP_VERSION ?? "unknown",
  };
  const realFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : null;
    const rawUrl = request ? request.url : input instanceof URL ? input.href : String(input);
    let url: URL;
    try {
      url = new URL(rawUrl, window.location.href);
    } catch {
      return realFetch(input, init);
    }
    if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/")) return realFetch(input, init);

    const method = init?.method ?? request?.method ?? "GET";
    const readBody = async (): Promise<unknown> => {
      try {
        const text = init?.body != null ? String(init.body) : request ? await request.text() : "";
        return text ? JSON.parse(text) : null;
      } catch {
        return null;
      }
    };
    const res = await routeLocalApi(method, url, readBody, opts);
    return res ?? realFetch(input, init);
  };
}
