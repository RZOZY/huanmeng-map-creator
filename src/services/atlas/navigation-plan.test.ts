import { describe, expect, it } from "vitest";
import { type GeographicFrame, geographicToPixel } from "./coordinates";
import { parseAtlasManifest } from "./manifest";
import { planAtlasNavigation } from "./navigation-plan";

const PROJECT = "10000000-0000-4000-8000-000000000001";
const WORLD = "a0000000-0000-4000-8000-000000000001";
const LOCAL = "b0000000-0000-4000-8000-000000000002";
const OTHER = "b0000000-0000-4000-8000-000000000003";
const PLACE = "c0000000-0000-4000-8000-000000000001";
const PLACE2 = "c0000000-0000-4000-8000-000000000002";
const MISSING = "d0000000-0000-4000-8000-000000000001";
const GLOBAL: GeographicFrame = { west: -180, east: 180, south: -90, north: 90 };
const DETAIL: GeographicFrame = { west: 170, east: 190, south: -10, north: 10 };

function map(id: string, frame = DETAIL, kind: "local" | "world" = "local") {
  return {
    id,
    name: "同名地图",
    kind,
    asset: { path: `maps/${id}.map`, sha256: "a".repeat(64) },
    projection: "equirectangular",
    provenance: "仅为声明，不是运行态独立观测",
    frame: { ...frame },
    size: { width: 1000, height: 500 },
    geographicRevision: 3,
    detailLevel: kind === "world" ? 0 : 1,
    parent: kind === "world" ? null : { mapId: WORLD, geographicRevision: 3 },
    georeference: { verified: true, evidence: "测试夹具的显式核验记录" }
  };
}

function fixture() {
  return {
    schemaVersion: 1,
    project: { id: PROJECT, name: "测试项目" },
    worldMapId: WORLD,
    maps: [map(WORLD, GLOBAL, "world"), map(LOCAL)],
    places: [
      {
        id: PLACE,
        name: "同名地点",
        kind: "聚落",
        coordinate: { longitude: -175.12345678901235, latitude: 1.2345678901234567 },
        provenance: "地点权威记录，不是地图对象观测",
        revision: 1,
        bindings: [
          { mapId: WORLD, kind: "marker", objectId: 7, geographicRevision: 3 },
          { mapId: LOCAL, kind: "marker", objectId: 7, geographicRevision: 3 }
        ]
      }
    ]
  };
}

function parse(raw: ReturnType<typeof fixture>) {
  return parseAtlasManifest(JSON.stringify(raw));
}

describe("pure atlas navigation planning", () => {
  it("plans a local UUID and continuous map-local pixels without rounding the authoritative coordinate", () => {
    const atlas = parse(fixture());
    const target = atlas.maps[1];
    const coordinate = atlas.places[0].coordinate;
    const result = planAtlasNavigation(atlas, WORLD, PLACE, "local");
    expect(result).toEqual({
      status: "ready",
      targetMapId: LOCAL,
      placeId: PLACE,
      coordinate,
      position: geographicToPixel(coordinate, target.frame, target.size)
    });
    if (result.status !== "ready") return expect.unreachable("Expected a local plan");
    expect(result.coordinate.longitude).toBe(-175.12345678901235);
    expect(result.coordinate.latitude).toBe(1.2345678901234567);
    expect(result.coordinate).not.toBe(coordinate);
    expect(Number.isInteger(result.position.x)).toBe(false);
  });

  it("uses only worldMapId for world navigation, not names, order or the local chooser", () => {
    const raw = fixture();
    raw.maps[1].detailLevel = 99;
    raw.maps.reverse();
    const atlas = parse(raw);
    const result = planAtlasNavigation(atlas, LOCAL, PLACE, "world");
    const world = atlas.maps[1];
    expect(result).toEqual({
      status: "ready",
      targetMapId: WORLD,
      placeId: PLACE,
      coordinate: atlas.places[0].coordinate,
      position: geographicToPixel(atlas.places[0].coordinate, world.frame, world.size)
    });
  });

  it("resolves canonical stable UUIDs despite duplicate names, reordered records and map-local object IDs", () => {
    const raw = fixture();
    raw.places.push({
      ...raw.places[0],
      id: PLACE2,
      coordinate: { longitude: 175, latitude: -5 },
      bindings: []
    });
    raw.places.reverse();
    raw.maps.reverse();
    const result = planAtlasNavigation(parse(raw), WORLD.toUpperCase(), PLACE.toUpperCase(), "local");
    expect(result).toMatchObject({
      status: "ready",
      targetMapId: LOCAL,
      placeId: PLACE,
      coordinate: fixture().places[0].coordinate
    });
  });

  it("does not require bindings or invent a shared cell/object to locate the place", () => {
    const raw = fixture();
    raw.places[0].bindings = [];
    expect(planAtlasNavigation(parse(raw), WORLD, PLACE, "local")).toMatchObject({
      status: "ready",
      targetMapId: LOCAL,
      coordinate: raw.places[0].coordinate
    });
  });

  it.each([-175, 185, 905])("keeps original longitude %s while using the existing dateline conversion", longitude => {
    const raw = fixture();
    raw.places[0].coordinate = { longitude, latitude: 0 };
    expect(planAtlasNavigation(parse(raw), WORLD, PLACE, "local")).toEqual({
      status: "ready",
      targetMapId: LOCAL,
      placeId: PLACE,
      coordinate: { longitude, latitude: 0 },
      position: { x: 750, y: 250 }
    });
  });

  it.each([
    [20, 0],
    [380, 1000],
    [740, 0]
  ])("preserves shifted-world seam longitude %s at x=%s", (longitude, x) => {
    const raw = fixture();
    raw.maps[0].frame = { ...GLOBAL, west: 20, east: 380 };
    raw.maps[1].frame = { ...DETAIL, west: 10, east: 30 };
    raw.places[0].coordinate = { longitude, latitude: 0 };
    expect(planAtlasNavigation(parse(raw), LOCAL, PLACE, "world")).toEqual({
      status: "ready",
      targetMapId: WORLD,
      placeId: PLACE,
      coordinate: { longitude, latitude: 0 },
      position: { x, y: 250 }
    });
  });

  it.each([
    { south: 89.99, north: 90, latitude: 90, y: 0 },
    { south: 89.99, north: 90, latitude: 89.99, y: 500 },
    { south: -90, north: -89.99, latitude: -90, y: 500 }
  ])("handles inclusive polar bounds without clipping or snapping: %j", ({ south, north, latitude, y }) => {
    const raw = fixture();
    raw.maps[1].frame = { ...DETAIL, south, north };
    raw.places[0].coordinate = { longitude: -175, latitude };
    expect(planAtlasNavigation(parse(raw), WORLD, PLACE, "local")).toEqual({
      status: "ready",
      targetMapId: LOCAL,
      placeId: PLACE,
      coordinate: { longitude: -175, latitude },
      position: { x: 750, y }
    });
  });

  it("supports a non-global world's unwrapped alias without treating missing local coverage as a world fallback", () => {
    const raw = fixture();
    raw.maps[0].frame = { west: 150, east: 220, south: -30, north: 30 };
    raw.maps[1].frame = { ...DETAIL, west: -180, east: -160 };
    expect(planAtlasNavigation(parse(raw), WORLD, PLACE, "local")).toMatchObject({
      status: "ready",
      targetMapId: LOCAL
    });
    raw.places[0].coordinate.longitude = 160;
    raw.places[0].bindings = [];
    expect(planAtlasNavigation(parse(raw), WORLD, PLACE, "local")).toEqual({
      status: "none",
      reason: "NO_LOCAL_MAP"
    });
  });

  it("does not invent a target when the manifest contains no local maps", () => {
    const raw = fixture();
    raw.maps = [raw.maps[0]];
    raw.places[0].bindings = [];
    expect(planAtlasNavigation(parse(raw), WORLD, PLACE, "local")).toEqual({
      status: "none",
      reason: "NO_LOCAL_MAP"
    });
  });

  it.each([MISSING, "同名地图", ""])("rejects missing current identity %j instead of guessing", currentMapId => {
    expect(planAtlasNavigation(parse(fixture()), currentMapId, PLACE, "local")).toEqual({
      status: "none",
      reason: "CURRENT_MAP_NOT_FOUND"
    });
  });

  it.each([MISSING, "同名地点", ""])("rejects missing place identity %j instead of guessing", placeId => {
    expect(planAtlasNavigation(parse(fixture()), WORLD, placeId, "local")).toEqual({
      status: "none",
      reason: "PLACE_NOT_FOUND"
    });
  });

  it("returns none for the current world instead of planning a reload", () => {
    expect(planAtlasNavigation(parse(fixture()), WORLD, PLACE, "world")).toEqual({
      status: "none",
      reason: "SAME_MAP"
    });
  });

  it("keeps the chooser's winning current local as none instead of selecting a weaker alternative", () => {
    const raw = fixture();
    raw.maps[1].detailLevel = 2;
    raw.maps.push(map(OTHER));
    expect(planAtlasNavigation(parse(raw), LOCAL, PLACE, "local")).toEqual({
      status: "none",
      reason: "SAME_MAP"
    });
  });

  it("rejects an unverified current map even when its source text claims alignment", () => {
    const raw = fixture();
    raw.maps[1].georeference.verified = false;
    raw.maps[1].provenance = "已核验且与世界天然同源";
    expect(planAtlasNavigation(parse(raw), LOCAL, PLACE, "world")).toEqual({
      status: "none",
      reason: "UNVERIFIED_CURRENT_MAP"
    });
  });

  it.each(["local", "world"] as const)("rejects an unverified world for %s navigation", direction => {
    const raw = fixture();
    raw.maps[0].georeference.verified = false;
    expect(planAtlasNavigation(parse(raw), LOCAL, PLACE, direction)).toEqual({
      status: "none",
      reason: "UNVERIFIED_WORLD_MAP"
    });
  });

  it("excludes an unverified local candidate and reports none when no verified local remains", () => {
    const raw = fixture();
    raw.maps[1].detailLevel = 99;
    raw.maps[1].georeference.verified = false;
    raw.maps.push(map(OTHER));
    expect(planAtlasNavigation(parse(raw), WORLD, PLACE, "local")).toMatchObject({
      status: "ready",
      targetMapId: OTHER
    });
    raw.maps.pop();
    expect(planAtlasNavigation(parse(raw), WORLD, PLACE, "local")).toEqual({
      status: "none",
      reason: "NO_LOCAL_MAP"
    });
  });

  it.each([
    { order: "detail", winner: LOCAL },
    { order: "area", winner: OTHER },
    { order: "uuid", winner: LOCAL }
  ])("delegates overlapping candidate priority to the deterministic chooser: $order", ({ order, winner }) => {
    const raw = fixture();
    const other = map(OTHER);
    if (order !== "uuid") other.frame = { ...DETAIL, east: 188 };
    if (order === "detail") raw.maps[1].detailLevel = 2;
    other.size = { width: 2, height: 3 };
    raw.maps.push(other);
    raw.maps.reverse();
    expect(planAtlasNavigation(parse(raw), WORLD, PLACE, "local")).toMatchObject({
      status: "ready",
      targetMapId: winner
    });
  });

  it("does not mutate the parsed manifest, place precision or candidate order and produces independent plan values", () => {
    const raw = fixture();
    raw.maps.push(map(OTHER));
    const atlas = parse(raw);
    const before = JSON.stringify(atlas);
    const first = planAtlasNavigation(atlas, WORLD, PLACE, "local");
    const second = planAtlasNavigation(atlas, WORLD, PLACE, "local");
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(JSON.stringify(atlas)).toBe(before);
    expect(Object.isFrozen(atlas)).toBe(true);
    if (first.status !== "ready" || second.status !== "ready") return expect.unreachable("Expected plans");
    expect(first.coordinate).not.toBe(second.coordinate);
    expect(first.position).not.toBe(second.position);
    expect(Object.keys(first).sort()).toEqual(["coordinate", "placeId", "position", "status", "targetMapId"]);
  });
});
