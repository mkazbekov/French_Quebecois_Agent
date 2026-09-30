// Opens the tutor in its own chromeless "app" window (Chromium --app= mode) and
// watches it over a DevTools pipe so the launcher knows when the learner closes it.
//
// Why not Electron: an unsigned exe is blocked by Windows Smart App Control; only
// the signed node.exe and msedge.exe / chrome.exe run. Zero dependencies: node:
// builtins only.

import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

// ---------------------------------------------------------------------------
// Finding a browser
// ---------------------------------------------------------------------------

/**
 * @param {{ platform?: string, env?: Record<string, string | undefined>, exists?: (p: string) => boolean }} [opts]
 * @returns {{ name: string, path: string } | null}
 */
export function findAppBrowser({ platform = process.platform, env = process.env, exists = existsSync } = {}) {
  const override = env.TUTOR_BROWSER?.trim();
  if (override && exists(override)) return { name: "custom", path: override };

  if (platform === "win32") {
    const roots = [env["ProgramFiles(x86)"], env.ProgramFiles, env.LOCALAPPDATA].filter(Boolean);
    const rels = [
      ["Edge", "Microsoft/Edge/Application/msedge.exe"],
      ["Chrome", "Google/Chrome/Application/chrome.exe"],
      ["Brave", "BraveSoftware/Brave-Browser/Application/brave.exe"],
    ];
    for (const [name, rel] of rels) {
      for (const root of roots) {
        const p = path.posix.join(root.replace(/\\/g, "/"), rel);
        if (exists(p)) return { name, path: p };
      }
    }
    return null;
  }

  if (platform === "darwin") {
    const dirs = ["/Applications", env.HOME ? `${env.HOME}/Applications` : null].filter(Boolean);
    const rels = [
      ["Chrome", "Google Chrome.app/Contents/MacOS/Google Chrome"],
      ["Edge", "Microsoft Edge.app/Contents/MacOS/Microsoft Edge"],
      ["Brave", "Brave Browser.app/Contents/MacOS/Brave Browser"],
      ["Chromium", "Chromium.app/Contents/MacOS/Chromium"],
    ];
    for (const [name, rel] of rels) {
      for (const dir of dirs) {
        const p = `${dir}/${rel}`;
        if (exists(p)) return { name, path: p };
      }
    }
    return null;
  }

  const names = [
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
    "microsoft-edge",
    "brave-browser",
  ];
  const dirs = (env.PATH ?? "").split(":").filter(Boolean);
  for (const name of names) {
    for (const dir of dirs) {
      const p = `${dir}/${name}`;
      if (exists(p)) return { name, path: p };
    }
  }
  return null;
}

export function appWindowArgs({ url, profileDir, pipe = false }) {
  const args = [
    `--app=${url}`,
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-sync",
    "--disable-features=Translate",
    "--window-size=1180,900",
  ];
  if (pipe) args.push("--remote-debugging-pipe");
  return args;
}

// ---------------------------------------------------------------------------
// DevTools pipe framing + page tracking (pure)
// ---------------------------------------------------------------------------

/** Returns a chunk handler that emits each "\0"-delimited JSON message. */
export function createFrameParser(onMessage) {
  let buffer = "";
  return (chunk) => {
    buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    let idx;
    while ((idx = buffer.indexOf("\0")) !== -1) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      if (!raw.trim()) continue;
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        continue;
      }
      try {
        onMessage(msg);
      } catch {
        /* never throw out of the parser */
      }
    }
  };
}

/**
 * Tracks which page targets belong to the tutor. `feed(msg)` returns a list of
 * events: { type: "external", targetId, url } (a page on another http(s) origin,
 * to be closed and opened in the default browser), { type: "app-opened" } and
 * { type: "app-closed" } (count went from >=1 to 0).
 * A target that has been seen on the app origin stays an app page until destroyed
 * (so navigating it to an error page does not look like closing the window).
 */
export function createPageTracker(appOrigin) {
  const pages = new Map(); // targetId -> { kind: "app" | "other", url }
  const reportedExternal = new Set();
  const appCount = () => [...pages.values()].filter((p) => p.kind === "app").length;
  const onApp = (url) => url === appOrigin || url.startsWith(appOrigin + "/") || url.startsWith(appOrigin + "?");

  return {
    appCount,
    appTargetIds: () => [...pages.entries()].filter(([, p]) => p.kind === "app").map(([id]) => id),
    feed(msg) {
      const events = [];
      if (!msg || typeof msg.method !== "string") return events;
      const before = appCount();
      if (msg.method === "Target.targetCreated" || msg.method === "Target.targetInfoChanged") {
        const info = msg.params?.targetInfo;
        if (info && info.type === "page" && typeof info.targetId === "string") {
          const url = String(info.url ?? "");
          const prev = pages.get(info.targetId);
          if (prev?.kind === "app") {
            /* sticky */
          } else if (onApp(url)) {
            pages.set(info.targetId, { kind: "app", url });
          } else {
            pages.set(info.targetId, { kind: "other", url });
            if (/^https?:\/\//i.test(url) && !reportedExternal.has(info.targetId)) {
              reportedExternal.add(info.targetId);
              events.push({ type: "external", targetId: info.targetId, url });
            }
          }
        }
      } else if (msg.method === "Target.targetDestroyed") {
        pages.delete(msg.params?.targetId);
      }
      const after = appCount();
      if (before === 0 && after > 0) events.push({ type: "app-opened" });
      if (before > 0 && after === 0) events.push({ type: "app-closed" });
      return events;
    },
  };
}

// ---------------------------------------------------------------------------
// Launching
// ---------------------------------------------------------------------------

function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

function killPid(pid, force) {
  try {
    if (process.platform === "win32") {
      const args = ["/pid", String(pid), "/T"];
      if (force) args.push("/F");
      spawn("taskkill", args, { stdio: "ignore", windowsHide: true }).unref();
    } else {
      process.kill(pid, force ? "SIGKILL" : "SIGTERM");
    }
  } catch {
    /* ignore */
  }
}

export function openAppWindow({ browserPath, url, profileDir }) {
  const child = spawn(browserPath, appWindowArgs({ url, profileDir, pipe: true }), {
    stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"],
    windowsHide: false,
  });

  let exited = false;
  const closed = new Promise((resolve) => {
    child.once("exit", (code) => {
      exited = true;
      resolve(code);
    });
    child.once("error", () => {
      exited = true;
      resolve(null);
    });
  });

  const tracker = createPageTracker(originOf(url));
  let nextId = 1;
  const pending = new Map();

  const send = (method, params = {}, sessionId) => {
    const id = nextId++;
    return new Promise((resolve) => {
      if (exited || !child.stdio[3]?.writable) return resolve(null);
      pending.set(id, resolve);
      const payload = { id, method, params };
      if (sessionId) payload.sessionId = sessionId;
      try {
        child.stdio[3].write(JSON.stringify(payload) + "\0");
      } catch {
        pending.delete(id);
        resolve(null);
      }
      setTimeout(() => {
        if (pending.delete(id)) resolve(null);
      }, 5000).unref();
    });
  };
  child.stdio[3]?.on("error", () => {});
  child.stdio[4]?.on("error", () => {});

  let closing = null;
  const close = () => {
    if (closing) return closing;
    closing = (async () => {
      if (exited) return;
      await send("Browser.close");
      const killer = setTimeout(() => {
        if (!exited) killPid(child.pid, true);
      }, 3000);
      killer.unref();
      await closed;
      clearTimeout(killer);
    })();
    return closing;
  };

  child.stdio[4]?.on(
    "data",
    createFrameParser((msg) => {
      if (typeof msg.id === "number" && pending.has(msg.id)) {
        const cb = pending.get(msg.id);
        pending.delete(msg.id);
        cb(msg);
        return;
      }
      for (const ev of tracker.feed(msg)) {
        if (ev.type === "external") {
          void send("Target.closeTarget", { targetId: ev.targetId });
          openInDefaultBrowser(ev.url);
        } else if (ev.type === "app-opened") {
          // The host runs in the background, so Windows may open the window
          // behind whatever had focus; ask for it to be raised (best effort).
          void bringToFront();
        } else if (ev.type === "app-closed") {
          void close();
        }
      }
    }),
  );

  void send("Target.setDiscoverTargets", { discover: true });

  const attachToApp = async () => {
    const [targetId] = tracker.appTargetIds();
    if (!targetId || exited) return null;
    const att = await send("Target.attachToTarget", { targetId, flatten: true });
    return att?.result?.sessionId ?? null;
  };

  async function bringToFront() {
    try {
      const sessionId = await attachToApp();
      if (sessionId) await send("Page.bringToFront", {}, sessionId);
    } catch {
      /* best effort */
    }
  }

  const showError = async (html) => {
    try {
      const sessionId = await attachToApp();
      if (!sessionId) return;
      await send("Page.navigate", { url: "data:text/html;charset=utf-8," + encodeURIComponent(html) }, sessionId);
    } catch {
      /* best effort */
    }
  };

  return { process: child, closed, showError, close };
}

/** Used when the tutor is already running: the running browser instance of this profile opens another window. */
export function openWindowWithoutPipe({ browserPath, url, profileDir }) {
  try {
    const child = spawn(browserPath, appWindowArgs({ url, profileDir, pipe: false }), {
      stdio: "ignore",
      detached: true,
    });
    child.on("error", () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}

export function openInDefaultBrowser(url) {
  try {
    if (process.platform === "win32") {
      // Not `cmd /c start`: cmd would split a URL at "&" (the Gmail compose
      // link has several) and run the rest as commands.
      spawn("rundll32", ["url.dll,FileProtocolHandler", url], { stdio: "ignore", detached: true, windowsHide: true }).unref();
    } else if (process.platform === "darwin") {
      spawn("open", [url], { stdio: "ignore", detached: true }).unref();
    } else {
      spawn("xdg-open", [url], { stdio: "ignore", detached: true }).unref();
    }
  } catch {
    console.log(`Open this in your browser: ${url}`);
  }
}
