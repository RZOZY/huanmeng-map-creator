import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Point } from "@/types/global";
import { Features } from "./features-generator";
import { LakesModule } from "./lakes";
import { calculateVoronoi, type Vertices } from "./voronoi";

interface CellFixture {
  heights: number[];
  neighbors: number[][];
  border: number[];
}

interface PackFixture {
  cells: {
    i: number[];
    c: number[][];
    b: boolean[];
    h: Uint8Array;
    area: Float64Array;
    p: Point[];
    v: number[][];
  };
  vertices: Vertices;
}

interface SearchCall {
  needle: number;
  fromIndex: number | undefined;
  effectiveFromIndex: number;
  valueAtFromIndex: number;
  result: number;
}

interface SearchRun<T> {
  result: T;
  calls: SearchCall[];
}

// The old oracle changes only the synchronous search lowerbound, never the markup result.
function observeSearches<T>(run: () => T, fromZero: boolean): SearchRun<T> {
  const descriptor = Object.getOwnPropertyDescriptor(Uint16Array.prototype, "indexOf");
  const indexOf = Uint16Array.prototype.indexOf;
  const random = Math.random;
  const calls: SearchCall[] = [];
  try {
    Object.defineProperty(Uint16Array.prototype, "indexOf", {
      configurable: true,
      writable: true,
      value(this: Uint16Array, needle: number, fromIndex?: number): number {
        const effectiveFromIndex = fromZero ? 0 : (fromIndex ?? 0);
        const result = indexOf.call(this, needle, effectiveFromIndex);
        calls.push({ needle, fromIndex, effectiveFromIndex, valueAtFromIndex: this[fromIndex ?? 0], result });
        return result;
      }
    });
    return { result: run(), calls };
  } finally {
    if (descriptor) Object.defineProperty(Uint16Array.prototype, "indexOf", descriptor);
    else Reflect.deleteProperty(Uint16Array.prototype, "indexOf");
    Math.random = random;
  }
}

function runGrid(fixture: CellFixture, fromZero = false) {
  vi.stubGlobal("grid", {
    cells: {
      i: Uint32Array.from(fixture.heights, (_, index) => index),
      h: Uint8Array.from(fixture.heights),
      c: fixture.neighbors.map(neighbors => [...neighbors]),
      b: [...fixture.border]
    }
  });
  return observeSearches(() => {
    Features.markupGrid();
    return { features: grid.features, f: grid.cells.f, t: grid.cells.t };
  }, fromZero);
}

function runPack(createFixture: () => PackFixture, fromZero = false) {
  vi.stubGlobal("pack", createFixture());
  return observeSearches(() => {
    Features.markupPack();
    const { f, t, haven, harbor } = pack.cells;
    return { features: pack.features, f, t, haven, harbor };
  }, fromZero);
}

function expectEquivalent(actual: SearchRun<unknown>, legacy: SearchRun<unknown>): void {
  expect(actual.result).toStrictEqual(legacy.result);
  const results = actual.calls.map(call => call.result);
  expect(results).toStrictEqual(legacy.calls.map(call => call.result));
  expect(actual.calls.map(call => call.fromIndex)).toStrictEqual([0, ...results.slice(0, -1)]);
  expect(actual.calls.every(call => call.needle === 0 && call.effectiveFromIndex === call.fromIndex)).toBe(true);
  expect(actual.calls.every(call => call.result === -1 || call.result >= call.effectiveFromIndex)).toBe(true);
  expect(legacy.calls.every(call => call.effectiveFromIndex === 0)).toBe(true);
}

function chain(length: number): number[][] {
  return Array.from({ length }, (_, index) => [index - 1, index + 1].filter(cell => cell >= 0 && cell < length));
}

const points: Point[] = [
  [25, 50],
  [50, 50],
  [75, 50],
  [50, 25],
  [50, 75]
];
const boundary: Point[] = [
  [-50, -50],
  [150, -50],
  [150, 150],
  [-50, 150]
];

// Real Voronoi, vertex walk, clipping, polygon area and lake calculations; no geometry mocks.
function voronoiPack(heights: number[]): PackFixture {
  const { cells, vertices } = calculateVoronoi(
    points.map((point): Point => [...point]),
    boundary
  );
  return {
    cells: {
      ...cells,
      i: Array.from(cells.i),
      b: cells.b.map(Boolean),
      h: Uint8Array.from(heights),
      area: Float64Array.from([0.1, 0.2, 0.3, 0.4, 0.5]),
      p: points.map((point): Point => [...point])
    },
    vertices
  };
}

// Synthetic all-water graphs exercise flood/search order only; oceans never walk vertices.
function oceanPack(neighbors: number[][], border: number[], area: number[]): PackFixture {
  return {
    cells: {
      i: Array.from({ length: neighbors.length }, (_, index) => index),
      c: neighbors.map(cells => [...cells]),
      b: border.map(Boolean),
      h: new Uint8Array(neighbors.length),
      area: Float64Array.from(area),
      p: Array.from({ length: neighbors.length }, (_, index): Point => [index + 0.25, 1.5]),
      v: []
    },
    vertices: { p: [], c: [], v: [] }
  };
}

beforeEach(() => {
  vi.stubGlobal("options", { map: { seed: "markup-search", graph: { width: 100, height: 100 } } });
  vi.stubGlobal("Lakes", new LakesModule());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Grid markup search lowerbound", () => {
  it.each([
    {
      name: "alternating islands and enclosed lakes",
      heights: [20, 19, 20, 0, 100],
      neighbors: chain(5),
      border: [1, 0, 0, 0, 1],
      ids: [1, 2, 3, 4, 5],
      terrain: [1, -1, 1, -1, 1],
      types: ["island", "lake", "island", "lake", "island"],
      borders: [true, false, false, false, true],
      bounds: [0, 1, 2, 3, 4]
    },
    {
      name: "connected features mark a non-prefix cell before the next seed",
      heights: [20, 30, 0, 0, 40],
      neighbors: [
        [4, 1],
        [0, 2],
        [1, 3],
        [2, 4],
        [3, 0]
      ],
      border: [1, 0, 0, 0, 0],
      ids: [1, 1, 2, 2, 1],
      terrain: [0, 1, -1, -1, 1],
      types: ["island", "lake"],
      borders: [true, false],
      bounds: [0, 2]
    },
    {
      name: "border ocean keeps the deep-water distance order",
      heights: [0, 0, 0, 0, 20],
      neighbors: chain(5),
      border: [1, 0, 0, 0, 0],
      ids: [1, 1, 1, 1, 2],
      terrain: [-4, -3, -2, -1, 1],
      types: ["ocean", "island"],
      borders: [true, false],
      bounds: [0, 4]
    },
    {
      name: "duplicate, self and directed neighbors preserve discovery order",
      heights: [0, 0, 20, 20, 0],
      neighbors: [[0, 1, 1], [1, 1], [2, 3, 3], [3], [4, 4]],
      border: [1, 0, 0, 0, 1],
      ids: [1, 1, 2, 2, 3],
      terrain: [0, 0, 0, 0, 0],
      types: ["ocean", "island", "ocean"],
      borders: [true, false, true],
      bounds: [0, 2, 4]
    },
    {
      name: "all land has no coastline",
      heights: [20, 30, 40, 50, 100],
      neighbors: chain(5),
      border: [0, 0, 0, 0, 1],
      ids: [1, 1, 1, 1, 1],
      terrain: [0, 0, 0, 0, 0],
      types: ["island"],
      borders: [true],
      bounds: [0]
    },
    {
      name: "all water has no coastline",
      heights: [0, 10, 19, 0, 0],
      neighbors: chain(5),
      border: [1, 0, 0, 0, 0],
      ids: [1, 1, 1, 1, 1],
      terrain: [0, 0, 0, 0, 0],
      types: ["ocean"],
      borders: [true],
      bounds: [0]
    }
  ])("matches the from-zero oracle: $name", fixture => {
    const actual = runGrid(fixture);
    const legacy = runGrid(fixture, true);
    expectEquivalent(actual, legacy);
    expect(actual.result.f).toBeInstanceOf(Uint16Array);
    expect(actual.result.t).toBeInstanceOf(Int8Array);
    expect([...actual.result.f]).toStrictEqual(fixture.ids);
    expect([...actual.result.t]).toStrictEqual(fixture.terrain);
    expect(actual.result.features[0]).toBe(0);
    expect(actual.result.features.slice(1).map(feature => feature.type)).toStrictEqual(fixture.types);
    expect(actual.result.features.slice(1).map(feature => feature.border)).toStrictEqual(fixture.borders);
    expect(actual.calls.map(call => call.fromIndex)).toStrictEqual(fixture.bounds);
  });

  it("preserves the existing empty-grid TypeError and restores the temporary patches", () => {
    const descriptor = Object.getOwnPropertyDescriptor(Uint16Array.prototype, "indexOf");
    const indexOf = Uint16Array.prototype.indexOf;
    const random = Math.random;
    const fixture = { heights: [], neighbors: [], border: [] };
    expect(() => runGrid(fixture)).toThrow(TypeError);
    expect(() => runGrid(fixture, true)).toThrow(TypeError);
    expect(Uint16Array.prototype.indexOf).toBe(indexOf);
    expect(Object.getOwnPropertyDescriptor(Uint16Array.prototype, "indexOf")).toStrictEqual(descriptor);
    expect(Math.random).toBe(random);
  });
});

describe("Pack markup search lowerbound", () => {
  it("keeps real geometry and chooses water cell 0 first for an equal-distance haven", () => {
    const createFixture = () => {
      const fixture = voronoiPack([0, 30, 0, 40, 50]);
      expect(fixture.cells.c[1]).toContain(0);
      expect(fixture.cells.c[1]).toContain(2);
      fixture.cells.c[1] = [0, 2, ...fixture.cells.c[1].filter(cell => cell !== 0 && cell !== 2)];
      return fixture;
    };
    const actual = runPack(createFixture);
    const legacy = runPack(createFixture, true);
    expectEquivalent(actual, legacy);
    expect(actual.result.f).toBeInstanceOf(Uint16Array);
    expect(actual.result.t).toBeInstanceOf(Int8Array);
    expect(actual.result.haven).toBeInstanceOf(Uint32Array);
    expect(actual.result.harbor).toBeInstanceOf(Uint8Array);
    expect([...actual.result.f]).toStrictEqual([1, 2, 3, 2, 2]);
    expect([...actual.result.t]).toStrictEqual([-1, 1, -1, 1, 1]);
    expect(actual.result.features.slice(1).map(feature => feature.type)).toStrictEqual(["ocean", "island", "ocean"]);
    expect(actual.result.features[2].vertices.length).toBeGreaterThan(2);
    expect(actual.result.features[1].area).toBe(0.1);
    expect(actual.result.features[3].area).toBe(0.3);
    expect(actual.result.haven[1]).toBe(0);
    expect(actual.result.harbor[1]).toBe(2);
    expect(actual.calls.map(call => call.fromIndex)).toStrictEqual([0, 1, 2]);
  });

  it("keeps real lake vertices, shoreline ordering and fractional height", () => {
    const createFixture = () => voronoiPack([30, 0, 35, 40, 45]);
    const actual = runPack(createFixture);
    const legacy = runPack(createFixture, true);
    expectEquivalent(actual, legacy);
    expect([...actual.result.f]).toStrictEqual([1, 2, 1, 1, 1]);
    expect(actual.result.features[2]).toMatchObject({ type: "lake", border: false, firstCell: 1, height: 29.9 });
    expect(actual.result.features[2].vertices.length).toBeGreaterThan(2);
    expect(new Set(actual.result.features[2].shoreline)).toStrictEqual(new Set([0, 2, 3, 4]));
    expect(actual.calls.map(call => call.fromIndex)).toStrictEqual([0, 1]);
  });

  it("keeps an all-land real Voronoi feature without manufacturing a coastline", () => {
    const createFixture = () => voronoiPack([20, 30, 40, 50, 60]);
    const actual = runPack(createFixture);
    expectEquivalent(actual, runPack(createFixture, true));
    expect([...actual.result.f]).toStrictEqual([1, 1, 1, 1, 1]);
    expect([...actual.result.t]).toStrictEqual([0, 0, 0, 0, 0]);
    expect([...actual.result.haven]).toStrictEqual([0, 0, 0, 0, 0]);
    expect([...actual.result.harbor]).toStrictEqual([0, 0, 0, 0, 0]);
    expect(actual.result.features[1]).toMatchObject({ type: "island", border: true, cells: 5 });
  });

  it("keeps flood-discovery floating-point area order and a border found after the seed", () => {
    const neighbors = [[2, 3], [3, 4], [0], [0, 1], [1]];
    const area = [1e16, 1, 1, 2, 0.25];
    const createFixture = () => oceanPack(neighbors, [0, 0, 0, 0, 1], area);
    const actual = runPack(createFixture);
    expectEquivalent(actual, runPack(createFixture, true));
    const discoveryArea = area[0] + area[2] + area[3] + area[1] + area[4];
    expect(actual.result.features[1]).toMatchObject({ type: "ocean", border: true, firstCell: 0, cells: 5 });
    expect(actual.result.features[1].area).toBe(discoveryArea);
    expect(discoveryArea).not.toBe(area.reduce((sum, value) => sum + value, 0));
    expect([...actual.result.t]).toStrictEqual([0, 0, 0, 0, 0]);
  });

  it("preserves every reference when the pack is empty", () => {
    const fixture = {
      cells: {
        i: [],
        f: new Uint16Array([7]),
        t: new Int8Array([-2]),
        haven: new Uint32Array([4]),
        harbor: new Uint8Array([2])
      },
      features: [0]
    };
    const cells = fixture.cells;
    const features = fixture.features;
    vi.stubGlobal("pack", fixture);
    for (const fromZero of [false, true]) {
      const actual = observeSearches(() => Features.markupPack(), fromZero);
      expect(actual).toStrictEqual({ result: undefined, calls: [] });
      expect(pack).toBe(fixture);
      expect(pack.cells).toBe(cells);
      expect(pack.features).toBe(features);
      expect(pack.cells.f).toBe(cells.f);
      expect(pack.cells.t).toBe(cells.t);
      expect(pack.cells.haven).toBe(cells.haven);
      expect(pack.cells.harbor).toBe(cells.harbor);
    }
  });
});

describe("Uint16 feature-id wraparound", () => {
  it.each(["Grid", "Pack"] as const)(
    "%s includes the current seed at feature 65536",
    method => {
      // No same-type edges: the legacy zero-id flood itself can loop on connected cells.
      const length = 65536;
      const fixture: CellFixture = {
        heights: new Array<number>(length).fill(0),
        neighbors: Array.from({ length }, () => []),
        border: new Array<number>(length).fill(1)
      };
      const createPack = () => oceanPack(fixture.neighbors, fixture.border, new Array<number>(length).fill(0.125));
      const actual = method === "Grid" ? runGrid(fixture) : runPack(createPack);
      const legacy = method === "Grid" ? runGrid(fixture, true) : runPack(createPack, true);
      expectEquivalent(actual, legacy);
      expect(actual.result.features).toHaveLength(length + 2);
      expect(actual.result.features.slice(-2).map(feature => feature.i)).toStrictEqual([65536, 65537]);
      expect(actual.result.f[length - 2]).toBe(65535);
      expect(actual.result.f[length - 1]).toBe(1);
      expect(actual.calls[length - 1]).toMatchObject({ fromIndex: 65535, valueAtFromIndex: 0, result: 65535 });
      expect(actual.calls[length]).toMatchObject({ fromIndex: 65535, valueAtFromIndex: 1, result: -1 });
      if (method === "Pack") {
        expect(pack.features.slice(-2).map(feature => feature.firstCell)).toStrictEqual([65535, 65535]);
        expect(pack.features.slice(-2).map(feature => feature.area)).toStrictEqual([0.125, 0.125]);
      }
    },
    30000
  );
});
