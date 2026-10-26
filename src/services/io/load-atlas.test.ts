// @vitest-environment jsdom
import { createHash, webcrypto } from "node:crypto";
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentAtlasIdentity } from "@/services/atlas/identity";
import * as observation from "@/services/atlas/observation";
import { Load } from "./load";
import * as loadOperation from "./load-operation";
import { readMapBlob } from "./load-operation";
import { isMapIOBusy } from "./map-io";
import { isMapModelStable, markMapModelStable, markMapModelUnstable } from "./model-status";

const boundary = vi.hoisted(() => ({
  draw: vi.fn(),
  publish: vi.fn(),
  log: vi.fn(),
  persist: vi.fn(),
  tip: vi.fn(),
  dialog: vi.fn(),
  focus: vi.fn()
}));
vi.mock("./load-operation", async original => {
  const actual = await original<typeof import("./load-operation")>();
  return { ...actual, readMapBlob: vi.fn(actual.readMapBlob) };
});
vi.mock("@/services", () => ({ Services: {} }));
vi.mock("./save", () => ({ Save: {} }));
vi.mock("./auto-update", () => ({ migrateLegacySettings: vi.fn(), resolveVersionConflicts: vi.fn() }));
vi.mock("@/controllers/style-preset", () => ({ StylePreset: { init: vi.fn(), ensureGroupStyles: vi.fn() } }));
vi.mock("@/components/canvas", () => ({ fitMapToScreen: vi.fn() }));
vi.mock("@/components/dialog/dialog-helpers", () => ({ closeDialogs: vi.fn() }));
vi.mock("@/components/icons", () => ({ Icons: { syncCustom: vi.fn() } }));
vi.mock("@/components/layers", () => ({ Layers: { restore: vi.fn(), drawAll: boundary.draw } }));
vi.mock("@/components/lifecycle", () => ({ registerMap: boundary.publish }));
vi.mock("@/components/options/io-panes", () => ({ pickMapFile: vi.fn() }));
vi.mock("@/components/options/tabs/options-tab", () => ({ syncOptionInputs: vi.fn() }));
vi.mock("@/components/performance", () => ({ applyPerformanceSettings: vi.fn() }));
vi.mock("@/components/tooltips", () => ({ clearMainTip: vi.fn(), tip: boundary.tip }));
vi.mock("@/components/undraw", () => ({ undraw: vi.fn() }));
vi.mock("@/components/viewbox-events", () => ({ applyDefaultViewboxEvents: vi.fn() }));
vi.mock("@/components/zoom", () => ({ resetZoom: vi.fn() }));
vi.mock("@/generators/graph-override", () => ({ GraphOverride: { clear: vi.fn(), restore: vi.fn() } }));
vi.mock("@/generators/styles", () => ({ Styles: { parse: vi.fn(() => ({})), set: vi.fn(), writeAll: vi.fn() } }));
vi.mock("@/renderers/draw-legend", () => ({ onLegendClick: vi.fn() }));
vi.mock("@/renderers/draw-vignette", () => ({ applyVignetteOptions: vi.fn() }));
vi.mock("@/renderers/draw-zones", () => ({ zonesFilter: {} }));
vi.mock("@/renderers/heightmap-color-schemes", () => ({ HeightmapColorSchemes: { ensure: vi.fn() } }));
vi.mock("@/services/fonts", () => ({ declareFont: vi.fn() }));
vi.mock("@/services/logging", () => ({ logStats: boundary.log }));

const WORLD = "20000000-0000-4000-8000-000000000001";
const COORDINATES = { lonW: -180, lonE: 180, lonT: 360, latN: 90, latS: -90, latT: 180 };
function records() {
  const data = Array<string>(53).fill("");
  data[0] = "1.154.0|license|date|fixture|1000|500|1";
  data[1] = JSON.stringify({
    seed: "fixture",
    graph: { width: 1000, height: 500, points: 1 },
    geography: { coordinates: COORDINATES }
  });
  data[3] = "[]";
  data[5] = '<svg id="map" width="1000" height="500"><g id="viewbox"></g></svg>';
  data[6] = JSON.stringify({
    spacing: 1,
    cellsX: 1,
    cellsY: 1,
    points: [[0, 0]],
    boundary: [
      [-1, -1],
      [1, 1]
    ],
    features: [0]
  });
  for (const index of [7, 8, 9, 10, 11, 16, 17, 18, 19, 20, 21, 22, 24, 25]) data[index] = "0";
  data[12] = "[0]";
  for (const index of [13, 14, 15]) data[index] = '[{"i":0}]';
  data[35] = '[{"i":0,"x":500,"y":250,"hidden":true,"dx":999}]';
  data[47] = '[{"i":0,"x":750,"y":375,"label":{"text":"User <Alpha>","fontSize":12}}]';
  return data;
}
function manifestData(sha256: string) {
  return {
    schemaVersion: 1,
    project: { id: "10000000-0000-4000-8000-000000000001", name: "Fixture only" },
    worldMapId: WORLD,
    maps: [
      {
        id: WORLD,
        name: "Fixture",
        kind: "world",
        asset: { path: "fixture.map", sha256 },
        projection: "equirectangular",
        provenance: "Synthetic fixture",
        frame: { west: -180, east: 180, north: 90, south: -90 },
        size: { width: 1000, height: 500 },
        geographicRevision: 1,
        detailLevel: 0,
        parent: null,
        georeference: { verified: true, evidence: "Synthetic fixture, not a terrain survey" }
      }
    ],
    places: [
      {
        id: "30000000-0000-4000-8000-000000000001",
        name: "Original",
        kind: "地点",
        coordinate: { longitude: 0, latitude: 0 },
        provenance: "Fixture",
        revision: 1,
        bindings: [{ mapId: WORLD, kind: "marker", objectId: 0, geographicRevision: 1 }]
      }
    ]
  };
}
function fixture(data = records(), encoding: "plain" | "base64" | "gzip" = "plain") {
  const text = data.join("\r\n");
  const bytes =
    encoding === "gzip"
      ? gzipSync(text)
      : Buffer.from(encoding === "base64" ? Buffer.from(encodeURIComponent(text)).toString("base64") : text);
  const manifest = manifestData(createHash("sha256").update(bytes).digest("hex"));
  return { data, bytes, manifest, blob: new Blob([Uint8Array.from(bytes)]) };
}
const descriptors = new Map(
  ["showModal", "close"].map(key => [key, Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, key)])
);
const streamDescriptor = Object.getOwnPropertyDescriptor(Blob.prototype, "stream");
const click = (text: string) => {
  const button = [...document.querySelectorAll<HTMLButtonElement>("#mapLoadDeparture button")].find(
    node => node.textContent === text
  );
  expect(button).toBeDefined();
  button!.click();
};
async function begin(item = fixture(), callback = vi.fn()) {
  let settled = false;
  const operation = Load.uploadAtlasMap(item.blob, JSON.stringify(item.manifest), WORLD, callback);
  void operation.then(() => {
    settled = true;
  });
  click("准备读取目标");
  await vi.waitFor(() =>
    expect(settled || document.getElementById("mapLoadDepartureTitle")?.textContent === "确认替换当前地图").toBe(true)
  );
  return { operation, callback };
}

beforeEach(() => {
  vi.clearAllMocks();
  boundary.focus.mockReset();
  boundary.publish.mockReset();
  boundary.persist.mockReset();
  boundary.log.mockReset();
  boundary.tip.mockReset();
  markMapModelUnstable();
  markMapModelStable();
  vi.stubGlobal("crypto", { subtle: webcrypto.subtle });
  vi.stubGlobal("customization", 0);
  vi.stubGlobal("grid", { cells: { h: new Uint8Array([21]) } });
  vi.stubGlobal("pack", { old: true });
  vi.stubGlobal("options", { ...options, map: { ...options.map } });
  vi.stubGlobal("Options", {
    applyLoaded: (settings: typeof options.map) => {
      options.map = settings;
    },
    persist: boundary.persist
  });
  document.body.innerHTML =
    '<svg id="map"><g id="viewbox"><text>Old map</text></g></svg><div id="coas"></div><div id="customizationMenu"></div><div id="alertMessage"></div>';
  vi.stubGlobal("alertMessage", document.getElementById("alertMessage"));
  vi.stubGlobal(
    "$",
    vi.fn(() => ({ dialog: boundary.dialog }))
  );
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  });
  Object.defineProperty(Blob.prototype, "stream", {
    configurable: true,
    value: function (this: Blob) {
      const value = this;
      return new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(new Uint8Array(await readMapBlob(value)));
          controller.close();
        }
      });
    }
  });
  vi.stubGlobal("Grid", {
    rebuildGraph: (value: Record<string, unknown>) => {
      value.cells = {};
    }
  });
  vi.stubGlobal("HeightmapGenerator", { clearData: vi.fn() });
  vi.stubGlobal("Pack", {
    generate: () =>
      vi.stubGlobal("pack", { cells: { i: new Uint16Array([0]), f: new Uint16Array([0]) }, vertices: { p: [] } }),
    findCell: () => 0
  });
  vi.stubGlobal("Features", { markupPack: vi.fn() });
  vi.stubGlobal("styles", {
    heightmap: {
      groups: { oceanHeights: { options: { scheme: "test" } }, landHeights: { options: { scheme: "test" } } }
    }
  });
  for (const key of ["Goods", "Markets", "Routes", "TradeAnimation", "Journeys"]) vi.stubGlobal(key, { sync: vi.fn() });
  vi.stubGlobal("Transports", { all: [] });
  vi.stubGlobal("focusOn", boundary.focus);
  vi.stubGlobal("invokeActiveZooming", vi.fn());
});
afterEach(() => {
  document.getElementById("mapLoadDeparture")?.remove();
  for (const [key, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, key, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, key);
  }
  if (streamDescriptor) Object.defineProperty(Blob.prototype, "stream", streamDescriptor);
  else Reflect.deleteProperty(Blob.prototype, "stream");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => {
    resolve = yes;
  });
  return { promise, resolve };
}
async function adoptFixture(item = fixture()) {
  const { operation } = await begin(item);
  click("放弃当前修改并采用目标");
  expect(await operation).toEqual({ type: "loaded" });
  expect(getCurrentAtlasIdentity()).not.toBeNull();
  return getCurrentAtlasIdentity()!;
}

describe("verified atlas adoption source lifecycle", () => {
  it("records only after the whole adoption settles, not the legacy generated event or success tip", async () => {
    const successTip = deferred<void>();
    boundary.tip.mockImplementation((message: unknown) =>
      message === "Map is successfully loaded" ? successTip.promise : undefined
    );
    boundary.publish.mockImplementation(() => {
      expect(isMapModelStable()).toBe(false);
      expect(getCurrentAtlasIdentity()).toBeNull();
      window.dispatchEvent(new CustomEvent("map:generated", { detail: { mapId: 42 } }));
    });
    const item = fixture();
    const { operation } = await begin(item);
    click("放弃当前修改并采用目标");
    await vi.waitFor(() => expect(boundary.publish).toHaveBeenCalledOnce());
    expect(getCurrentAtlasIdentity()).toBeNull();
    successTip.resolve();
    expect(await operation).toEqual({ type: "loaded" });
    expect(getCurrentAtlasIdentity()).toMatchObject({
      projectId: item.manifest.project.id,
      mapId: WORLD,
      geographicRevision: 1,
      sourceAssetSha256: item.manifest.maps[0].asset.sha256
    });
    expect(Object.isFrozen(getCurrentAtlasIdentity())).toBe(true);
  });
  it("rejects an old source publication when B fully adopts between A lease release and A continuation", async () => {
    const actual = loadOperation.runMapLoad;
    let interleave = true;
    const newer: ReturnType<typeof getCurrentAtlasIdentity>[] = [];
    vi.spyOn(loadOperation, "runMapLoad").mockImplementation(async (prepare, adopt, before, authorize, canAdopt) => {
      const outcome = await actual(prepare, adopt, before, authorize, canAdopt);
      if (outcome.type === "loaded" && interleave) {
        interleave = false;
        const item = fixture();
        item.manifest.project.name = "B adopted before A continuation";
        newer.push(await adoptFixture(item));
      }
      return outcome;
    });
    const first = await begin();
    click("放弃当前修改并采用目标");
    expect(await first.operation).toEqual({ type: "loaded" });
    expect(newer).toHaveLength(1);
    expect(getCurrentAtlasIdentity()).toBe(newer[0]);
    expect(getCurrentAtlasIdentity()?.projectName).toBe("B adopted before A continuation");
  });
  it("stores the canonical UUID when a real dedicated load receives an uppercase A-F mapId", async () => {
    const item = fixture();
    const canonical = "abcdefab-0000-4000-8000-abcdefabcdef";
    item.manifest.worldMapId = item.manifest.maps[0].id = canonical;
    item.manifest.places[0].bindings[0].mapId = canonical;
    const operation = Load.uploadAtlasMap(item.blob, JSON.stringify(item.manifest), canonical.toUpperCase());
    click("准备读取目标");
    await vi.waitFor(() =>
      expect(document.getElementById("mapLoadDepartureTitle")?.textContent).toBe("确认替换当前地图")
    );
    click("放弃当前修改并采用目标");
    expect(await operation).toEqual({ type: "loaded" });
    expect(getCurrentAtlasIdentity()?.mapId).toBe(canonical);
  });
  it.each(["persist", "log", "finally"])("does not publish when %s fails after adoption began", async phase => {
    await adoptFixture();
    const error = new Error(`failure in ${phase}`);
    boundary.publish.mockImplementation(() => window.dispatchEvent(new Event("map:generated")));
    if (phase === "persist")
      boundary.persist.mockImplementationOnce(() => {
        throw error;
      });
    if (phase === "log")
      boundary.log.mockImplementationOnce(() => {
        throw error;
      });
    if (phase === "finally") {
      vi.stubGlobal("INFO", true);
      vi.spyOn(console, "groupEnd").mockImplementationOnce(() => {
        throw error;
      });
    }
    const { operation } = await begin();
    click("放弃当前修改并采用目标");
    expect(await operation).toEqual({ type: "failed", error });
    expect(getCurrentAtlasIdentity()).toBeNull();
    expect(isMapModelStable()).toBe(false);
    markMapModelStable();
    expect(getCurrentAtlasIdentity()).toBeNull();
  });
  it.each(["initial-cancel", "final-cancel", "hash", "busy"])(
    "preserves the adopted source on %s before replacement",
    async phase => {
      const old = await adoptFixture();
      if (phase === "busy") {
        const { beginMapIO } = await import("./map-io");
        const lease = beginMapIO("save");
        try {
          expect(await Load.uploadAtlasMap(fixture().blob, JSON.stringify(fixture().manifest), WORLD)).toEqual({
            type: "busy"
          });
        } finally {
          lease!.release();
        }
      } else if (phase === "initial-cancel") {
        const operation = Load.uploadAtlasMap(fixture().blob, JSON.stringify(fixture().manifest), WORLD);
        click("取消，保留当前地图");
        expect(await operation).toEqual({ type: "cancelled" });
      } else {
        const item = fixture();
        if (phase === "hash") item.manifest.maps[0].asset.sha256 = "b".repeat(64);
        const { operation } = await begin(item);
        if (phase === "final-cancel") click("取消，保留当前地图");
        expect((await operation).type).toBe(phase === "hash" ? "failed" : "cancelled");
      }
      expect(getCurrentAtlasIdentity()).toBe(old);
    }
  );
  it("invalidates immediately when ordinary loading replaces the map and never inherits Atlas source", async () => {
    await adoptFixture();
    const item = fixture();
    const operation = Load.uploadMap(item.blob);
    click("准备读取目标");
    await vi.waitFor(() =>
      expect(document.getElementById("mapLoadDepartureTitle")?.textContent).toBe("确认替换当前地图")
    );
    expect(getCurrentAtlasIdentity()).not.toBeNull();
    click("放弃当前修改并采用目标");
    expect(getCurrentAtlasIdentity()).toBeNull();
    expect(await operation).toEqual({ type: "loaded" });
    expect(getCurrentAtlasIdentity()).toBeNull();
  });
  it("never resurrects lineage after failed live-model verification", async () => {
    await adoptFixture();
    boundary.focus.mockImplementationOnce(() => {
      pack.markers[0].x += 1;
    });
    const { operation } = await begin();
    click("放弃当前修改并采用目标");
    expect((await operation).type).toBe("failed");
    markMapModelStable();
    expect(getCurrentAtlasIdentity()).toBeNull();
  });
  it("does not overwrite a newer successful source when an older loaded callback settles late", async () => {
    const callback = deferred<void>();
    const entered = vi.fn(() => callback.promise);
    const first = await begin(fixture(), entered);
    click("放弃当前修改并采用目标");
    await vi.waitFor(() => expect(entered).toHaveBeenCalledOnce());
    const a = getCurrentAtlasIdentity();
    expect(a).not.toBeNull();
    const next = fixture();
    next.manifest.project.name = "New project, same immutable asset";
    const b = await adoptFixture(next);
    expect(b).not.toBe(a);
    callback.resolve();
    expect(await first.operation).toEqual({ type: "loaded" });
    expect(getCurrentAtlasIdentity()).toBe(b);
    expect(b.projectName).toBe("New project, same immutable asset");
  });
  it("keeps a source through later edits without certifying current geography or file equality", async () => {
    const identity = await adoptFixture();
    options.map.geography.coordinates.lonW += 1;
    pack.markers[0].x += 1;
    expect(getCurrentAtlasIdentity()).toBe(identity);
    expect(identity).not.toHaveProperty("liveVerified");
    expect(identity).not.toHaveProperty("currentSha256");
  });
});

describe("atlas upload with the actual adoption function", () => {
  it.each(["plain", "base64", "gzip"] as const)(
    "uses original %s asset bytes and the same detached scene through real adoption",
    async encoding => {
      const item = fixture(records(), encoding);
      const observed = vi.spyOn(observation, "observeAtlasFile");
      const live = vi.spyOn(observation, "observeAtlasModel");
      const digest = vi.spyOn(webcrypto.subtle, "digest");
      const { operation, callback } = await begin(item);
      expect(isMapModelStable()).toBe(true);
      expect(boundary.draw).not.toHaveBeenCalled();
      click("放弃当前修改并采用目标");
      expect(await operation).toEqual({ type: "loaded" });
      expect(callback).toHaveBeenCalledTimes(1);
      expect(observed).toHaveBeenCalledTimes(1);
      expect(document.getElementById("map")).toBe(observed.mock.calls[0][2]);
      expect(digest).toHaveBeenCalledTimes(1);
      const originalBytes = await vi.mocked(readMapBlob).mock.results[0].value;
      expect(digest.mock.calls[0][1]).toBe(originalBytes);
      expect(createHash("sha256").update(new Uint8Array(originalBytes)).digest("hex")).toBe(
        item.manifest.maps[0].asset.sha256
      );
      expect(live.mock.calls.at(-1)?.[0].markers).toBe(pack.markers);
      expect(boundary.publish).toHaveBeenCalledTimes(1);
      expect(boundary.persist).toHaveBeenCalledTimes(1);
      expect(isMapModelStable()).toBe(true);
      expect(isMapIOBusy()).toBe(false);
    }
  );
  it.each(["hash", "frame", "size", "missing", "duplicate", "position", "extra-coordinate", "old-format"])(
    "rejects %s before changing the previous model",
    async kind => {
      const data = records();
      if (kind === "missing") data[35] = "[]";
      if (kind === "duplicate") data[35] = '[{"i":0,"x":500,"y":250},{"i":0,"x":500,"y":250}]';
      if (kind === "position") data[35] = '[{"i":0,"x":501,"y":250}]';
      if (kind === "extra-coordinate") {
        const settings = JSON.parse(data[1]);
        settings.geography.coordinates.extra = 1;
        data[1] = JSON.stringify(settings);
      }
      if (kind === "old-format") data[0] = data[0].replace("1.154.0", "1.143.1");
      const item = fixture(data);
      if (kind === "hash") item.manifest.maps[0].asset.sha256 = "b".repeat(64);
      if (kind === "frame") item.manifest.maps[0].frame.west = -179;
      if (kind === "size") item.manifest.maps[0].size.width = 999;
      const before = { map: options.map, grid, pack, svg: document.getElementById("map") };
      const replacing = vi.fn();
      window.addEventListener("map:replacing", replacing);
      try {
        const { operation, callback } = await begin(item);
        expect((await operation).type).toBe("failed");
        expect(callback).toHaveBeenCalledTimes(1);
        expect(options.map).toBe(before.map);
        expect(grid).toBe(before.grid);
        expect(pack).toBe(before.pack);
        expect(document.getElementById("map")).toBe(before.svg);
        expect(replacing).not.toHaveBeenCalled();
        expect(boundary.publish).not.toHaveBeenCalled();
        expect(isMapModelStable()).toBe(true);
        expect(isMapIOBusy()).toBe(false);
      } finally {
        window.removeEventListener("map:replacing", replacing);
      }
    }
  );
  it("re-observes after focusOn mutation, quarantines failure and does not publish or persist success", async () => {
    boundary.focus.mockImplementation(() => {
      pack.markers[0].x += 1;
    });
    const { operation, callback } = await begin();
    click("放弃当前修改并采用目标");
    const result = await operation;
    expect(result.type).toBe("failed");
    if (result.type === "failed") expect(String(result.error)).toMatch(/采用后.*POSITION_MISMATCH/);
    expect(boundary.focus).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(boundary.publish).not.toHaveBeenCalled();
    expect(boundary.persist).not.toHaveBeenCalled();
    expect(boundary.tip.mock.calls.flat()).not.toContain("Map is successfully loaded");
    expect(isMapModelStable()).toBe(false);
    expect(isMapIOBusy()).toBe(false);
  });
  it("detects a burg removed by the real integrity repair before success publication", async () => {
    const data = records();
    data[15] = '[{"i":0},{"i":1,"x":500,"y":250}]';
    const item = fixture(data);
    item.manifest.places[0].bindings[0].kind = "burg";
    item.manifest.places[0].bindings[0].objectId = 1;
    const { operation } = await begin(item);
    click("放弃当前修改并采用目标");
    const result = await operation;
    expect(result.type).toBe("failed");
    if (result.type === "failed") expect(String(result.error)).toMatch(/采用后.*MISSING_OBJECT/);
    expect(pack.burgs[1].removed).toBe(true);
    expect(isMapModelStable()).toBe(false);
    expect(boundary.publish).not.toHaveBeenCalled();
    expect(boundary.persist).not.toHaveBeenCalled();
  });
  it("leaves the ordinary upload path independent of Atlas declarations", async () => {
    const data = records();
    data[1] = JSON.stringify({ graph: { width: 1000, height: 500 }, seed: "ordinary" });
    const operation = Load.uploadMap(new Blob([data.join("\r\n")]));
    click("准备读取目标");
    await vi.waitFor(() =>
      expect(document.getElementById("mapLoadDepartureTitle")?.textContent).toBe("确认替换当前地图")
    );
    click("放弃当前修改并采用目标");
    expect((await operation).type).toBe("loaded");
    expect(boundary.publish).toHaveBeenCalledTimes(1);
  });
});
