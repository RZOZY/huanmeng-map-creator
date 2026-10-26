import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { beginMapIO } from "@/services/io/map-io";
import { getMapModelEpoch, markMapModelStable, markMapModelUnstable } from "@/services/io/model-status";
import { getCurrentAtlasIdentity, recordVerifiedAtlasIdentity } from "./identity";
import { parseAtlasManifest } from "./manifest";

const WORLD = "a0000000-0000-4000-8000-00000000000a";
const PROJECT = "b0000000-0000-4000-8000-00000000000b";
const SHA = "a".repeat(64);
function manifest(name = "User <Alpha> \u202e") {
  return parseAtlasManifest(
    JSON.stringify({
      schemaVersion: 1,
      project: { id: PROJECT.toUpperCase(), name },
      worldMapId: WORLD.toUpperCase(),
      maps: [
        {
          id: WORLD.toUpperCase(),
          name: "World Name",
          kind: "world",
          asset: { path: "maps/world.map", sha256: SHA },
          projection: "equirectangular",
          provenance: "fixture only",
          frame: { west: -180, east: 180, north: 90, south: -90 },
          size: { width: 1000, height: 500 },
          geographicRevision: 3,
          detailLevel: 0,
          parent: null,
          georeference: { verified: true, evidence: "fixture" }
        }
      ],
      places: []
    })
  );
}
const record = (epoch = getMapModelEpoch()) =>
  recordVerifiedAtlasIdentity(manifest(), WORLD.toUpperCase(), SHA.toUpperCase(), epoch);
beforeEach(() => {
  markMapModelUnstable();
  markMapModelStable();
});
afterEach(markMapModelStable);

describe("session-only adopted atlas source identity", () => {
  it("starts unknown and never invents identity from a stable model", () => {
    expect(getCurrentAtlasIdentity()).toBeNull();
    markMapModelStable();
    expect(getCurrentAtlasIdentity()).toBeNull();
  });
  it("records immutable canonical source fields, not a File, full manifest or content-current claim", () => {
    const epoch = getMapModelEpoch();
    expect(record()).toBe(true);
    expect(getCurrentAtlasIdentity()).toEqual({
      projectId: PROJECT,
      projectName: "User <Alpha> \u202e",
      mapId: WORLD,
      mapName: "World Name",
      mapKind: "world",
      geographicRevision: 3,
      sourceAssetSha256: SHA,
      replacementEpoch: epoch
    });
    expect(Object.isFrozen(getCurrentAtlasIdentity())).toBe(true);
  });
  it("preserves the adopted source while another operation only prepares", () => {
    expect(record()).toBe(true);
    const identity = getCurrentAtlasIdentity();
    const lease = beginMapIO("load");
    try {
      expect(getCurrentAtlasIdentity()).toBe(identity);
    } finally {
      lease!.release();
    }
  });
  it("can record while a later operation only holds a preparation lease", () => {
    const epoch = getMapModelEpoch();
    const lease = beginMapIO("load");
    try {
      expect(record(epoch)).toBe(true);
    } finally {
      lease!.release();
    }
  });
  it("invalidates at replacement start, and stable later never resurrects it", () => {
    expect(record()).toBe(true);
    markMapModelUnstable();
    expect(getCurrentAtlasIdentity()).toBeNull();
    markMapModelStable();
    expect(getCurrentAtlasIdentity()).toBeNull();
  });
  it("detects a replacement even when no one read the identity while unstable", () => {
    expect(record()).toBe(true);
    markMapModelUnstable();
    markMapModelStable();
    expect(getCurrentAtlasIdentity()).toBeNull();
  });
  it("does not publish before adoption settles", () => {
    markMapModelUnstable();
    expect(record()).toBe(false);
    expect(getCurrentAtlasIdentity()).toBeNull();
  });
  it("does not let a stale success overwrite a newer adopted source", () => {
    const oldEpoch = getMapModelEpoch();
    expect(record()).toBe(true);
    markMapModelUnstable();
    markMapModelStable();
    expect(recordVerifiedAtlasIdentity(manifest("New source"), WORLD, SHA, getMapModelEpoch())).toBe(true);
    const current = getCurrentAtlasIdentity();
    expect(record(oldEpoch)).toBe(false);
    expect(getCurrentAtlasIdentity()).toBe(current);
    expect(current?.projectName).toBe("New source");
  });
  it.each([-1, NaN, Infinity])("rejects an invalid or mismatched epoch %s", epoch => {
    expect(record(epoch)).toBe(false);
    expect(getCurrentAtlasIdentity()).toBeNull();
  });
  it("rejects a different map, source hash or unverified claim without erasing current identity", () => {
    expect(record()).toBe(true);
    const old = getCurrentAtlasIdentity();
    const data = manifest();
    expect(recordVerifiedAtlasIdentity(data, "c0000000-0000-4000-8000-00000000000c", SHA, getMapModelEpoch())).toBe(
      false
    );
    expect(recordVerifiedAtlasIdentity(data, WORLD, "b".repeat(64), getMapModelEpoch())).toBe(false);
    const unverified = parseAtlasManifest(
      JSON.stringify({ ...data, maps: [{ ...data.maps[0], georeference: { verified: false, evidence: "" } }] })
    );
    expect(recordVerifiedAtlasIdentity(unverified, WORLD, SHA, getMapModelEpoch())).toBe(false);
    expect(getCurrentAtlasIdentity()).toBe(old);
  });
  it("may retain the lineage through later metadata edits; it is never a live-model checksum", () => {
    expect(record()).toBe(true);
    const identity = getCurrentAtlasIdentity();
    const liveModel = { coordinates: { lonW: -180 }, marker: { x: 500 } };
    liveModel.coordinates.lonW = -150;
    liveModel.marker.x = 20;
    expect(getCurrentAtlasIdentity()).toBe(identity);
    expect(identity?.sourceAssetSha256).toBe(SHA);
    expect(identity).not.toHaveProperty("liveVerified");
    expect(identity).not.toHaveProperty("currentSha256");
  });
});
