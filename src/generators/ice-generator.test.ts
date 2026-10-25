import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { redrawGlacier, redrawIceberg } from "@/renderers/draw-ice";
import type { Point } from "@/types/global";
import { getIsolines } from "@/utils";
import "./ice-generator";

vi.mock("@/renderers/draw-ice", () => ({ redrawGlacier: vi.fn(), redrawIceberg: vi.fn() }));
vi.mock("@/utils", async importOriginal => ({
  ...(await importOriginal<typeof import("@/utils")>()),
  getIsolines: vi.fn(() => ({})),
  P: vi.fn(() => false)
}));

const polygon: Point[] = [
  [1, 1],
  [9, 1],
  [1, 9]
];
let originalRandom: typeof Math.random;

function setGrid(count: number): void {
  globalThis.grid = {
    points: Array.from({ length: count }, () => [5, 5]),
    cells: {
      i: Uint32Array.from({ length: count }, (_, i) => i),
      h: new Uint8Array(count),
      temp: new Int8Array(count).fill(-10),
      f: new Uint16Array(count),
      t: new Int8Array(count)
    },
    features: [{ type: "ocean" }]
  } as unknown as typeof grid;
  globalThis.Grid = { getPolygon: vi.fn(() => polygon) } as unknown as typeof Grid;
}

beforeEach(() => {
  originalRandom = Math.random;
  vi.clearAllMocks();
  vi.mocked(getIsolines).mockReturnValue({});
  globalThis.pack = { ice: [] } as unknown as typeof pack;
  globalThis.options = {
    map: { seed: "ice-ids", graph: { width: 100, height: 100 } }
  } as unknown as typeof options;
  setGrid(3);
});

afterEach(() => {
  Math.random = originalRandom;
  vi.restoreAllMocks();
});

describe("ice ID allocation", () => {
  it("replaces the old dataset and shares contiguous IDs between glaciers and icebergs", () => {
    const oldIce = [
      { i: 99, type: "glacier" as const, points: polygon },
      { i: 0, type: "glacier" as const, points: polygon }
    ];
    pack.ice = oldIce;
    vi.mocked(getIsolines).mockReturnValue({ iceShield: { polygons: [polygon, polygon] } });

    Ice.generate();

    expect(pack.ice).not.toBe(oldIce);
    expect(pack.ice.map(ice => ice.i)).toEqual([0, 1, 2, 3, 4]);
    expect(pack.ice.map(ice => ice.type)).toEqual(["glacier", "glacier", "iceberg", "iceberg", "iceberg"]);
    expect(pack.ice.some(ice => oldIce.includes(ice as (typeof oldIce)[number]))).toBe(false);
    expect(redrawGlacier).not.toHaveBeenCalled();
    expect(redrawIceberg).not.toHaveBeenCalled();
  });

  it("does not scan existing IDs per block when generating 16,401 ice records", () => {
    setGrid(16399);
    vi.mocked(getIsolines).mockReturnValue({ iceShield: { polygons: [polygon, polygon] } });
    const scan = vi.spyOn(Ice as unknown as { getNextId(): number }, "getNextId").mockImplementation(() => {
      throw new Error("Batch generation must not scan existing IDs");
    });

    Ice.generate();

    expect(scan).not.toHaveBeenCalled();
    expect(pack.ice).toHaveLength(16401);
    expect(pack.ice.every((ice, i) => ice.i === i)).toBe(true);
  });

  it("regenerates the same IDs and shapes for the same seed without stale allocator state", () => {
    vi.mocked(getIsolines).mockReturnValue({ iceShield: { polygons: [polygon] } });
    Ice.generate();
    const first = structuredClone(pack.ice);

    Ice.regenerate();

    expect(pack.ice).toEqual(first);
    Ice.addIceberg(0, 0.5);
    expect(pack.ice.at(-1)?.i).toBe(first.length);
    expect(new Set(pack.ice.map(ice => ice.i)).size).toBe(pack.ice.length);
  });

  it.each([0, 1])("fills the deleted ID %i on manual insertion without renumbering survivors", missingId => {
    pack.ice = [0, 1, 2].map(i => ({ i, type: "iceberg", cellId: 0, size: 0.5, points: polygon }));
    const survivors = pack.ice.filter(ice => ice.i !== missingId);
    Ice.removeIce(missingId);
    vi.mocked(redrawIceberg).mockClear();

    Ice.addIceberg(0, 0.5);

    expect(pack.ice.slice(0, -1)).toEqual(survivors);
    expect(pack.ice.at(-1)?.i).toBe(missingId);
    expect(redrawIceberg).toHaveBeenCalledExactlyOnceWith(missingId);
    Ice.addIceberg(0, 0.5);
    expect(pack.ice.at(-1)?.i).toBe(3);
    expect(new Set(pack.ice.map(ice => ice.i)).size).toBe(pack.ice.length);
  });

  it("starts manual insertion at zero for an empty dataset", () => {
    Ice.addIceberg(0, 0.5);

    expect(pack.ice.map(ice => ice.i)).toEqual([0]);
    expect(redrawIceberg).toHaveBeenCalledExactlyOnceWith(0);
  });
});
