import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Climate } from "./climate-generator";

let calls: string[];

beforeEach(() => {
  calls = [];
  const record = (name: string) => () => calls.push(name);
  vi.stubGlobal("Temperature", { generate: record("temperature") });
  vi.stubGlobal("Precipitation", { generate: record("precipitation") });
  vi.stubGlobal("Rivers", { generate: record("rivers"), specify: record("riverNames") });
  vi.stubGlobal("Biomes", { define: record("biomes") });
  vi.stubGlobal("Features", { defineGroups: record("featureGroups"), defineNames: record("featureNames") });
  vi.stubGlobal("Ice", { generate: record("ice") });
  vi.stubGlobal("pack", { cells: { h: new Float32Array([19.75, 20.5, 60.25]) } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("refreshes climate, hydrology, biomes and ice in order on the existing graph", () => {
  const originalPack = pack;
  const burgs = [{ i: 1, name: "Kept town" }];
  Object.assign(pack, { burgs, addedLabels: [{ i: 1, label: { text: "Kept region" } }] });
  const originalLabels = pack.addedLabels;

  Climate.regenerate();

  expect(calls).toEqual([
    "temperature",
    "precipitation",
    "rivers",
    "riverNames",
    "biomes",
    "featureGroups",
    "featureNames",
    "ice"
  ]);
  expect(pack).toBe(originalPack);
  expect(pack.burgs).toBe(burgs);
  expect(pack.addedLabels).toBe(originalLabels);
});

test("restores fractional terrain after river erosion, before assigning biomes", () => {
  const heights = pack.cells.h.slice();
  Rivers.generate = () => {
    pack.cells.h = new Uint8Array([90, 90, 90]);
  };
  Biomes.define = () => {
    expect(pack.cells.h).toEqual(heights);
  };

  Climate.regenerate();

  expect(pack.cells.h).toBeInstanceOf(Float32Array);
  expect(pack.cells.h).toEqual(heights);
});

test.each(["generate", "specify"] as const)("restores terrain even when Rivers.%s fails", method => {
  const heights = pack.cells.h.slice();
  Rivers[method] = () => {
    pack.cells.h = new Uint8Array(3);
    throw new Error("river failure");
  };

  expect(() => Climate.regenerate()).toThrow("river failure");

  expect(pack.cells.h).toEqual(heights);
  expect(calls).not.toContain("biomes");
  expect(calls).not.toContain("ice");
});
