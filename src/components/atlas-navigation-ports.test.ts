// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { viewport } from "@/components/viewport";
import { getMapModelEpoch, markMapModelStable, markMapModelUnstable } from "@/services/io/model-status";
import { createAtlasNavigationPorts } from "./atlas-navigation-ports";

const mocks = vi.hoisted(() => ({ stop: vi.fn(), zoom: vi.fn(), load: vi.fn() }));
vi.mock("@/components/zoom", () => ({ stopMapZoom: mocks.stop, zoomTo: mocks.zoom }));
vi.mock("@/services", () => ({ Services: { Load: { uploadAtlasMapWithReceipt: mocks.load } } }));

beforeEach(() => {
  mocks.stop.mockReset();
  mocks.zoom.mockReset();
  mocks.load.mockReset();
  Object.assign(viewport, { width: 800, height: 600, x: -200, y: -100, scale: 2 });
  vi.stubGlobal("options", {
    map: {
      graph: { width: 1000, height: 500 },
      geography: {
        coordinates: { lonW: -180, lonE: 180, lonT: 360, latN: 90, latS: -90, latT: 180 }
      }
    }
  });
  vi.stubGlobal("pack", { burgs: [{ i: 0 }], markers: [{ i: 7, x: 123.125, y: 234.5 }], addedLabels: [] });
  markMapModelUnstable();
  markMapModelStable();
});
afterEach(() => vi.unstubAllGlobals());

describe("actual Atlas navigation adapters", () => {
  it("stops and flushes zoom before capturing model-space center, without rounding", () => {
    mocks.stop.mockImplementation(() => Object.assign(viewport, { x: -201.25, y: -102.5, scale: 2.5 }));
    const view = createAtlasNavigationPorts().captureView();
    expect(mocks.stop).toHaveBeenCalledOnce();
    expect(view).toEqual({ x: 240.5, y: 161, scale: 2.5 });
    expect(Object.isFrozen(view)).toBe(true);
  });
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid capture scale %s", scale => {
    viewport.scale = scale;
    expect(() => createAtlasNavigationPorts().captureView()).toThrow();
    expect(mocks.stop).toHaveBeenCalledOnce();
  });
  it.each([0, Number.NaN])("rejects a not-ready viewport width %s", width => {
    viewport.width = width;
    expect(() => createAtlasNavigationPorts().captureView()).toThrow("视窗");
  });
  it("applies synchronously with explicit zero duration", () => {
    const view = { x: 123.125, y: 234.5678901, scale: 3.125 };
    createAtlasNavigationPorts().applyView(view);
    expect(mocks.zoom).toHaveBeenCalledExactlyOnceWith(view.x, view.y, view.scale, 0);
  });
  it.each([
    { x: Number.NaN, y: 1, scale: 1 },
    { x: 1, y: Number.POSITIVE_INFINITY, scale: 1 },
    { x: 1, y: 1, scale: 0 }
  ])("rejects invalid requested views before zoom: %o", view => {
    expect(() => createAtlasNavigationPorts().applyView(view)).toThrow();
    expect(mocks.zoom).not.toHaveBeenCalled();
  });
  it("observes actual globals rather than filling expected frame or object coordinates", () => {
    options.map.geography.coordinates.lonW = -179;
    options.map.geography.coordinates.lonT = 359;
    const snapshot = createAtlasNavigationPorts().observe("a".repeat(64));
    expect(snapshot.frame).toEqual({ west: -179, east: 180, north: 90, south: -90 });
    expect(snapshot.objects).toEqual([{ kind: "marker", objectId: 7, position: { x: 123.125, y: 234.5 } }]);
  });
  it("forwards the exact authorized File, manifest, UUID and final guard without re-sampling the receipt", async () => {
    const file = new File(["bytes"], "target.map");
    const guard = vi.fn(() => false);
    const receipt = Object.freeze({ outcome: { type: "loaded" as const }, replacementEpoch: 17 });
    mocks.load.mockResolvedValue(receipt);
    const result = await createAtlasNavigationPorts().load(file, "manifest bytes", "map UUID", guard);
    expect(mocks.load).toHaveBeenCalledExactlyOnceWith(file, "manifest bytes", "map UUID", { canAdopt: guard });
    expect(guard).not.toHaveBeenCalled();
    expect(result).toBe(receipt);
  });
  it("reads live replacement status without inventing an Atlas source", () => {
    const ports = createAtlasNavigationPorts();
    expect(ports.epoch()).toBe(getMapModelEpoch());
    expect(ports.stable()).toBe(true);
    expect(ports.identity()).toBeNull();
    markMapModelUnstable();
    expect(ports.stable()).toBe(false);
    expect(ports.epoch()).toBe(getMapModelEpoch());
  });
});
