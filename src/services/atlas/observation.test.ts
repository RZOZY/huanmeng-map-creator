// @vitest-environment jsdom
import { createHash, webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prepareDetachedMapSvg } from "@/services/io/map-preflight";
import { parseAtlasManifest } from "./manifest";
import { assertAtlasSnapshot, observeAtlasFile, observeAtlasModel, sha256MapBytes } from "./observation";

const WORLD = "20000000-0000-4000-8000-000000000001";
const HASH = "a".repeat(64);
const GRAPH = { width: 1000, height: 500 };
const COORDINATES = { lonW: -180, lonE: 180, lonT: 360, latN: 90, latS: -90, latT: 180 };

function source() {
  return {
    graph: { ...GRAPH },
    coordinates: { ...COORDINATES },
    burgs: [0, { i: 1, x: 250, y: 125, cell: 0 }, { i: 2, removed: true }],
    markers: [{ i: 0, x: 500, y: 250, hidden: true, dx: 900, dy: -999 }],
    addedLabels: [{ i: 0, x: 750, y: 375, label: { text: "User <Alpha>", dx: 100, hidden: true } }]
  };
}
function data() {
  const model = source();
  const records = Array<string>(53).fill("");
  records[0] = "1.154.0|license|date|seed|1000|500|not-an-atlas-uuid";
  records[1] = JSON.stringify({ graph: model.graph, geography: { coordinates: model.coordinates } });
  records[5] = '<svg id="map" width="1000" height="500"><g id="viewbox"></g></svg>';
  records[15] = JSON.stringify(model.burgs);
  records[35] = JSON.stringify(model.markers);
  records[47] = JSON.stringify(model.addedLabels);
  return records;
}
function observe(records = data()) {
  return observeAtlasFile(records, HASH, prepareDetachedMapSvg(records[5]));
}
function manifest() {
  return parseAtlasManifest(
    JSON.stringify({
      schemaVersion: 1,
      project: { id: "10000000-0000-4000-8000-000000000001", name: "测试图集" },
      worldMapId: WORLD,
      maps: [
        {
          id: WORLD,
          name: "世界",
          kind: "world",
          asset: { path: "world.map", sha256: HASH },
          projection: "equirectangular",
          provenance: "独立记录",
          frame: { west: -180, east: 180, north: 90, south: -90 },
          size: GRAPH,
          geographicRevision: 1,
          detailLevel: 0,
          parent: null,
          georeference: { verified: true, evidence: "人工地理基准记录，不是程序重新测绘" }
        }
      ],
      places: [
        {
          id: "30000000-0000-4000-8000-000000000001",
          name: "原文",
          kind: "地点",
          coordinate: { longitude: 0, latitude: 0 },
          provenance: "坐标记录",
          revision: 1,
          bindings: [{ mapId: WORLD, kind: "marker", objectId: 0, geographicRevision: 1 }]
        }
      ]
    })
  );
}

beforeEach(() => vi.stubGlobal("crypto", { subtle: webcrypto.subtle }));
afterEach(() => vi.unstubAllGlobals());

describe("independent atlas observations", () => {
  it("hashes the actual supplied bytes without a declaration or name", async () => {
    const bytes = new TextEncoder().encode("abc").buffer;
    expect(await sha256MapBytes(bytes)).toBe(createHash("sha256").update("abc").digest("hex"));
    expect(await sha256MapBytes(new ArrayBuffer(0))).toBe(createHash("sha256").update("").digest("hex"));
  });
  it("fails closed when hashing is unavailable or rejects", async () => {
    vi.stubGlobal("crypto", {});
    await expect(sha256MapBytes(new ArrayBuffer(0))).rejects.toThrow();
    vi.stubGlobal("crypto", { subtle: { digest: vi.fn().mockRejectedValue(new Error("hash failure")) } });
    await expect(sha256MapBytes(new ArrayBuffer(0))).rejects.toThrow("hash failure");
  });
  it("observes owned full-precision frame, size and all model anchors without mutating the source", () => {
    const records = data();
    const before = [...records];
    const scene = prepareDetachedMapSvg(records[5]);
    const html = scene.outerHTML;
    const snapshot = observeAtlasFile(records, HASH, scene);
    expect(snapshot).toEqual({
      sha256: HASH,
      projection: "equirectangular",
      frame: { west: -180, east: 180, north: 90, south: -90 },
      size: GRAPH,
      objects: [
        { kind: "burg", objectId: 1, position: { x: 250, y: 125 } },
        { kind: "marker", objectId: 0, position: { x: 500, y: 250 } },
        { kind: "addedLabel", objectId: 0, position: { x: 750, y: 375 } }
      ]
    });
    expect(records).toEqual(before);
    expect(scene.outerHTML).toBe(html);
    expect(scene.isConnected).toBe(false);
    expect(Object.isFrozen(snapshot.objects[0].position)).toBe(true);
    expect(observeAtlasModel(source(), HASH)).toEqual(snapshot);
    expect(() => assertAtlasSnapshot(manifest(), WORLD, snapshot, "file")).not.toThrow();
  });
  it("preserves IEEE arithmetic and rejects coordinates the native schema would recalculate", () => {
    const model = source();
    Object.assign(model.coordinates, { lonW: -52.8, lonT: 72.2, lonE: 19.4, latN: 60.1, latT: 20.2, latS: 39.9 });
    const snapshot = observeAtlasModel(model, HASH);
    expect(snapshot.frame.east).toBe(-52.8 + 72.2);
    expect(snapshot.frame.south).toBe(60.1 - 20.2);
    Object.assign(model.coordinates, { lonW: 170, lonT: 20, lonE: 190 });
    expect(() => observeAtlasModel(model, HASH)).toThrow();
  });
  it("tolerates endpoint cancellation noise without rounding observed arithmetic", () => {
    const model = source();
    Object.assign(model.coordinates, { lonW: -179.9, lonT: 180, lonE: 0.1, latN: 89.9, latT: 90, latS: -0.1 });
    const snapshot = observeAtlasModel(model, HASH);
    expect(snapshot.frame.east).toBe(-179.9 + 180);
    expect(snapshot.frame.south).toBe(89.9 - 90);
  });
  it.each(["1.153.0", "1.143.1", "2.0.0", "", "1.154.1"])("rejects unreviewed atlas format %s", version => {
    const records = data();
    records[0] = `${version}|x|x|x|1000|500`;
    expect(() => observe(records)).toThrow();
  });
  it.each([
    { lonE: 179 },
    { latS: -89 },
    { lonT: 0 },
    { latT: -1 },
    { latN: 91 },
    { lonW: -181 },
    { lonT: 361 },
    { lonW: "-180" },
    { lonE: null },
    { latS: Number.NaN },
    { extra: 1 }
  ])("rejects missing, contradictory or invalid coordinates %j", patch => {
    const model = source();
    Object.assign(model.coordinates, patch);
    expect(() => observeAtlasModel(model, HASH)).toThrow();
  });
  it.each([null, {}, { width: 0, height: 500 }, { width: "1000", height: 500 }, { width: 1, height: Infinity }])(
    "rejects invalid actual graph %j",
    graph => expect(() => observeAtlasModel({ ...source(), graph }, HASH)).toThrow()
  );
  it.each([
    '<svg id="map" width="999" height="500"><g id="viewbox"/></svg>',
    '<svg id="map" width="1000px" height="500"><g id="viewbox"/></svg>',
    '<svg id="map" height="500"><g id="viewbox"/></svg>',
    '<svg id="map" width="1000" height="500" viewBox="1 0 1000 500"><g id="viewbox"/></svg>',
    '<svg id="map" width="1000" height="500" viewBox="0 0 500 500"><g id="viewbox"/></svg>',
    '<svg id="map" width="1000" height="500"><g id="viewbox" transform="scale(2)"/></svg>'
  ])("rejects ambiguous file canvas %s", svg => {
    const records = data();
    records[5] = svg;
    expect(() => observe(records)).toThrow();
  });
  it("accepts the normal absent viewBox, rejecting even a matching explicit one", () => {
    expect(observe().size).toEqual(GRAPH);
    const records = data();
    records[5] = records[5].replace('height="500"', 'height="500" viewBox="0,0,1000,500"');
    expect(() => observe(records)).toThrow(/viewBox/);
  });
  it("does not use header dimensions, legacy coordinates or the expected frame to fill missing observations", () => {
    const records = data();
    records[1] = "{}";
    records[2] = JSON.stringify(COORDINATES);
    expect(() => observe(records)).toThrow();
    const second = data();
    second[0] = second[0].replace("|1000|500|", "|999|500|");
    expect(() => observe(second)).toThrow();
  });
  it.each([
    { burgs: [0, { x: 1, y: 2 }] },
    { markers: [{ i: "0", x: 1, y: 2 }] },
    { addedLabels: [{ i: -1, x: 1, y: 2 }] },
    { markers: [{ i: 0, x: Number.NaN, y: 2 }] },
    { burgs: null },
    { markers: {} },
    { addedLabels: [null] },
    { burgs: [0, { i: 7, x: 1, y: 2 }] }
  ])("rejects malformed active model anchors instead of inventing IDs %j", patch => {
    expect(() => observeAtlasModel({ ...source(), ...patch }, HASH)).toThrow();
  });
  it("reports independently observed hash, frame, size, missing, duplicate and shifted anchors", () => {
    const snapshot = observe();
    const changed = [
      { ...snapshot, sha256: "b".repeat(64) },
      { ...snapshot, frame: { ...snapshot.frame, west: -179 } },
      { ...snapshot, size: { width: 999, height: 500 } },
      { ...snapshot, objects: [] },
      { ...snapshot, objects: [...snapshot.objects, snapshot.objects[1]] },
      {
        ...snapshot,
        objects: snapshot.objects.map(o => (o.kind === "marker" ? { ...o, position: { x: 501, y: 250 } } : o))
      }
    ];
    for (const item of changed) expect(() => assertAtlasSnapshot(manifest(), WORLD, item, "file")).toThrow();
    expect(() => assertAtlasSnapshot(manifest(), WORLD, changed[3], "model")).toThrow(/采用后/);
  });
  it("does not pretend raw file success proves the later live model", () => {
    expect(() => assertAtlasSnapshot(manifest(), WORLD, observe(), "file")).not.toThrow();
    const model = source();
    model.markers = [];
    expect(() => assertAtlasSnapshot(manifest(), WORLD, observeAtlasModel(model, HASH), "model")).toThrow();
  });
});
