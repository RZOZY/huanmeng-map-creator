import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const bootstrap = readFileSync(new URL("../../public/i18n/00-fmgc-bootstrap.js", import.meta.url), "utf8");

function createHost(href: string, { electron = false, controlled = false, reloaded = false } = {}) {
  const unregister = vi.fn().mockResolvedValue(true);
  const serviceWorker = {
    controller: controlled ? {} : null,
    getRegistrations: vi.fn().mockResolvedValue([{ unregister }])
  };
  const cacheStorage = { keys: vi.fn().mockResolvedValue(["old-cache"]), delete: vi.fn().mockResolvedValue(true) };
  const stored = new Map<string, string>();
  if (reloaded) stored.set("fmGC_sw_reloaded_fmg-v4", "1");
  const sessionStorage = {
    getItem: vi.fn((key: string) => stored.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => stored.set(key, value))
  };
  const url = new URL(href);
  const location = { href, protocol: url.protocol, origin: url.origin, replace: vi.fn() };
  const navigator: { serviceWorker?: typeof serviceWorker } = { serviceWorker };
  const console = { warn: vi.fn(), log: vi.fn(), error: vi.fn() };
  const window: Record<string, unknown> = {
    location,
    caches: cacheStorage,
    electron: electron ? { isElectron: true } : undefined,
    stop: vi.fn()
  };
  window.self = window;
  window.top = window;
  const run = () =>
    runInNewContext(bootstrap, {
      window,
      location,
      navigator,
      caches: cacheStorage,
      sessionStorage,
      console,
      URL,
      document: { readyState: "loading", addEventListener: vi.fn() },
      setTimeout,
      clearTimeout
    });
  return { run, window, location, navigator, console, serviceWorker, unregister, cacheStorage, sessionStorage };
}

async function settle(): Promise<void> {
  for (let step = 0; step < 12; step++) await Promise.resolve();
}

describe("classic bootstrap Service Worker cleanup", () => {
  it("loads this bootstrap through its content stamp for returning visitors", () => {
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    const stamp = createHash("sha256").update(bootstrap).digest("hex").slice(0, 8);
    expect(html).toContain(`<script src="./i18n/00-fmgc-bootstrap.js?v=${stamp}"></script>`);
  });

  it.each(["app://fmg/index.html", "file:///map/index.html", "about:blank"])(
    "does not touch browser cache APIs on unsupported origin %s",
    async href => {
      const host = createHost(href);
      host.run();
      await settle();
      expect(host.serviceWorker.getRegistrations).not.toHaveBeenCalled();
      expect(host.cacheStorage.keys).not.toHaveBeenCalled();
      expect(host.location.replace).not.toHaveBeenCalled();
      expect(host.window.FMGC).toBeDefined();
    }
  );

  it("does not query a custom-scheme controller or force a desktop reload", async () => {
    const host = createHost("app://fmg/index.html", { controlled: true });
    host.run();
    await settle();
    expect(host.serviceWorker.getRegistrations).not.toHaveBeenCalled();
    expect(host.sessionStorage.setItem).not.toHaveBeenCalled();
    expect(host.location.replace).not.toHaveBeenCalled();
    expect(host.window.stop).not.toHaveBeenCalled();
  });

  it("does not clean desktop storage when served from an HTTP development origin", async () => {
    const host = createHost("http://localhost:5173/", { electron: true, controlled: true });
    host.run();
    await settle();
    expect(host.serviceWorker.getRegistrations).not.toHaveBeenCalled();
    expect(host.cacheStorage.keys).not.toHaveBeenCalled();
    expect(host.location.replace).not.toHaveBeenCalled();
  });

  it("preserves supported HTTPS worker and cache cleanup", async () => {
    const host = createHost("https://map.example/index.html");
    host.run();
    await settle();
    expect(host.serviceWorker.getRegistrations).toHaveBeenCalledTimes(1);
    expect(host.unregister).toHaveBeenCalledTimes(1);
    expect(host.cacheStorage.keys).toHaveBeenCalledTimes(1);
    expect(host.cacheStorage.delete).toHaveBeenCalledWith("old-cache");
    expect(host.location.replace).not.toHaveBeenCalled();
  });

  it("keeps the existing controlled browser one-shot reload and strips query/hash", async () => {
    const host = createHost("https://map.example/index.html?old=1#label", { controlled: true });
    host.run();
    await settle();
    expect(host.sessionStorage.setItem).toHaveBeenCalledWith("fmGC_sw_reloaded_fmg-v4", "1");
    expect(host.location.replace).toHaveBeenCalledExactlyOnceWith(
      expect.stringMatching(/^https:\/\/map\.example\/index\.html\?fmgsvcreload=\d+$/)
    );
    expect(host.window.stop).toHaveBeenCalledTimes(1);
    expect(host.unregister).toHaveBeenCalledTimes(1);
    expect(host.cacheStorage.delete).toHaveBeenCalledWith("old-cache");
  });

  it("does not reload a controlled browser twice", async () => {
    const host = createHost("http://localhost:5173/", { controlled: true, reloaded: true });
    host.run();
    await settle();
    expect(host.location.replace).not.toHaveBeenCalled();
    expect(host.unregister).toHaveBeenCalledTimes(1);
  });

  it("works without Service Worker support", () => {
    const host = createHost("https://map.example/");
    delete host.navigator.serviceWorker;
    expect(host.run).not.toThrow();
    expect(host.cacheStorage.keys).not.toHaveBeenCalled();
    expect(host.window.FMGC).toBeDefined();
  });

  describe.each([false, true])("browser cleanup with controller=%s", controlled => {
    it.each(["registrations", "unregister", "cache-keys", "cache-delete"] as const)(
      "reports rejected %s without an unhandled cleanup promise",
      async operation => {
        const host = createHost("https://map.example/index.html", { controlled });
        const error = new Error(`${operation} failed`);
        if (operation === "registrations") host.serviceWorker.getRegistrations.mockRejectedValue(error);
        if (operation === "unregister") host.unregister.mockRejectedValue(error);
        if (operation === "cache-keys") host.cacheStorage.keys.mockRejectedValue(error);
        if (operation === "cache-delete") host.cacheStorage.delete.mockRejectedValue(error);
        host.run();
        await settle();
        const message = operation.startsWith("cache-") ? "[FMGC] 缓存清理失败：" : "[FMGC] Service Worker 清理失败：";
        expect(host.console.warn).toHaveBeenCalledExactlyOnceWith(message, error);
        expect(host.location.replace).toHaveBeenCalledTimes(controlled ? 1 : 0);
      }
    );
  });

  it.each(["registrations", "cache-keys"] as const)("reports synchronous %s failures", async operation => {
    const host = createHost("https://map.example/");
    const error = new Error(`${operation} threw`);
    const method = operation === "registrations" ? host.serviceWorker.getRegistrations : host.cacheStorage.keys;
    method.mockImplementation(() => {
      throw error;
    });
    expect(host.run).not.toThrow();
    await settle();
    expect(host.console.warn).toHaveBeenCalledExactlyOnceWith(
      operation === "registrations" ? "[FMGC] Service Worker 清理失败：" : "[FMGC] 缓存清理失败：",
      error
    );
  });

  it("keeps worker cleanup available without CacheStorage", async () => {
    const host = createHost("https://map.example/");
    delete host.window.caches;
    host.run();
    await settle();
    expect(host.unregister).toHaveBeenCalledTimes(1);
    expect(host.cacheStorage.keys).not.toHaveBeenCalled();
  });

  it("keeps shared-preview early exit before any cleanup", async () => {
    const host = createHost("https://map.example/?fc_skip=1", { controlled: true });
    host.run();
    await settle();
    expect(host.serviceWorker.getRegistrations).not.toHaveBeenCalled();
    expect(host.cacheStorage.keys).not.toHaveBeenCalled();
    expect(host.location.replace).not.toHaveBeenCalled();
  });
});
