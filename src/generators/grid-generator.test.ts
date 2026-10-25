import { afterEach, describe, expect, it, vi } from "vitest";
import { getGridDimensions } from "@/utils/gridDimensions";
import "./grid-generator";

const random = Math.random;
const initialOptions = options;

const fixtures = [
  { width: 1280, height: 800, points: 10000, spacing: 10.12, cellsX: 126, cellsY: 79 },
  { width: 1600, height: 900, points: 1000, spacing: 37.95, cellsX: 42, cellsY: 24 },
  { width: 900, height: 1600, points: 2000, spacing: 26.83, cellsX: 34, cellsY: 60 },
  { width: 100, height: 100, points: 3, spacing: 57.74, cellsX: 2, cellsY: 2 },
  { width: 240, height: 135, points: 100000, spacing: 0.57, cellsX: 421, cellsY: 237 }
];

afterEach(() => {
  Math.random = random;
  options = initialOptions;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("grid dimensions", () => {
  it.each(fixtures)("rounds spacing before counting $width×$height at $points points", fixture => {
    const { width, height, points, spacing, cellsX, cellsY } = fixture;
    expect(getGridDimensions(width, height, points)).toEqual({ spacing, cellsX, cellsY });
  });

  it.each([
    { width: 10, cellsX: 0 },
    { width: 10.001, cellsX: 1 }
  ])("excludes a point exactly on the edge at width $width", ({ width, cellsX }) => {
    expect(getGridDimensions(width, 40, 1)).toEqual({ spacing: 20, cellsX, cellsY: 2 });
  });

  for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    it.each([
      [value, 800, 10000],
      [1280, value, 10000],
      [1280, 800, value]
    ])("has no estimate for degenerate inputs %s, %s, %s", (width, height, points) => {
      expect(getGridDimensions(width, height, points)).toBeNull();
    });
  }

  it.each([
    [0.001, 0.001, 100000],
    [Number.MAX_VALUE, Number.MAX_VALUE, 1000],
    [Number.MAX_VALUE, 1, 1e308]
  ])("has no estimate for unrepresentable spacing or counts %s, %s, %s", (width, height, points) => {
    expect(getGridDimensions(width, height, points)).toBeNull();
  });

  it("does not consume randomness when estimating", () => {
    const nextRandom = vi.spyOn(Math, "random");
    getGridDimensions(1280, 800, 10000);
    expect(nextRandom).not.toHaveBeenCalled();
  });
});

describe("Grid.prepare dimensions", () => {
  it.each(fixtures)("matches the estimate and point count for $width×$height at $points points", fixture => {
    const { width, height, points, spacing, cellsX, cellsY } = fixture;
    options = Options.getDefaultOptions();
    options.map.graph = { width, height, points };
    vi.stubGlobal("grid", undefined);

    Grid.prepare();

    expect(grid).toMatchObject({ spacing, cellsX, cellsY });
    expect(grid).toMatchObject(getGridDimensions(width, height, points)!);
    expect(grid.points).toHaveLength(cellsX * cellsY);
  });

  it("rejects zero rounded spacing before resetting the PRNG or placing points", () => {
    expect(() => Grid.generate("invalid", 0.001, 0.001, 100000)).toThrow(RangeError);
    expect(Math.random).toBe(random);
  });
});
