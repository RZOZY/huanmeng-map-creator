import { describe, expect, it } from "vitest";
import {
  AtlasManifestError,
  type AtlasManifestErrorCode,
  parseAtlasManifest,
  selectLocalMap,
  serializeAtlasManifest,
  verifyMapSnapshot
} from "./manifest";

const PROJECT = "10000000-0000-4000-8000-000000000001";
const WORLD = "20000000-0000-4000-8000-000000000001";
const LOCAL = "20000000-0000-4000-8000-000000000002";
const OTHER = "20000000-0000-4000-8000-000000000003";
const PLACE = "30000000-0000-4000-8000-000000000001";
const PLACE2 = "30000000-0000-4000-8000-000000000002";
const HASH = "a".repeat(64);
const GLOBAL = { west: -180, east: 180, south: -90, north: 90 };
const DETAIL = { west: 170, east: 190, south: -10, north: 10 };

function map(id = WORLD, kind = "world", frame = GLOBAL) {
  return {
    id,
    name: kind === "world" ? "世界图" : "海峡详图",
    kind,
    asset: { path: kind === "world" ? "maps/世界.map" : `maps/${id}.map`, sha256: HASH },
    projection: "equirectangular",
    provenance: "从原始地形与正式坐标记录导入",
    frame: { ...frame },
    size: { width: 1000, height: 500 },
    geographicRevision: 3,
    detailLevel: kind === "world" ? 0 : 1,
    parent: kind === "world" ? null : { mapId: WORLD, geographicRevision: 3 },
    georeference: { verified: true, evidence: "经独立坐标锚点核对，来源记录保持在项目内" }
  };
}

function place(id = PLACE) {
  return {
    id,
    name: "港湾 <Alpha>",
    kind: "聚落",
    coordinate: { longitude: -175.123456789, latitude: 1.234567891 },
    provenance: "调查记录一号；名字不是稳定身份",
    revision: 1,
    bindings: [{ mapId: LOCAL, kind: "marker", objectId: 0, geographicRevision: 3 }]
  };
}

function fixture() {
  return {
    schemaVersion: 1,
    project: { id: PROJECT, name: "同一世界" },
    worldMapId: WORLD,
    maps: [map(), map(LOCAL, "local", DETAIL)],
    places: [place()]
  };
}

function parse(value: unknown) {
  return parseAtlasManifest(JSON.stringify(value));
}

function expectError(action: () => unknown, code: AtlasManifestErrorCode, path?: string) {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(AtlasManifestError);
    expect(error).toMatchObject({ code, ...(path ? { path } : {}) });
    return;
  }
  expect.unreachable(`Expected ${code}`);
}

describe("versioned atlas manifest", () => {
  it("round-trips full precision, Unicode, custom names and map-local zero IDs without touching .map", () => {
    const raw = fixture();
    const before = JSON.stringify(raw);
    const atlas = parse(raw);
    expect(atlas.places[0].coordinate).toEqual(raw.places[0].coordinate);
    expect(atlas.places[0].name).toBe("港湾 <Alpha>");
    expect(atlas.places[0].bindings[0].objectId).toBe(0);
    expect(parseAtlasManifest(serializeAtlasManifest(atlas))).toEqual(atlas);
    expect(JSON.stringify(raw)).toBe(before);
    expect(Object.isFrozen(atlas)).toBe(true);
    expect(Object.isFrozen(atlas.maps[1].frame)).toBe(true);
    expect(Object.isFrozen(atlas.places[0].bindings[0])).toBe(true);
  });

  it("keeps place identity and coordinates when renamed, reordered or given a new local object", () => {
    const raw = fixture();
    const before = parse(raw);
    raw.places[0].name = "新港名";
    raw.places[0].bindings[0].objectId = 42;
    raw.maps.reverse();
    const after = parse(raw);
    expect(after.places[0].id).toBe(before.places[0].id);
    expect(after.places[0].coordinate).toEqual(before.places[0].coordinate);
    expect(after.places[0].bindings[0].objectId).toBe(42);
  });

  it.each(["{", "null", "[]", '"text"', "1", "true"])("rejects malformed JSON structure %s", json => {
    expect(() => parseAtlasManifest(json)).toThrow(AtlasManifestError);
  });

  it("rejects unknown versions and unknown fields instead of silently discarding future data", () => {
    expectError(() => parse({ ...fixture(), schemaVersion: 2 }), "UNSUPPORTED_VERSION");
    expectError(() => parse({ ...fixture(), seed: 42 }), "INVALID_FIELD", "$.seed");
    const raw = fixture();
    Object.assign(raw.maps[1].frame, { lonT: 20 });
    expectError(() => parse(raw), "INVALID_FIELD", "$.maps[1].frame.lonT");
  });

  it("rejects prototype-looking JSON keys", () => {
    const json = JSON.stringify(fixture()).replace('"schemaVersion":1', '"schemaVersion":1,"__proto__":{}');
    expectError(() => parseAtlasManifest(json), "INVALID_FIELD", "$.__proto__");
    expect(Object.hasOwn({}, "polluted")).toBe(false);
  });

  it.each([
    ["/absolute.map"],
    ["../world.map"],
    ["maps/../world.map"],
    ["maps/./world.map"],
    ["maps//world.map"],
    ["C:world.map"],
    ["C:/world.map"],
    ["//server/world.map"],
    ["maps\\world.map"],
    ["https://host/world.map"],
    ["maps/a%2f..%2fsecret.map"],
    ["%252e%252e%255csecret.map"],
    ["world.map?download=1"],
    ["world.map#anchor"],
    ["world.map "],
    [" maps/world.map"],
    ["maps /world.map"],
    ["NUL.map"],
    ["maps/CON/world.map"],
    ["maps/aux.MAP"],
    ["a\u0000.map"],
    ["a\n.map"],
    ["maps/a|b.map"],
    ["maps/a*.map"],
    ["maps/a<.map"],
    ["maps/world.json"],
    [""]
  ])("rejects unsafe or non-.map relative asset %j", path => {
    const raw = fixture();
    raw.maps[0].asset.path = path;
    expectError(() => parse(raw), "INVALID_ASSET_PATH");
  });

  it("permits a relative Unicode asset with internal spaces, but rejects case-alias duplicates", () => {
    const raw = fixture();
    raw.maps[0].asset.path = "地图目录/世界 地图.MAP";
    expect(parse(raw).maps[0].asset.path).toBe("地图目录/世界 地图.MAP");
    raw.maps[1].asset.path = "地图目录/世界 地图.map";
    expectError(() => parse(raw), "DUPLICATE_ASSET");
  });

  it("canonicalizes UUID case and catches cross-entity collisions", () => {
    const raw = fixture();
    raw.project.id = "A0000000-0000-4000-8000-000000000001";
    expect(parse(raw).project.id).toBe(raw.project.id.toLowerCase());
    raw.places[0].id = LOCAL;
    expectError(() => parse(raw), "DUPLICATE_ID");
  });

  it.each(["not-a-uuid", "00000000-0000-0000-0000-000000000000", "x".repeat(36)])("rejects invalid UUID %s", id => {
    const raw = fixture();
    raw.project.id = id;
    expectError(() => parse(raw), "INVALID_FIELD");
  });

  it("requires exactly one world map referenced by worldMapId", () => {
    const raw = fixture();
    raw.worldMapId = LOCAL;
    expectError(() => parse(raw), "INVALID_REFERENCE");
    raw.worldMapId = WORLD;
    raw.maps[1] = map(LOCAL);
    raw.maps[1].asset.path = "second-world.map";
    expectError(() => parse(raw), "INVALID_REFERENCE");
  });

  it("rejects stale parent revision, non-world parents and invalid levels", () => {
    const raw = fixture();
    raw.maps[1].parent!.geographicRevision = 2;
    expectError(() => parse(raw), "STALE_REFERENCE");
    raw.maps[1].parent!.geographicRevision = 3;
    raw.maps[1].parent!.mapId = LOCAL;
    expectError(() => parse(raw), "INVALID_REFERENCE");
    raw.maps[1].parent!.mapId = WORLD;
    raw.maps[1].detailLevel = 0;
    expectError(() => parse(raw), "INVALID_FIELD");
  });

  it("rejects a child interval crossing a missing parent arc even when both endpoints are inside", () => {
    const raw = fixture();
    raw.maps[0].frame = { west: -170, east: 170, south: -90, north: 90 };
    raw.maps[1].frame = { west: 160, east: 200, south: -10, north: 10 };
    raw.places = [];
    expectError(() => parse(raw), "FRAME_OUTSIDE_PARENT");
  });

  it("accepts any valid child longitude arc inside a full-world parent with a shifted seam", () => {
    const raw = fixture();
    raw.maps[0].frame = { west: 20, east: 380, south: -90, north: 90 };
    raw.maps[1].frame = { west: 10, east: 30, south: -10, north: 10 };
    raw.places = [];
    expect(parse(raw).maps[1].frame).toEqual(raw.maps[1].frame);
  });

  it("accepts a partial-world parent and child using different unwrapped aliases", () => {
    const raw = fixture();
    raw.maps[0].frame = { west: 150, east: 220, south: -30, north: 30 };
    raw.maps[1].frame = { west: -180, east: -160, south: -10, north: 10 };
    raw.places = [];
    expect(parse(raw).maps).toHaveLength(2);
    raw.maps[1].frame.north = 31;
    expectError(() => parse(raw), "FRAME_OUTSIDE_PARENT");
  });

  it.each([
    { west: 170, east: -170, south: -10, north: 10 },
    { west: -180, east: 181, south: -10, north: 10 },
    { west: 180, east: 190, south: -10, north: 10 },
    { west: 170, east: 190, south: 10, north: 10 },
    { west: 170, east: 190, south: -91, north: 10 }
  ])("rejects invalid or ambiguous frames %j", frame => {
    const raw = fixture();
    raw.maps[1].frame = frame;
    expectError(() => parse(raw), "INVALID_FIELD");
  });

  it("rejects projection mismatches, missing source evidence, invalid sizes and hashes", () => {
    const raw = fixture();
    raw.maps[0].projection = "mercator";
    expectError(() => parse(raw), "INVALID_FIELD");
    raw.maps[0].projection = "equirectangular";
    raw.maps[0].georeference.evidence = " ";
    expectError(() => parse(raw), "INVALID_FIELD");
    raw.maps[0].georeference.evidence = "证据";
    raw.maps[0].size.width = 0;
    expectError(() => parse(raw), "INVALID_FIELD");
    raw.maps[0].size.width = 1000;
    raw.maps[0].asset.sha256 = "a".repeat(63);
    expectError(() => parse(raw), "INVALID_FIELD");
  });

  it("allows one place to bind several object kinds and maps without treating local IDs as global", () => {
    const raw = fixture();
    raw.places[0].bindings.push({ mapId: LOCAL, kind: "burg", objectId: 1, geographicRevision: 3 });
    raw.places[0].bindings.push({ mapId: WORLD, kind: "marker", objectId: 0, geographicRevision: 3 });
    expect(parse(raw).places[0].bindings).toHaveLength(3);
  });

  it("rejects object ownership collisions, duplicate bindings, invalid IDs and stale bindings", () => {
    const raw = fixture();
    raw.places.push(place(PLACE2));
    expectError(() => parse(raw), "DUPLICATE_BINDING");
    raw.places.pop();
    raw.places[0].bindings.push({ ...raw.places[0].bindings[0] });
    expectError(() => parse(raw), "DUPLICATE_BINDING");
    raw.places[0].bindings.pop();
    raw.places[0].bindings[0].kind = "burg";
    expectError(() => parse(raw), "INVALID_FIELD");
    raw.places[0].bindings[0].kind = "marker";
    raw.places[0].bindings[0].objectId = Number.MAX_SAFE_INTEGER + 1;
    expectError(() => parse(raw), "INVALID_FIELD");
    raw.places[0].bindings[0].objectId = 0;
    raw.places[0].bindings[0].geographicRevision = 2;
    expectError(() => parse(raw), "STALE_REFERENCE");
  });

  it("rejects bindings outside map coverage and dangling map references", () => {
    const raw = fixture();
    raw.places[0].coordinate.longitude = 100;
    expectError(() => parse(raw), "BINDING_OUTSIDE_MAP");
    raw.places[0].coordinate.longitude = -175;
    raw.places[0].bindings[0].mapId = OTHER;
    expectError(() => parse(raw), "INVALID_REFERENCE");
  });
});

describe("additional manifest boundaries", () => {
  it("rejects canonical output overflow at parse time instead of accepting an unwritable manifest", () => {
    const raw = fixture();
    raw.maps = [raw.maps[0]];
    raw.places = [];
    const template = { ...place(), name: "地".repeat(512), provenance: "源".repeat(4096), bindings: [] };
    const count = Math.floor((3_950_000 - JSON.stringify(raw).length) / (JSON.stringify(template).length + 1));
    raw.places = Array.from({ length: count }, (_, index) => ({
      ...template,
      id: `30000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`
    }));
    expect(JSON.stringify(raw).length).toBeLessThan(4_000_000);
    expect(JSON.stringify(raw, null, 2).length).toBeGreaterThan(4_000_000);
    expectError(() => parse(raw), "INVALID_JSON");
  });
  it("accepts a world-only project and duplicate display names without conflating identities", () => {
    const raw = fixture();
    raw.maps = [map()];
    raw.places = [];
    expect(parse(raw).maps).toHaveLength(1);
    raw.maps.push(map(LOCAL, "local", DETAIL));
    raw.maps[1].name = raw.maps[0].name;
    raw.places = [place(), place(PLACE2)];
    raw.places[1].bindings[0].objectId = 1;
    expect(parse(raw).places.map(item => item.name)).toEqual(["港湾 <Alpha>", "港湾 <Alpha>"]);
  });

  it.each([-91, 91, NaN, Infinity])("rejects invalid latitude %s with a manifest domain error", latitude => {
    const raw = fixture();
    raw.places[0].coordinate.latitude = latitude;
    expectError(() => parse(raw), "INVALID_FIELD");
  });

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1, "3"])("rejects non-revision value %j", geographicRevision => {
    const raw = fixture();
    expectError(() => parse({ ...raw, maps: [{ ...raw.maps[0], geographicRevision }, raw.maps[1]] }), "INVALID_FIELD");
  });

  it("rejects duplicate UUIDs that differ only by letter case", () => {
    const raw = fixture();
    raw.project.id = "a0000000-0000-4000-8000-000000000001";
    raw.places[0].id = raw.project.id.toUpperCase();
    expectError(() => parse(raw), "DUPLICATE_ID");
  });

  it.each(["COM¹.map", "LPT².map", "maps/CONIN$.map", "CONOUT$.map", "CLOCK$.map"])(
    "rejects additional Windows device alias %s",
    path => {
      const raw = fixture();
      raw.maps[0].asset.path = path;
      expectError(() => parse(raw), "INVALID_ASSET_PATH");
    }
  );
});

describe("deterministic local-map selection", () => {
  it("keeps log-area ordering for subnormal spans instead of underflowing both areas to zero", () => {
    const raw = fixture();
    raw.maps[1].frame = { west: 0, east: 2 * Number.MIN_VALUE, south: 0, north: 2 * Number.MIN_VALUE };
    raw.maps.push(map(OTHER, "local", { west: 0, east: Number.MIN_VALUE, south: 0, north: Number.MIN_VALUE }));
    raw.places = [];
    expect(selectLocalMap(parse(raw), { longitude: 0, latitude: 0 })?.id).toBe(OTHER);
  });

  it("does not reverse coverage order when a polar midpoint rounds onto the pole", () => {
    const raw = fixture();
    const d = 2 ** -46;
    raw.maps[1].frame = { west: 0, east: 100, south: 90 - d, north: 90 };
    raw.maps.push(map(OTHER, "local", { west: 0, east: 30, south: 90 - 2 * d, north: 90 - d }));
    raw.places = [];
    expect(selectLocalMap(parse(raw), { longitude: 0, latitude: 90 - d })?.id).toBe(OTHER);
  });

  it.each([-175, 185, 905])("selects the same map for equivalent longitude %s without rewriting it", longitude => {
    const raw = fixture();
    raw.places[0].coordinate.longitude = longitude;
    const atlas = parse(raw);
    expect(atlas.places[0].coordinate.longitude).toBe(longitude);
    expect(selectLocalMap(atlas, { longitude, latitude: 0 })?.id).toBe(LOCAL);
  });
  it("selects a verified covering local map and never uses name or load order as identity", () => {
    const raw = fixture();
    const broad = map(OTHER, "local", { west: 165, east: 200, south: -20, north: 20 });
    raw.maps.push(broad);
    const point = { longitude: -175, latitude: 0 };
    expect(selectLocalMap(parse(raw), point)?.id).toBe(LOCAL);
    raw.maps.reverse();
    expect(selectLocalMap(parse(raw), point)?.id).toBe(LOCAL);
    raw.maps.find(item => item.id === OTHER)!.detailLevel = 2;
    expect(selectLocalMap(parse(raw), point)?.id).toBe(OTHER);
  });

  it("uses spherical coverage for area ties, then ASCII UUID order", () => {
    const raw = fixture();
    raw.maps[1].frame = { west: -10, east: 10, south: -10, north: 10 };
    const other = map(OTHER, "local", { west: -10, east: 10, south: 0, north: 20 });
    raw.maps.push(other);
    raw.places = [];
    expect(selectLocalMap(parse(raw), { longitude: 0, latitude: 5 })?.id).toBe(OTHER);
    other.frame = { ...raw.maps[1].frame };
    raw.maps.reverse();
    expect(selectLocalMap(parse(raw), { longitude: 0, latitude: 5 })?.id).toBe(LOCAL);
  });

  it("returns no candidate outside coverage or when geography is unverified", () => {
    const raw = fixture();
    expect(selectLocalMap(parse(raw), { longitude: 0, latitude: 0 })).toBeNull();
    raw.maps[1].georeference = { verified: false, evidence: "尚未测绘" };
    expect(selectLocalMap(parse(raw), { longitude: -175, latitude: 0 })).toBeNull();
    raw.maps[1].georeference.verified = true;
    raw.maps[0].georeference.verified = false;
    expect(selectLocalMap(parse(raw), { longitude: -175, latitude: 0 })).toBeNull();
    expect(() => selectLocalMap(parse(raw), { longitude: NaN, latitude: 0 })).toThrow();
  });
});

describe("loaded-map identity and binding checks", () => {
  it.each([undefined, null, {}, { sha256: HASH }])("never reports success for missing observation %j", observation => {
    expect(verifyMapSnapshot(parse(fixture()), LOCAL, observation).length).toBeGreaterThan(0);
  });

  it("does not reorder, mutate or freeze caller-owned observations", () => {
    const atlas = parse(fixture());
    const observation = snapshot();
    const before = structuredClone(observation);
    const mapOrder = atlas.maps.map(item => item.id);
    selectLocalMap(atlas, { longitude: 185, latitude: 0 });
    serializeAtlasManifest(atlas);
    expect(verifyMapSnapshot(atlas, LOCAL, observation)).toEqual([]);
    expect(observation).toEqual(before);
    expect(Object.isFrozen(observation)).toBe(false);
    expect(Object.isFrozen(observation.objects[0].position)).toBe(false);
    expect(atlas.maps.map(item => item.id)).toEqual(mapOrder);
  });
  function snapshot() {
    const x = ((360 - 175.123456789 - 170) / 20) * 1000;
    const y = ((10 - 1.234567891) / 20) * 500;
    return {
      sha256: HASH,
      projection: "equirectangular",
      frame: { ...DETAIL },
      size: { width: 1000, height: 500 },
      objects: [{ kind: "marker" as const, objectId: 0, position: { x, y } }]
    };
  }

  it("checks a separately observed asset/frame/canvas/object snapshot without mutation", () => {
    const atlas = parse(fixture());
    const observation = snapshot();
    const before = JSON.stringify(observation);
    expect(verifyMapSnapshot(atlas, LOCAL, observation)).toEqual([]);
    expect(JSON.stringify(observation)).toBe(before);
  });

  it.each([
    ["sha256", "b".repeat(64), "ASSET_CHANGED"],
    ["projection", "mercator", "PROJECTION_MISMATCH"],
    ["frame", { ...DETAIL, east: 191 }, "FRAME_MISMATCH"],
    ["size", { width: 2000, height: 500 }, "SIZE_MISMATCH"]
  ])("refuses %s mismatch rather than silently aligning", (key, value, code) => {
    const observation = { ...snapshot(), [key]: value };
    const issues = verifyMapSnapshot(parse(fixture()), LOCAL, observation);
    expect(issues.map(issue => issue.code)).toContain(code);
    expect(issues.some(issue => issue.code === "POSITION_MISMATCH")).toBe(false);
  });

  it("detects missing, duplicate, invalid and misplaced bound objects including valid marker ID zero", () => {
    const atlas = parse(fixture());
    const observation = snapshot();
    observation.objects[0].position.x += 0.01;
    expect(verifyMapSnapshot(atlas, LOCAL, observation).map(issue => issue.code)).toContain("POSITION_MISMATCH");
    observation.objects[0].position.x = NaN;
    expect(verifyMapSnapshot(atlas, LOCAL, observation).map(issue => issue.code)).toContain("INVALID_OBJECT");
    observation.objects = [];
    expect(verifyMapSnapshot(atlas, LOCAL, observation).map(issue => issue.code)).toContain("MISSING_OBJECT");
    observation.objects = [snapshot().objects[0], snapshot().objects[0]];
    expect(verifyMapSnapshot(atlas, LOCAL, observation).map(issue => issue.code)).toContain("DUPLICATE_OBJECT");
  });

  it("never treats an unverified geographic declaration as verified terrain", () => {
    const raw = fixture();
    raw.maps[1].georeference = { verified: false, evidence: "仅声明，未核对地形" };
    expect(verifyMapSnapshot(parse(raw), LOCAL, snapshot()).map(issue => issue.code)).toContain("UNVERIFIED_GEOGRAPHY");
  });
});
