import { beforeEach, describe, expect, test } from "vitest";
import { AddedLabelsModule, normalizeLabelSize } from "./added-labels";
import type { Label } from "./labels-generator";

describe("AddedLabelsModule", () => {
  beforeEach(() => {
    globalThis.pack = {
      addedLabels: [
        { i: 1, x: 10, y: 10, label: { text: "North", group: "added" }, note: "Northern reaches" },
        { i: 2, x: 20, y: 20, label: { text: "South", group: "added" }, note: "Old legend" }
      ]
    } as unknown as typeof pack;
  });

  test("drops the note with the label, so a reused id cannot inherit it", () => {
    const addedLabels = new AddedLabelsModule();

    addedLabels.remove(2);
    const replacement = addedLabels.add({ x: 30, y: 30, label: { text: "East", group: "added" } });

    expect(replacement.i).toBe(2);
    expect(replacement.note).toBeUndefined();
    expect(pack.addedLabels.map(label => label.note)).toEqual(["Northern reaches", undefined]);
  });

  test("carries a legacy size over to fontSize", () => {
    const legacy: Label & { size: number } = { text: "Region", group: "added", size: 240 };
    expect(normalizeLabelSize(legacy).fontSize).toBe(240);
  });

  test("keeps an explicit fontSize and clamps a legacy size", () => {
    expect(normalizeLabelSize({ text: "A", fontSize: 80, size: 240 } as Label).fontSize).toBe(80);
    expect(normalizeLabelSize({ text: "B", size: 5000 } as Label).fontSize).toBe(1000);
    expect(normalizeLabelSize({ text: "C", size: 1 } as Label).fontSize).toBe(10);
  });

  test("places an added label with a normalized size", () => {
    const addedLabels = new AddedLabelsModule();
    const placed = addedLabels.add({ x: 30, y: 30, label: { text: "East", size: 240 } as Label });

    expect(placed.label.fontSize).toBe(240);
    expect(pack.addedLabels.at(-1)?.label.fontSize).toBe(240);
  });
});
