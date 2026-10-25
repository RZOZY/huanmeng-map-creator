import { describe, expect, it } from "vitest";
import { repairCultureReferences, repairRouteReferences } from "./load-integrity";

describe("loaded culture references", () => {
  it("clears missing and removed cultures without erasing provinces", () => {
    const cells = {
      culture: Uint16Array.from([0, 1, 7, 2, 7]),
      province: Uint16Array.from([3, 5, 11, 13, 17])
    };
    const cultures = [{}, {}, { removed: true }];

    expect(repairCultureReferences(cells, cultures)).toEqual([
      { id: 7, cells: [2, 4] },
      { id: 2, cells: [3] }
    ]);
    expect([...cells.culture]).toEqual([0, 1, 0, 0, 0]);
    expect([...cells.province]).toEqual([3, 5, 11, 13, 17]);
    expect(repairCultureReferences(cells, cultures)).toEqual([]);
  });

  it("handles sparse and high culture ids without relying on array length", () => {
    const cells = { culture: Uint16Array.from([65535, 3, 0]) };
    const cultures = [{}, undefined, undefined, { removed: false }];
    expect(repairCultureReferences(cells, cultures)).toEqual([{ id: 65535, cells: [0] }]);
    expect([...cells.culture]).toEqual([0, 3, 0]);
  });
});

describe("loaded route references", () => {
  it("keeps valid sparse ids including zero and removes only dangling links", () => {
    const links = { 1: { 2: 0, 3: 40, 4: 999 }, 2: { 1: 0 }, 3: {}, 4: { 1: 999 } };
    expect(repairRouteReferences(links, new Set([0, 40]))).toEqual([
      { id: 999, from: 1, to: 4 },
      { id: 999, from: 4, to: 1 }
    ]);
    expect(links).toEqual({ 1: { 2: 0, 3: 40 }, 2: { 1: 0 }, 4: {} });
  });

  it("validates one membership lookup per edge rather than rescanning routes", () => {
    class CountingIds extends Set<number> {
      lookups = 0;
      override has(id: number): boolean {
        this.lookups++;
        return super.has(id);
      }
    }
    const ids = new CountingIds(Array.from({ length: 20000 }, (_, id) => id * 3));
    const neighbors = Object.fromEntries(Array.from({ length: 4000 }, (_, cell) => [cell, cell * 3]));
    expect(repairRouteReferences({ 9: neighbors }, ids)).toEqual([]);
    expect(ids.lookups).toBe(4000);
    expect(Object.keys(neighbors)).toHaveLength(4000);
  });
});
