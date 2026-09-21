import { afterEach, describe, expect, it, vi } from "vitest";
import { compareVersions, isNewer, fetchRemoteVersion } from "../scripts/version.mjs";

describe("compareVersions / isNewer", () => {
  it("treats equal versions as equal", () => {
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
    expect(isNewer("1.2.3", "1.2.3")).toBe(false);
  });

  it("orders by patch", () => {
    expect(compareVersions("1.2.4", "1.2.3")).toBe(1);
    expect(compareVersions("1.2.3", "1.2.4")).toBe(-1);
    expect(isNewer("1.2.4", "1.2.3")).toBe(true);
    expect(isNewer("1.2.3", "1.2.4")).toBe(false);
  });

  it("orders by minor", () => {
    expect(compareVersions("1.3.0", "1.2.9")).toBe(1);
    expect(isNewer("1.3.0", "1.2.9")).toBe(true);
  });

  it("orders by major", () => {
    expect(compareVersions("2.0.0", "1.9.9")).toBe(1);
    expect(isNewer("2.0.0", "1.9.9")).toBe(true);
  });

  it("compares numerically, not lexically (0.10.0 > 0.9.9)", () => {
    expect(compareVersions("0.10.0", "0.9.9")).toBe(1);
    expect(isNewer("0.10.0", "0.9.9")).toBe(true);
    expect(isNewer("0.9.9", "0.10.0")).toBe(false);
  });

  it("tolerates missing parts", () => {
    expect(compareVersions("1.2", "1.2.0")).toBe(0);
    expect(compareVersions("1", "1.0.0")).toBe(0);
    expect(compareVersions("1.3", "1.2.9")).toBe(1);
  });

  it("tolerates malformed / non-numeric input without throwing", () => {
    expect(() => compareVersions("abc", "1.2.3")).not.toThrow();
    expect(compareVersions("abc", "0.0.0")).toBe(0);
    expect(compareVersions("1.x.3", "1.0.3")).toBe(0);
    expect(compareVersions("", "0.0.1")).toBe(-1);
    expect(compareVersions(undefined as unknown as string, "0.0.0")).toBe(0);
    expect(compareVersions(null as unknown as string, null as unknown as string)).toBe(0);
    expect(compareVersions("v1.2.3", "1.2.3")).toBe(0); // tolerant of a leading "v"
  });
});

describe("fetchRemoteVersion", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("resolves with an error instead of throwing when fetch rejects", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network down"));
    const result = await fetchRemoteVersion({ timeoutMs: 100 });
    expect(result.version).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it("resolves with an error instead of throwing when fetch times out", async () => {
    global.fetch = vi.fn().mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          setTimeout(() => reject(new Error("The operation was aborted")), 20);
        }),
    );
    const result = await fetchRemoteVersion({ timeoutMs: 10 });
    expect(result.version).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it("resolves with an error when the response is not ok", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404, text: async () => "" });
    const result = await fetchRemoteVersion({ timeoutMs: 100 });
    expect(result.version).toBeNull();
    expect(result.error).toContain("404");
  });

  it("resolves with an error instead of throwing when the response body is junk", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "not json at all {{{" });
    const result = await fetchRemoteVersion({ timeoutMs: 100 });
    expect(result.version).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it("resolves with an error when the JSON has no version field", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify({ name: "x" }) });
    const result = await fetchRemoteVersion({ timeoutMs: 100 });
    expect(result.version).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it("returns the version on a well-formed response", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify({ version: "0.3.0" }) });
    const result = await fetchRemoteVersion({ timeoutMs: 100 });
    expect(result.version).toBe("0.3.0");
    expect(result.error).toBeNull();
  });
});
