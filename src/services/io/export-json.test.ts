// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearMainTip } from "@/components/tooltips";
import { ExportJson } from "./export-json";

const createObjectURL = vi.fn((_blob: Blob) => "blob:export-json");
const revokeObjectURL = vi.fn();
const click = vi.fn();

function makeOptions() {
  return {
    map: {
      lore: { name: "Fixture 世界" },
      graph: { width: 80, height: 40 },
      seed: "seed-雪",
      geography: { coordinates: { latN: 45, latS: -45, lonW: -90, lonE: 90 } },
      units: {
        distance: { unit: "km", scale: 3 },
        area: { unit: "square" },
        height: { unit: "m", exponent: 1.8 },
        temperature: { unit: "°C" },
        population: { scale: 1000, urbanization: { rate: 0.2, density: 10 } }
      },
      style: { preset: "custom" }
    }
  };
}

function makeFixture() {
  const vertexPoints: [number, number][] = [];
  vertexPoints[0] = [1, 2];
  vertexPoints[2] = [5, 6];

  return {
    pack: {
      cells: {
        i: [2, 0, 1],
        v: [
          [0, 1],
          [1, 2],
          [2, 0]
        ],
        c: [[1], [0, 2], [1]],
        p: [
          [10, 20],
          [30, 40],
          [50, 60]
        ],
        g: [100, 101, 102],
        h: new Uint8Array([0, 20, 100]),
        area: new Float64Array([12.5, -0, Infinity]),
        f: new Uint16Array([1, 2, 3]),
        t: new Int8Array([-2, -1, 1]),
        haven: new Uint16Array([0, 65535, 2]),
        harbor: new Uint8Array([0, 1, 2]),
        fl: new Float32Array([0.5, Infinity, -Infinity]),
        r: new Uint16Array([0, 10, 20]),
        conf: new Uint8Array([0, 2, 4]),
        biome: new Uint8Array([1, 2, 3]),
        s: new Int16Array([-10, 0, 10]),
        pop: new Float64Array([NaN, -0, 3.25]),
        culture: new Uint16Array([1, 0, 2]),
        burg: new Uint16Array([0, 1, 2]),
        routes: { 0: { 2: 7 }, 2: { 0: 7 } },
        state: new Uint16Array([2, 1, 0]),
        religion: new Uint16Array([0, 1, 2]),
        province: new Uint16Array([3, 2, 1])
      },
      vertices: {
        p: vertexPoints,
        v: [[1], [0, 2], [1]],
        c: [
          [0, 1, 2],
          [1, 2, 0],
          [2, 0, 1]
        ]
      },
      features: [{ i: 0, name: '海岸 "甲"' }],
      biomes: [{ i: 1 }],
      cultures: [{ i: 2 }],
      burgs: [{ i: 3 }],
      states: [{ i: 4 }],
      provinces: [{ i: 5 }],
      religions: [{ i: 6 }],
      rivers: [{ i: 7 }],
      goods: [{ i: 8 }],
      markers: [{ i: 9 }],
      markets: [{ i: 10 }],
      deals: [{ i: 11 }],
      routes: [{ i: 12 }],
      zones: [{ i: 13 }],
      measurers: [{ i: 14 }],
      journeys: [{ i: 15 }]
    },
    grid: {
      cells: {
        i: [1, 0],
        v: [
          [0, 2],
          [1, 2]
        ],
        c: [[1], [0]],
        b: [0, 1],
        f: new Uint16Array([8, 9]),
        t: new Int8Array([-2, 1]),
        h: new Uint8Array([10, 30]),
        temp: new Int8Array([-40, 35]),
        prec: new Uint8Array([0, 255])
      },
      vertices: {
        p: [
          [100, 200],
          [300, 400]
        ],
        v: [[1], [0]],
        c: [
          [0, 1, 2],
          [1, 0, 2]
        ]
      },
      spacing: 10,
      cellsY: 1,
      cellsX: 2,
      points: [
        [10, 15],
        [20, 25]
      ],
      boundary: [
        [-1, -1],
        [81, 41]
      ],
      features: [{ i: 999 }]
    }
  };
}

const expectedInfo = {
  version: "1.154.0",
  description: "Azgaar's Fantasy Map Generator output: azgaar.github.io/Fantasy-map-generator",
  exportedAt: "2025-01-02T03:04:05.000Z",
  mapName: "Fixture 世界",
  width: 80,
  height: 40,
  seed: "seed-雪",
  mapId: 1234
};

const expectedSettings = {
  distanceUnit: "km",
  distanceScale: 3,
  areaUnit: "square",
  heightUnit: "m",
  heightExponent: 1.8,
  temperatureScale: "°C",
  populationRate: 1000,
  urbanization: 0.2,
  urbanDensity: 10,
  options: makeOptions(),
  mapName: "Fixture 世界",
  stylePreset: "custom"
};

const expectedEntities = {
  features: [{ i: 0, name: '海岸 "甲"' }],
  biomes: [{ i: 1 }],
  cultures: [{ i: 2 }],
  burgs: [{ i: 3 }],
  states: [{ i: 4 }],
  provinces: [{ i: 5 }],
  religions: [{ i: 6 }],
  rivers: [{ i: 7 }],
  goods: [{ i: 8 }],
  markers: [{ i: 9 }],
  markets: [{ i: 10 }],
  deals: [{ i: 11 }],
  routes: [{ i: 12 }],
  zones: [{ i: 13 }],
  measurers: [{ i: 14 }],
  journeys: [{ i: 15 }]
};

const expectedPack = {
  cells: [
    {
      i: 2,
      v: [2, 0],
      c: [1],
      p: [50, 60],
      g: 102,
      h: 100,
      area: null,
      f: 3,
      t: 1,
      haven: 2,
      harbor: 2,
      fl: null,
      r: 20,
      conf: 4,
      biome: 3,
      s: 10,
      pop: 3.25,
      culture: 2,
      burg: 2,
      routes: { 0: 7 },
      state: 0,
      religion: 2,
      province: 1
    },
    {
      i: 0,
      v: [0, 1],
      c: [1],
      p: [10, 20],
      g: 100,
      h: 0,
      area: 12.5,
      f: 1,
      t: -2,
      haven: 0,
      harbor: 0,
      fl: 0.5,
      r: 0,
      conf: 0,
      biome: 1,
      s: -10,
      pop: null,
      culture: 1,
      burg: 0,
      routes: { 2: 7 },
      state: 2,
      religion: 0,
      province: 3
    },
    {
      i: 1,
      v: [1, 2],
      c: [0, 2],
      p: [30, 40],
      g: 101,
      h: 20,
      area: 0,
      f: 2,
      t: -1,
      haven: 65535,
      harbor: 1,
      fl: null,
      r: 10,
      conf: 2,
      biome: 2,
      s: 0,
      pop: 0,
      culture: 0,
      burg: 1,
      state: 1,
      religion: 1,
      province: 2
    }
  ],
  vertices: [
    { i: 0, p: [1, 2], v: [1], c: [0, 1, 2] },
    { i: 1, v: [0, 2], c: [1, 2, 0] },
    { i: 2, p: [5, 6], v: [1], c: [2, 0, 1] }
  ],
  ...expectedEntities
};

const expectedGrid = {
  cells: [
    { i: 1, v: [1, 2], c: [0], b: 1, f: 9, t: 1, h: 30, temp: 35, prec: 255 },
    { i: 0, v: [0, 2], c: [1], b: 0, f: 8, t: -2, h: 10, temp: -40, prec: 0 }
  ],
  vertices: [
    { i: 0, p: [100, 200], v: [1], c: [0, 1, 2] },
    { i: 1, p: [300, 400], v: [0], c: [1, 0, 2] }
  ],
  spacing: 10,
  cellsY: 1,
  cellsX: 2,
  points: [
    [10, 15],
    [20, 25]
  ],
  boundary: [
    [-1, -1],
    [81, 41]
  ],
  seed: "seed-雪",
  features: [{ i: 0, name: '海岸 "甲"' }]
};

const nameBases = [{ name: "Names", b: "甲,乙", min: 1, max: 2, d: 0, m: 0 }];
const expectedExports = {
  Full: {
    info: expectedInfo,
    settings: expectedSettings,
    mapCoordinates: { latN: 45, latS: -45, lonW: -90, lonE: 90 },
    pack: expectedPack,
    grid: expectedGrid,
    nameBases
  },
  Minimal: {
    info: expectedInfo,
    settings: expectedSettings,
    mapCoordinates: { latN: 45, latS: -45, lonW: -90, lonE: 90 },
    pack: expectedEntities,
    nameBases
  },
  PackCells: { info: expectedInfo, cells: expectedPack },
  GridCells: { info: expectedInfo, cells: expectedGrid }
};

type ExportType = keyof typeof expectedExports;
let fixture: ReturnType<typeof makeFixture>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2025-01-02T03:04:05.000Z"));
  fixture = makeFixture();
  document.body.innerHTML = '<div id="tooltip"></div>';
  vi.stubGlobal("customization", 0);
  vi.stubGlobal("TIME", false);
  vi.stubGlobal("options", makeOptions());
  vi.stubGlobal("pack", fixture.pack);
  vi.stubGlobal("grid", fixture.grid);
  vi.stubGlobal("Names", { nameBases: structuredClone(nameBases) });
  vi.stubGlobal("mapHistory", [{ created: 1234 }]);
  vi.stubGlobal(
    "$",
    vi.fn(() => ({ not: () => ({ each: () => {} }) }))
  );
  vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  click.mockClear();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(click);
});

afterEach(() => {
  clearMainTip();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function readDownload(type: ExportType): Promise<string> {
  expect(createObjectURL).toHaveBeenCalledOnce();
  expect(click).toHaveBeenCalledOnce();
  expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:export-json");
  const link = click.mock.contexts[0] as HTMLAnchorElement;
  expect(link.download).toMatch(new RegExp(`^Fixture 世界 ${type} .*\\.json$`));
  expect(link.getAttribute("href")).toBe("blob:export-json");
  const blob = createObjectURL.mock.calls[0][0];
  expect(blob.type).toBe("application/json");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

describe("ExportJson.exportToJson", () => {
  it.each<ExportType>(["Full", "Minimal", "PackCells", "GridCells"])(
    "preserves %s wire values, key order and source arrays through the real export entry",
    async type => {
      const before = makeFixture();
      expect(fixture).toStrictEqual(before);
      const packColumns = Object.entries(fixture.pack.cells);
      const gridColumns = Object.entries(fixture.grid.cells);
      ExportJson.exportToJson(type);
      const text = await readDownload(type);
      expect(text).toBe(JSON.stringify(expectedExports[type]));
      expect(fixture).toStrictEqual(before);
      for (const [key, column] of packColumns) {
        expect(fixture.pack.cells[key as keyof typeof fixture.pack.cells]).toBe(column);
      }
      for (const [key, column] of gridColumns) {
        expect(fixture.grid.cells[key as keyof typeof fixture.grid.cells]).toBe(column);
      }
    }
  );

  it("does not allocate full-length column copies just to read individual cell values", async () => {
    const from = vi.spyOn(Array, "from");
    let copied: unknown[];
    try {
      ExportJson.exportToJson("Full");
      copied = from.mock.calls.map(([input]) => input);
    } finally {
      from.mockRestore();
    }
    for (const [key, column] of [...Object.entries(fixture.pack.cells), ...Object.entries(fixture.grid.cells)]) {
      if (key === "i") continue;
      expect(copied).not.toContain(column);
    }
    expect(await readDownload("Full")).toBe(JSON.stringify(expectedExports.Full));
  });

  it("keeps empty cell and vertex collections as JSON arrays", async () => {
    fixture.pack.cells.i = [];
    fixture.pack.vertices.p = [];
    fixture.grid.cells.i = [];
    fixture.grid.vertices.p = [];
    ExportJson.exportToJson("Full");
    expect(await readDownload("Full")).toBe(
      JSON.stringify({
        ...expectedExports.Full,
        pack: { ...expectedPack, cells: [], vertices: [] },
        grid: { ...expectedGrid, cells: [], vertices: [] }
      })
    );
  });

  it("does not start a download in edit mode", () => {
    vi.stubGlobal("customization", 1);
    ExportJson.exportToJson("Full");
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    expect(document.getElementById("tooltip")!.textContent).toContain("edit mode is active");
  });
});
