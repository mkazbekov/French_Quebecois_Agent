import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  findAppBrowser,
  appWindowArgs,
  createFrameParser,
  createPageTracker,
} from "../scripts/app-window.mjs";
import { computeBuildFingerprint } from "../scripts/launch.mjs";

describe("findAppBrowser", () => {
  const env = {
    "ProgramFiles(x86)": "C:\\Program Files (x86)",
    ProgramFiles: "C:\\Program Files",
    LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local",
  };
  const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
  const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";

  it("prefers Edge on Windows", () => {
    const r = findAppBrowser({ platform: "win32", env, exists: (p: string) => p === edge || p === chrome });
    expect(r).toEqual({ name: "Edge", path: edge });
  });

  it("falls back to Chrome then Brave", () => {
    expect(findAppBrowser({ platform: "win32", env, exists: (p: string) => p === chrome })?.name).toBe("Chrome");
    const brave = "C:/Users/me/AppData/Local/BraveSoftware/Brave-Browser/Application/brave.exe";
    expect(findAppBrowser({ platform: "win32", env, exists: (p: string) => p === brave })?.name).toBe("Brave");
  });

  it("honours TUTOR_BROWSER first", () => {
    const r = findAppBrowser({
      platform: "win32",
      env: { ...env, TUTOR_BROWSER: "D:/x/browser.exe" },
      exists: () => true,
    });
    expect(r?.path).toBe("D:/x/browser.exe");
  });

  it("finds macOS browsers, user Applications too", () => {
    const edgeMac = "/Users/me/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge";
    const r = findAppBrowser({ platform: "darwin", env: { HOME: "/Users/me" }, exists: (p: string) => p === edgeMac });
    expect(r).toEqual({ name: "Edge", path: edgeMac });
    const chromeMac = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    expect(
      findAppBrowser({ platform: "darwin", env: { HOME: "/Users/me" }, exists: (p: string) => p === chromeMac })?.name,
    ).toBe("Chrome");
  });

  it("scans PATH on Linux", () => {
    const r = findAppBrowser({ platform: "linux", env: { PATH: "/usr/local/bin:/usr/bin" }, exists: (p: string) => p === "/usr/bin/chromium" });
    expect(r?.path).toBe("/usr/bin/chromium");
  });

  it("returns null when nothing exists", () => {
    expect(findAppBrowser({ platform: "win32", env, exists: () => false })).toBeNull();
    expect(findAppBrowser({ platform: "darwin", env: {}, exists: () => false })).toBeNull();
    expect(findAppBrowser({ platform: "linux", env: { PATH: "/usr/bin" }, exists: () => false })).toBeNull();
  });
});

describe("appWindowArgs", () => {
  it("builds the chromeless app args", () => {
    const args = appWindowArgs({ url: "http://127.0.0.1:3000", profileDir: "C:/p", pipe: true });
    expect(args).toContain("--app=http://127.0.0.1:3000");
    expect(args).toContain("--user-data-dir=C:/p");
    expect(args).toContain("--disable-sync");
    expect(args).toContain("--remote-debugging-pipe");
  });
  it("omits the pipe flag when not asked", () => {
    expect(appWindowArgs({ url: "http://x", profileDir: "p", pipe: false })).not.toContain("--remote-debugging-pipe");
    expect(appWindowArgs({ url: "http://x", profileDir: "p" })).not.toContain("--remote-debugging-pipe");
  });
});

describe("createFrameParser", () => {
  it("handles messages split across chunks and several per chunk", () => {
    const got: unknown[] = [];
    const feed = createFrameParser((m: unknown) => got.push(m));
    feed('{"a":1}\0{"b"');
    feed(":2}\0");
    feed('{"c":3}\0{"d":4}\0');
    expect(got).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }, { d: 4 }]);
  });
  it("ignores malformed JSON", () => {
    const got: unknown[] = [];
    const feed = createFrameParser((m: unknown) => got.push(m));
    feed('not json\0{"ok":true}\0');
    expect(got).toEqual([{ ok: true }]);
  });
});

describe("createPageTracker", () => {
  const origin = "http://127.0.0.1:3000";
  const created = (targetId: string, url: string, type = "page") => ({
    method: "Target.targetCreated",
    params: { targetInfo: { targetId, type, url } },
  });
  const changed = (targetId: string, url: string, type = "page") => ({
    method: "Target.targetInfoChanged",
    params: { targetInfo: { targetId, type, url } },
  });
  const destroyed = (targetId: string) => ({ method: "Target.targetDestroyed", params: { targetId } });

  it("follows about:blank to the app URL and reports close once", () => {
    const t = createPageTracker(origin);
    expect(t.feed(created("A", "about:blank"))).toEqual([]);
    expect(t.feed(changed("A", origin + "/"))).toEqual([{ type: "app-opened" }]);
    expect(t.appCount()).toBe(1);
    expect(t.feed(destroyed("A"))).toEqual([{ type: "app-closed" }]);
    expect(t.feed(destroyed("A"))).toEqual([]);
  });

  it("only reports closed when the last of several windows goes", () => {
    const t = createPageTracker(origin);
    t.feed(created("A", origin + "/"));
    t.feed(created("B", origin + "/review"));
    expect(t.feed(destroyed("A"))).toEqual([]);
    expect(t.feed(destroyed("B"))).toEqual([{ type: "app-closed" }]);
  });

  it("does not treat navigating an app page to an error page as closing", () => {
    const t = createPageTracker(origin);
    t.feed(created("A", origin + "/"));
    expect(t.feed(changed("A", "data:text/html,oops"))).toEqual([]);
    expect(t.appCount()).toBe(1);
  });

  it("reports external http(s) pages once", () => {
    const t = createPageTracker(origin);
    t.feed(created("A", origin + "/"));
    expect(t.feed(created("X", "https://mail.google.com/compose"))).toEqual([
      { type: "external", targetId: "X", url: "https://mail.google.com/compose" },
    ]);
    expect(t.feed(changed("X", "https://mail.google.com/compose"))).toEqual([]);
    expect(t.appCount()).toBe(1);
  });

  it("ignores edge://, extensions and non-page targets", () => {
    const t = createPageTracker(origin);
    expect(t.feed(created("S", "edge://sync-confirmation-dialog"))).toEqual([]);
    expect(t.feed(created("E", "chrome-extension://abc/x.html"))).toEqual([]);
    expect(t.feed(created("W", origin + "/sw.js", "service_worker"))).toEqual([]);
    expect(t.appCount()).toBe(0);
  });
});

describe("computeBuildFingerprint", () => {
  it("is stable and changes when a src file changes", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "fp-"));
    try {
      writeFileSync(path.join(dir, "package.json"), '{"version":"1.0.0"}');
      mkdirSync(path.join(dir, "src", "a"), { recursive: true });
      mkdirSync(path.join(dir, "public"));
      writeFileSync(path.join(dir, "src", "a", "x.ts"), "one");
      writeFileSync(path.join(dir, "public", "f.svg"), "<svg/>");
      const a = computeBuildFingerprint(dir);
      expect(computeBuildFingerprint(dir)).toBe(a);
      writeFileSync(path.join(dir, "src", "a", "x.ts"), "two!");
      const b = computeBuildFingerprint(dir);
      expect(b).not.toBe(a);
      const later = new Date(Date.now() + 60_000);
      utimesSync(path.join(dir, "public", "f.svg"), later, later);
      expect(computeBuildFingerprint(dir)).not.toBe(b);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
