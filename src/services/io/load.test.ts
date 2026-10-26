// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAP_FORMAT_VERSION } from "@/services/versioning";
import { Load } from "./load";
import { readMapBlob, runMapLoad } from "./load-operation";
import { beginMapIO, isMapIOBusy } from "./map-io";
import { isMapModelStable, markMapModelStable } from "./model-status";

const boundary = vi.hoisted(() => ({
  adopt: vi.fn<(prepared: unknown) => Promise<void>>(),
  cloud: vi.fn<(path: string) => Promise<Blob>>(),
  fetch: vi.fn<typeof fetch>(),
  dialog: vi.fn(),
  tip: vi.fn(),
  generate: vi.fn()
}));

vi.mock("./load-operation", async importOriginal => {
  const actual = await importOriginal<typeof import("./load-operation")>();
  return {
    ...actual,
    readMapBlob: vi.fn(actual.readMapBlob),
    // Keep the real lease, provider and Blob preflight; only replace world/DOM adoption.
    runMapLoad: vi.fn(
      <T>(prepare: () => Promise<T | null>, _adopt: (prepared: T) => Promise<void> | void, beforeAdopt?: () => void) =>
        actual.runMapLoad(prepare, boundary.adopt, beforeAdopt)
    )
  };
});
vi.mock("@/services", () => ({ Services: { Cloud: { load: boundary.cloud } } }));
vi.mock("@/components/canvas", () => ({ fitMapToScreen: vi.fn() }));
vi.mock("@/components/dialog/dialog-helpers", () => ({ closeDialogs: vi.fn() }));
vi.mock("@/components/icons", () => ({ Icons: {} }));
vi.mock("@/components/layers", () => ({ Layers: {} }));
vi.mock("@/components/lifecycle", () => ({ registerMap: vi.fn() }));
vi.mock("@/components/options/io-panes", () => ({ pickMapFile: vi.fn() }));
vi.mock("@/components/options/tabs/options-tab", () => ({ syncOptionInputs: vi.fn() }));
vi.mock("@/components/performance", () => ({ applyPerformanceSettings: vi.fn() }));
vi.mock("@/components/tooltips", () => ({ clearMainTip: vi.fn(), tip: boundary.tip }));
vi.mock("@/components/undraw", () => ({ undraw: vi.fn() }));
vi.mock("@/components/viewbox-events", () => ({ applyDefaultViewboxEvents: vi.fn() }));
vi.mock("@/components/zoom", () => ({ resetZoom: vi.fn() }));
vi.mock("@/controllers", () => ({ Controllers: {} }));
vi.mock("@/renderers/draw-legend", () => ({ onLegendClick: vi.fn() }));
vi.mock("@/renderers/draw-vignette", () => ({ applyVignetteOptions: vi.fn() }));
vi.mock("@/renderers/draw-zones", () => ({ zonesFilter: {} }));
vi.mock("@/renderers/heightmap-color-schemes", () => ({ HeightmapColorSchemes: {} }));
vi.mock("@/services/fonts", () => ({ declareFont: vi.fn() }));
vi.mock("@/services/logging", () => ({ logStats: vi.fn() }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function mapBlob(marker = "target", version = MAP_FORMAT_VERSION): Blob {
  const data = [`${version}|`, "{}", marker, "", "", '<svg id="map"></svg>', "{}", "0", "0", "0"];
  return new Blob([data.join("\r\n")]);
}

function response(blob: Blob | Promise<Blob> = mapBlob()) {
  return { ok: true, blob: vi.fn(async () => blob) } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  boundary.adopt.mockReset().mockResolvedValue();
  boundary.cloud.mockReset().mockRejectedValue(new Error("Unexpected cloud request"));
  boundary.fetch.mockReset().mockRejectedValue(new Error("Unexpected network request"));
  markMapModelStable();
  document.body.innerHTML =
    '<div id="alertMessage"></div><select id="loadFromDropboxSelect"><option value="/test.map">test</option></select>';
  vi.stubGlobal("alertMessage", document.getElementById("alertMessage"));
  vi.stubGlobal(
    "$",
    vi.fn(() => ({ dialog: boundary.dialog }))
  );
  vi.stubGlobal("fetch", boundary.fetch);
  vi.stubGlobal("generateMapOnLoad", boundary.generate);
  vi.stubGlobal("mapHistory", [{ registeredAt: Date.now() }]);
  vi.stubGlobal("pack", { marker: "old model" });
  window.dispatchEvent(new Event("map:generated"));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("quick load storage failures", () => {
  it("handles IndexedDB rejection without replacing the document or generating a new map", async () => {
    const error = new Error("QuotaExceededError");
    vi.stubGlobal("ldb", { get: vi.fn().mockRejectedValue(error) });
    const oldModel = pack;
    await expect(Load.quickLoad()).resolves.toBeUndefined();
    expect(pack).toBe(oldModel);
    expect(boundary.adopt).not.toHaveBeenCalled();
    expect(boundary.generate).not.toHaveBeenCalled();
    expect(boundary.tip).toHaveBeenCalledWith("无法读取浏览器暂存地图，当前地图未更换", true, "error", 4000);
    expect(isMapIOBusy()).toBe(false);
  });

  it("retains the handled rejection even if failure feedback and logging throw", async () => {
    vi.stubGlobal("ldb", { get: vi.fn().mockRejectedValue(new Error("storage unavailable")) });
    boundary.tip.mockImplementationOnce(() => {
      throw new Error("tooltip unavailable");
    });
    vi.spyOn(console, "error").mockImplementation(() => {
      throw new Error("logger unavailable");
    });
    await expect(Load.quickLoad()).resolves.toBeUndefined();
    expect(boundary.adopt).not.toHaveBeenCalled();
    expect(boundary.generate).not.toHaveBeenCalled();
  });

  it("reports missing browser storage in Chinese without generating a new map", async () => {
    vi.stubGlobal("ldb", { get: vi.fn().mockResolvedValue(null) });
    await expect(Load.quickLoad()).resolves.toBeUndefined();
    expect(boundary.tip).toHaveBeenCalledWith("暂无暂存地图，请先将地图存入浏览器暂存", true, "error", 2000);
    expect(boundary.generate).not.toHaveBeenCalled();
  });
});

describe("production load provider boundary", () => {
  it("blocks local, URL and cloud reads throughout a slow fetch, Blob read and adoption", async () => {
    const network = deferred<Response>();
    const body = deferred<Blob>();
    const adoption = deferred<void>();
    const replacing = vi.fn();
    window.addEventListener("map:replacing", replacing);
    const callback = vi.fn();
    boundary.fetch.mockReturnValueOnce(network.promise);
    boundary.adopt.mockReturnValueOnce(adoption.promise);
    const oldModel = pack;
    const pending = Load.loadMapFromURL("https://example.invalid/first.map");
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    expect(isMapIOBusy()).toBe(true);
    expect(boundary.fetch).toHaveBeenCalledOnce();
    expect(vi.mocked(runMapLoad)).toHaveBeenCalledOnce();

    await expect(Load.uploadMap(mapBlob("local"), callback)).resolves.toEqual({ type: "busy" });
    await expect(Load.loadMapFromURL("https://example.invalid/second.map")).resolves.toEqual({ type: "busy" });
    await expect(Load.loadFromDropbox()).resolves.toEqual({ type: "busy" });
    expect(callback).toHaveBeenCalledOnce();
    expect(boundary.fetch).toHaveBeenCalledOnce();
    expect(boundary.cloud).not.toHaveBeenCalled();
    expect(readMapBlob).not.toHaveBeenCalled();
    expect(boundary.adopt).not.toHaveBeenCalled();
    expect(replacing).not.toHaveBeenCalled();
    expect(pack).toBe(oldModel);
    expect(settled).toBe(false);

    network.resolve(response(body.promise));
    await Promise.resolve();
    expect(isMapIOBusy()).toBe(true);
    expect(readMapBlob).not.toHaveBeenCalled();
    body.resolve(mapBlob("remote"));
    await vi.waitFor(() => expect(boundary.adopt).toHaveBeenCalledOnce());
    expect(replacing).toHaveBeenCalledOnce();
    expect(readMapBlob).toHaveBeenCalledOnce();
    expect(isMapIOBusy()).toBe(true);
    expect(settled).toBe(false);
    adoption.resolve();
    await expect(pending).resolves.toEqual({ type: "loaded" });
    expect(isMapIOBusy()).toBe(false);
    expect(callback).toHaveBeenCalledOnce();
    window.removeEventListener("map:replacing", replacing);
  });

  it("holds the same lease while Dropbox reads, returns adoption, and allows a later local callback once", async () => {
    const download = deferred<Blob>();
    const oldModel = pack;
    boundary.cloud.mockReturnValueOnce(download.promise);
    const pending = Load.loadFromDropbox();
    expect(isMapIOBusy()).toBe(true);
    expect(boundary.cloud).toHaveBeenCalledExactlyOnceWith("/test.map");
    await expect(Load.loadFromDropbox()).resolves.toEqual({ type: "busy" });
    await expect(Load.loadMapFromURL("https://example.invalid/other.map")).resolves.toEqual({ type: "busy" });
    const busyCallback = vi.fn();
    await expect(Load.uploadMap(mapBlob(), busyCallback)).resolves.toEqual({ type: "busy" });
    expect(busyCallback).toHaveBeenCalledOnce();
    expect(readMapBlob).not.toHaveBeenCalled();
    expect(boundary.fetch).not.toHaveBeenCalled();
    expect(boundary.cloud).toHaveBeenCalledOnce();
    expect(pack).toBe(oldModel);
    download.resolve(mapBlob("cloud"));
    await expect(pending).resolves.toEqual({ type: "loaded" });
    expect(boundary.adopt).toHaveBeenCalledWith(expect.objectContaining({ mapVersion: MAP_FORMAT_VERSION }));
    expect(isMapIOBusy()).toBe(false);

    const adoption = deferred<void>();
    boundary.adopt.mockReturnValueOnce(adoption.promise);
    const callback = vi.fn(() => expect(isMapIOBusy()).toBe(false));
    const local = Load.uploadMap(mapBlob("local"), callback);
    await vi.waitFor(() => expect(boundary.adopt).toHaveBeenCalledTimes(2));
    expect(callback).not.toHaveBeenCalled();
    adoption.resolve();
    await expect(local).resolves.toEqual({ type: "loaded" });
    expect(callback).toHaveBeenCalledOnce();
    expect(busyCallback).toHaveBeenCalledOnce();
    // Every production entry above reaches the same operation, without a nested second lease.
    expect(runMapLoad).toHaveBeenCalledTimes(5);
  });

  it.each(["load", "save", "generate"] as const)("starts no remote provider while %s owns the map", async kind => {
    const lease = beginMapIO(kind);
    try {
      await expect(Load.loadMapFromURL("https://example.invalid/map.map")).resolves.toEqual({ type: "busy" });
      await expect(Load.loadFromDropbox()).resolves.toEqual({ type: "busy" });
      expect(boundary.fetch).not.toHaveBeenCalled();
      expect(boundary.cloud).not.toHaveBeenCalled();
      expect(readMapBlob).not.toHaveBeenCalled();
      expect(boundary.adopt).not.toHaveBeenCalled();
    } finally {
      lease?.release();
    }
  });

  it.each(["network", "http", "body", "cloud", "file"] as const)(
    "%s failure leaves the previous model untouched, releases the lease and permits retry",
    async failure => {
      const error = new Error("provider failed");
      const oldModel = pack;
      const replacing = vi.fn();
      window.addEventListener("map:replacing", replacing);
      let operation: ReturnType<typeof Load.uploadMap>;
      if (failure === "cloud") {
        boundary.cloud.mockRejectedValueOnce(error);
        operation = Load.loadFromDropbox();
      } else if (failure === "file") {
        vi.mocked(readMapBlob).mockRejectedValueOnce(error);
        operation = Load.uploadMap(mapBlob());
      } else {
        if (failure === "network") boundary.fetch.mockRejectedValueOnce(error);
        if (failure === "http") boundary.fetch.mockResolvedValueOnce({ ok: false } as Response);
        if (failure === "body") {
          boundary.fetch.mockResolvedValueOnce({
            ok: true,
            blob: async () => {
              throw error;
            }
          } as unknown as Response);
        }
        operation = Load.loadMapFromURL("https://example.invalid/map.map");
      }
      await expect(operation).resolves.toMatchObject({ type: "failed", error: expect.any(Error) });
      expect(isMapIOBusy()).toBe(false);
      expect(pack).toBe(oldModel);
      expect(replacing).not.toHaveBeenCalled();
      expect(boundary.adopt).not.toHaveBeenCalled();
      expect(boundary.dialog).toHaveBeenCalledOnce();
      expect(alertMessage.textContent).not.toMatch(/回滚|rolled back/);
      await expect(Load.uploadMap(mapBlob("retry"))).resolves.toEqual({ type: "loaded" });
      expect(boundary.adopt).toHaveBeenCalledOnce();
      window.removeEventListener("map:replacing", replacing);
    }
  );

  it.each(["0.60.0", "99.0.0"])(
    "returns rejected for incompatible remote version %s without adoption",
    async version => {
      const oldModel = pack;
      boundary.fetch.mockResolvedValueOnce(response(mapBlob("unsupported", version)));
      await expect(Load.loadMapFromURL("https://example.invalid/version.map")).resolves.toEqual({ type: "rejected" });
      expect(boundary.adopt).not.toHaveBeenCalled();
      expect(pack).toBe(oldModel);
      expect(isMapIOBusy()).toBe(false);
    }
  );

  it("rejects incomplete remote bytes before replacement and permits retry", async () => {
    const oldModel = pack;
    const replacing = vi.fn();
    window.addEventListener("map:replacing", replacing);
    boundary.fetch.mockResolvedValueOnce(response(new Blob([`${MAP_FORMAT_VERSION}|\r\n<svg id="map"></svg>`])));
    await expect(Load.loadMapFromURL("https://example.invalid/incomplete.map")).resolves.toEqual({ type: "rejected" });
    expect(boundary.adopt).not.toHaveBeenCalled();
    expect(replacing).not.toHaveBeenCalled();
    expect(pack).toBe(oldModel);
    expect(isMapIOBusy()).toBe(false);
    await expect(Load.uploadMap(mapBlob())).resolves.toEqual({ type: "loaded" });
    window.removeEventListener("map:replacing", replacing);
  });

  it.each(["url", "cloud"] as const)("forwards %s adoption failure instead of reporting loaded", async source => {
    const error = new Error("adoption failed");
    boundary.adopt.mockRejectedValueOnce(error);
    boundary.fetch.mockResolvedValueOnce(response());
    boundary.cloud.mockResolvedValueOnce(mapBlob());
    const operation =
      source === "url" ? Load.loadMapFromURL("https://example.invalid/map.map") : Load.loadFromDropbox();
    await expect(operation).resolves.toEqual({ type: "failed", error });
    expect(isMapIOBusy()).toBe(false);
    expect(alertMessage.textContent).toContain("当前地图可能不完整");
    expect(alertMessage.textContent).not.toMatch(/回滚|rolled back/);
  });

  it("keeps local callbacks as completion cleanup for rejected and failed outcomes", async () => {
    const rejected = vi.fn();
    await expect(Load.uploadMap(mapBlob("old", "0.60.0"), rejected)).resolves.toEqual({ type: "rejected" });
    expect(rejected).toHaveBeenCalledOnce();
    const failed = vi.fn();
    const error = new Error("file read failed");
    vi.mocked(readMapBlob).mockRejectedValueOnce(error);
    await expect(Load.uploadMap(mapBlob(), failed)).resolves.toEqual({ type: "failed", error });
    expect(failed).toHaveBeenCalledOnce();
    expect(boundary.adopt).not.toHaveBeenCalled();
  });

  for (const behavior of ["throw", "reject"] as const) {
    it.each(["loaded", "failed", "busy", "rejected", "cancelled"] as const)(
      `preserves %s and model status when the completion callback can ${behavior}`,
      async primary => {
        const error = new Error("primary adoption failure");
        const cleanupError = new Error("completion callback failed");
        const logged = vi.spyOn(console, "error").mockImplementation(() => {});
        const lease = primary === "busy" ? beginMapIO("save") : null;
        if (primary === "failed") boundary.adopt.mockRejectedValueOnce(error);
        if (primary === "cancelled") {
          vi.mocked(readMapBlob).mockRejectedValueOnce(new DOMException("cancelled", "AbortError"));
        }
        const callbackState: { busy: boolean; stable: boolean }[] = [];
        const callback = vi.fn(() => {
          callbackState.push({ busy: isMapIOBusy(), stable: isMapModelStable() });
          if (behavior === "throw") throw cleanupError;
          return Promise.reject(cleanupError);
        });
        try {
          const outcome = await Load.uploadMap(
            mapBlob("local", primary === "rejected" ? "0.60.0" : MAP_FORMAT_VERSION),
            callback
          );
          expect(outcome).toEqual(primary === "failed" ? { type: "failed", error } : { type: primary });
          expect(callback).toHaveBeenCalledOnce();
          expect(callbackState).toEqual([{ busy: primary === "busy", stable: primary !== "failed" }]);
          expect(logged).toHaveBeenCalledWith("地图载入完成清理失败", cleanupError);
          expect(isMapModelStable()).toBe(primary !== "failed");
        } finally {
          lease?.release();
        }
        expect(isMapIOBusy()).toBe(false);
      }
    );
  }

  it("awaits asynchronous completion cleanup without reacquiring the lease or changing loaded", async () => {
    const cleanup = deferred<void>();
    const callback = vi.fn(() => cleanup.promise);
    const pending = Load.uploadMap(mapBlob(), callback);
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await vi.waitFor(() => expect(callback).toHaveBeenCalledOnce());
    expect(isMapIOBusy()).toBe(false);
    expect(isMapModelStable()).toBe(true);
    expect(settled).toBe(false);
    cleanup.resolve();
    await expect(pending).resolves.toEqual({ type: "loaded" });
  });

  it.each(["provider", "report", "busy", "preflight", "adoption-report", "startup-fallback"] as const)(
    "keeps the primary result and model status when %s feedback throws or rejects",
    async feedback => {
      const primaryError = new Error("primary failure");
      const uiError = new Error("UI feedback failed");
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});
      const lease = feedback === "busy" ? beginMapIO("load") : null;
      if (feedback === "busy")
        boundary.tip.mockImplementationOnce(() => {
          throw uiError;
        });
      else if (feedback === "startup-fallback") boundary.generate.mockRejectedValueOnce(uiError);
      else
        boundary.dialog.mockImplementationOnce(() => {
          throw uiError;
        });
      let operation: ReturnType<typeof Load.uploadMap>;
      if (feedback === "provider" || feedback === "startup-fallback") {
        boundary.fetch.mockRejectedValueOnce(primaryError);
        if (feedback === "startup-fallback") vi.stubGlobal("mapHistory", []);
        operation = Load.loadMapFromURL("https://example.invalid/feedback.map", feedback === "startup-fallback");
      } else {
        if (feedback === "report") vi.mocked(readMapBlob).mockRejectedValueOnce(primaryError);
        if (feedback === "adoption-report") boundary.adopt.mockRejectedValueOnce(primaryError);
        operation = Load.uploadMap(mapBlob("local", feedback === "preflight" ? "0.60.0" : MAP_FORMAT_VERSION));
      }
      try {
        await expect(operation).resolves.toEqual(
          feedback === "busy"
            ? { type: "busy" }
            : feedback === "preflight"
              ? { type: "rejected" }
              : { type: "failed", error: primaryError }
        );
        expect(isMapModelStable()).toBe(feedback !== "adoption-report");
        expect(logged).toHaveBeenCalledWith(
          feedback === "provider"
            ? "地图链接载入错误提示失败"
            : feedback === "preflight"
              ? "地图版本校验提示失败"
              : "地图载入结果提示失败",
          uiError
        );
      } finally {
        lease?.release();
      }
      expect(isMapIOBusy()).toBe(false);
    }
  );

  it.each(["fetch", "body"] as const)(
    "reports the internal %s timeout as failed, not user cancellation",
    async stage => {
      vi.useFakeTimers();
      const error = new DOMException("timed out", "AbortError");
      boundary.fetch.mockImplementationOnce(async (_input, init) => {
        const cancelled = new Promise<never>((_resolve, reject) => {
          init!.signal!.addEventListener("abort", () => reject(error), { once: true });
        });
        return stage === "fetch" ? cancelled : response(cancelled);
      });
      vi.stubGlobal("ERROR", true);
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});
      const oldModel = pack;
      const pending = Load.loadMapFromURL("https://example.invalid/timeout.map");
      await vi.advanceTimersByTimeAsync(119999);
      expect(isMapIOBusy()).toBe(true);
      await vi.advanceTimersByTimeAsync(1);
      await expect(pending).resolves.toMatchObject({
        type: "failed",
        error: { name: "Error", message: "Cannot load map from URL: request timed out", cause: error }
      });
      expect(logged).toHaveBeenCalledWith("Cannot load map from URL: request timed out");
      expect(pack).toBe(oldModel);
      expect(boundary.adopt).not.toHaveBeenCalled();
      expect(isMapIOBusy()).toBe(false);
      expect(isMapModelStable()).toBe(true);
      vi.useRealTimers();
      boundary.fetch.mockResolvedValueOnce(response());
      await expect(Load.loadMapFromURL("https://example.invalid/retry.map")).resolves.toEqual({ type: "loaded" });
    }
  );

  it("still returns cancelled for a genuine FileReader abort", async () => {
    class Reader {
      onabort: (() => void) | null = null;
      readAsArrayBuffer() {
        this.onabort?.();
      }
    }
    vi.stubGlobal("FileReader", Reader);
    const oldModel = pack;
    const callback = vi.fn();
    await expect(Load.uploadMap(mapBlob(), callback)).resolves.toEqual({ type: "cancelled" });
    expect(callback).toHaveBeenCalledOnce();
    expect(pack).toBe(oldModel);
    expect(boundary.adopt).not.toHaveBeenCalled();
    expect(isMapIOBusy()).toBe(false);
    expect(isMapModelStable()).toBe(true);
  });

  it("does not generate over an adopted map after a startup-link failure", async () => {
    const oldModel = pack;
    boundary.fetch.mockRejectedValueOnce(new Error("offline"));
    await expect(Load.loadMapFromURL("https://example.invalid/startup.map", true)).resolves.toMatchObject({
      type: "failed"
    });
    expect(pack).toBe(oldModel);
    expect(boundary.generate).not.toHaveBeenCalled();
    expect(alertMessage.textContent).not.toContain("A new random map is generated");
  });

  it("preserves the empty-startup generation fallback only after release and still returns failed", async () => {
    vi.stubGlobal("mapHistory", []);
    boundary.generate.mockImplementationOnce(() => expect(isMapIOBusy()).toBe(false));
    boundary.fetch.mockRejectedValueOnce(new Error("offline"));
    await expect(Load.loadMapFromURL("https://example.invalid/startup.map", true)).resolves.toMatchObject({
      type: "failed"
    });
    expect(boundary.generate).toHaveBeenCalledOnce();
    expect(alertMessage.textContent).toContain("A new random map is generated");
    expect(boundary.adopt).not.toHaveBeenCalled();
  });
});
