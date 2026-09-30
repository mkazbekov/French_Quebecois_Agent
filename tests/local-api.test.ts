import { describe, expect, it } from "vitest";
import { routeLocalApi, type LocalApiOptions } from "@/lib/device/local-api";
import { MemoryLearnerStore } from "@/lib/learner/memory-store";

function opts(): LocalApiOptions {
  return { store: new MemoryLearnerStore(""), getKey: async () => "k", version: "1.2.3" };
}
const call = (o: LocalApiOptions, method: string, path: string, body?: unknown) =>
  routeLocalApi(method, new URL(path, "https://localhost"), async () => body ?? null, o);

describe("routeLocalApi", () => {
  it("ignores anything that is not /api/", async () => {
    expect(await call(opts(), "GET", "/review/")).toBeNull();
  });

  it("serves learner GET/PATCH/DELETE through the shared handlers", async () => {
    const o = opts();
    const patched = await call(o, "PATCH", "/api/learner", { onboarding: { name: "Sam", level: 4 } });
    expect(patched?.status).toBe(200);
    const got = await (await call(o, "GET", "/api/learner"))!.json();
    expect(got.state.profile.name).toBe("Sam");
    expect(got.storeKind).toBe("memory");
    const cleared = await call(o, "DELETE", "/api/learner?scope=history");
    expect((await cleared!.json()).state.profile.name).toBe("Sam");
    const wiped = await call(o, "DELETE", "/api/learner");
    expect((await wiped!.json()).state.profile.name).toBe("");
  });

  it("tolerates a trailing slash", async () => {
    expect((await call(opts(), "GET", "/api/learner/"))?.status).toBe(200);
  });

  it("answers version with no update available", async () => {
    const body = await (await call(opts(), "GET", "/api/version"))!.json();
    expect(body).toMatchObject({ current: "1.2.3", latest: null, updateAvailable: false });
  });

  it("answers feedback with the android platform", async () => {
    const body = await (await call(opts(), "GET", "/api/feedback"))!.json();
    expect(body.details.platform).toBe("android");
    expect(typeof body.contact).toBe("string");
  });

  it("returns 404 for unknown api paths and wrong methods", async () => {
    expect((await call(opts(), "GET", "/api/nope"))?.status).toBe(404);
    expect((await call(opts(), "POST", "/api/feedback"))?.status).toBe(404);
  });

  it("realtime/session reports a missing key through the handler", async () => {
    const o = { ...opts(), getKey: async () => null };
    const res = await call(o, "POST", "/api/realtime/session", {});
    expect(res?.status).toBe(500);
    expect((await res!.json()).error).toContain("Change API key");
  });
});
