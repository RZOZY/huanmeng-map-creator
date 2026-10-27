// @vitest-environment jsdom
import { select } from "d3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Layers } from "@/components/layers";
import { stopMapPlacement, toggleMapPlacement } from "@/components/map-placement";
import { applyDefaultViewboxEvents } from "@/components/viewbox-events";
import { AddedLabels } from "@/generators/added-labels";
import { getMapModelEpoch, markMapModelStable, markMapModelUnstable } from "@/services/io/model-status";
import { createRegistry } from "@/utils/registry";
import { LabelCreator } from "./label-creator";
import { RiverCreator } from "./river-creator";

type LabelsDependency = { getLastSelectedGroup(): string };
const boundary = vi.hoisted(() => ({
  load: vi.fn<() => Promise<LabelsDependency>>(),
  getLastSelectedGroup: vi.fn<() => Promise<string>>(),
  readGroup: vi.fn(() => "remembered"),
  findCell: vi.fn<() => number | undefined>(() => 0),
  getCulture: vi.fn((culture: number) => `culture-${culture}`),
  findGroup: vi.fn(() => ({ name: "added-group" })),
  createArc: vi.fn(({ anchor: [x, y] }: { anchor: [number, number] }) => [
    [x - 4, y],
    [x, y - 2],
    [x + 4, y]
  ])
}));
vi.mock("@/components/dialog/dialog-helpers", () => ({
  closeDialogs: vi.fn(),
  destroyDialog: vi.fn((id: string) => document.getElementById(id)?.remove())
}));
vi.mock("@/components/layers", () => ({
  Layers: { show: vi.fn(), draw: vi.fn(), isOn: vi.fn(() => false), hide: vi.fn() }
}));
vi.mock("@/components/tooltips", () => ({ tip: vi.fn(), clearMainTip: vi.fn() }));
vi.mock("@/components/viewbox-events", async () => {
  const { select } = await import("d3");
  return { applyDefaultViewboxEvents: vi.fn(() => select("#viewbox").on("click", null)) };
});
vi.mock("@/controllers", () => ({
  Controllers: { LabelsEditor: { getLastSelectedGroup: () => boundary.getLastSelectedGroup() } }
}));
vi.mock("@/renderers/labels/label-arc", () => ({ createLabelArc: boundary.createArc }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

function makePack(culture = 3): typeof pack {
  return { cells: { culture: new Uint16Array([culture]) }, addedLabels: [] } as unknown as typeof pack;
}

let dependency: ReturnType<typeof deferred<LabelsDependency>>;

function clickMap(shiftKey = false): void {
  document
    .getElementById("viewbox")!
    .dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 70, clientY: 40, shiftKey }));
}

async function finishDependency(): Promise<void> {
  dependency.resolve({ getLastSelectedGroup: boundary.readGroup });
  await Promise.all(boundary.getLastSelectedGroup.mock.results.map(result => result.value));
}

function expectNoPlacement(): void {
  expect(boundary.findGroup).not.toHaveBeenCalled();
  expect(boundary.createArc).not.toHaveBeenCalled();
  expect(Layers.draw).not.toHaveBeenCalled();
  expect(applyDefaultViewboxEvents).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  boundary.findCell.mockReturnValue(0);
  boundary.readGroup.mockReturnValue("remembered");
  markMapModelStable();
  document.body.innerHTML =
    '<div id="addFeature"><button id="addLabel"></button><button id="otherTool"></button></div>' +
    '<div id="dialogs"></div><svg id="map"><g id="viewbox"></g><g id="debug"></g></svg>';
  vi.stubGlobal("pack", makePack());
  vi.stubGlobal("Pack", {
    findCell: boundary.findCell,
    getPolygon: () => [
      [0, 0],
      [1, 0],
      [0, 1]
    ]
  });
  vi.stubGlobal("customization", 0);
  vi.stubGlobal("$", () => ({ dialog: vi.fn() }));
  vi.stubGlobal("Names", { getCulture: boundary.getCulture });
  vi.stubGlobal("Labels", { findGroup: boundary.findGroup });
  vi.stubGlobal("AddedLabels", AddedLabels);
  dependency = deferred<LabelsDependency>();
  boundary.load.mockReturnValue(dependency.promise);
  const registry = createRegistry({ LabelsEditor: boundary.load });
  boundary.getLastSelectedGroup.mockImplementation(() => registry.LabelsEditor.getLastSelectedGroup());
  LabelCreator.toggle();
  vi.mocked(applyDefaultViewboxEvents).mockClear();
});

afterEach(() => {
  stopMapPlacement();
  markMapModelStable();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("label placement ownership across its lazy editor dependency", () => {
  it("does not read a cell, name or dependency when the model is already unstable", async () => {
    markMapModelUnstable();
    clickMap();
    await finishDependency();

    expect(boundary.findCell).not.toHaveBeenCalled();
    expect(boundary.getCulture).not.toHaveBeenCalled();
    expect(boundary.getLastSelectedGroup).not.toHaveBeenCalled();
    expect(boundary.load).not.toHaveBeenCalled();
    expect(pack.addedLabels).toEqual([]);
    expectNoPlacement();
  });

  it.each(["loaded", "adopting", "failed"])("drops an old click when replacement is %s", async outcome => {
    const source = pack;
    clickMap();
    expect(boundary.load).toHaveBeenCalledOnce();
    expect(source.addedLabels).toEqual([]);

    markMapModelUnstable();
    window.dispatchEvent(new Event("map:replacing"));
    if (outcome !== "failed") vi.stubGlobal("pack", makePack(9));
    if (outcome === "loaded") markMapModelStable();
    await finishDependency();

    expect(source.addedLabels).toEqual([]);
    expect(pack.addedLabels).toEqual([]);
    expectNoPlacement();
  });

  it("rejects a changed epoch even if the pack object was reused and is stable again", async () => {
    const source = pack;
    clickMap();
    markMapModelUnstable();
    window.dispatchEvent(new Event("map:replacing"));
    markMapModelStable();
    await finishDependency();

    expect(pack).toBe(source);
    expect(pack.addedLabels).toEqual([]);
    expectNoPlacement();
  });

  it("rejects a changed pack reference even without an epoch change", async () => {
    const source = pack;
    const epoch = getMapModelEpoch();
    clickMap();
    vi.stubGlobal("pack", makePack(9));
    await finishDependency();

    expect(getMapModelEpoch()).toBe(epoch);
    expect(source.addedLabels).toEqual([]);
    expect(pack.addedLabels).toEqual([]);
    expectNoPlacement();
  });

  it.each([false, true])("preserves same-map text, coordinates, path and Shift=%s", async shiftKey => {
    clickMap(shiftKey);
    await finishDependency();

    expect(pack.addedLabels).toEqual([
      {
        i: 1,
        x: 70,
        y: 40,
        label: {
          text: "culture-3",
          group: "added-group",
          pathPoints: [
            [66, 40],
            [70, 38],
            [74, 40]
          ]
        }
      }
    ]);
    expect(boundary.findGroup).toHaveBeenCalledWith("remembered", "added");
    expect(boundary.createArc).toHaveBeenCalledWith({
      text: "culture-3",
      type: "added",
      group: "added-group",
      anchor: [70, 40]
    });
    expect(Layers.draw).toHaveBeenCalledExactlyOnceWith("labels");
    expect(document.getElementById("addLabel")!.classList.contains("pressed")).toBe(shiftKey);
  });

  it("keeps the pending click when a load is cancelled without replacement", async () => {
    const source = pack;
    const epoch = getMapModelEpoch();
    clickMap();
    markMapModelStable();
    await finishDependency();

    expect(getMapModelEpoch()).toBe(epoch);
    expect(pack).toBe(source);
    expect(pack.addedLabels).toHaveLength(1);
    expect(Layers.draw).toHaveBeenCalledExactlyOnceWith("labels");
  });

  it("does not place anything or stop the new map's active tool", async () => {
    const source = pack;
    clickMap();
    markMapModelUnstable();
    window.dispatchEvent(new Event("map:replacing"));
    vi.stubGlobal("pack", makePack(9));
    markMapModelStable();
    toggleMapPlacement("otherTool", vi.fn(), "other placement");
    vi.mocked(applyDefaultViewboxEvents).mockClear();
    await finishDependency();

    expect(source.addedLabels).toEqual([]);
    expect(pack.addedLabels).toEqual([]);
    expect(document.getElementById("otherTool")!.classList.contains("pressed")).toBe(true);
    expectNoPlacement();
  });

  it("does not place a late label or cancel another tool on the same map", async () => {
    clickMap();
    toggleMapPlacement("otherTool", vi.fn(), "other placement");
    vi.mocked(applyDefaultViewboxEvents).mockClear();
    await finishDependency();

    expect(pack.addedLabels).toEqual([]);
    expect(document.getElementById("otherTool")!.classList.contains("pressed")).toBe(true);
    expectNoPlacement();
  });

  it("retires the pending label when the real manual river creator takes over", async () => {
    pack.cells.fl = new Uint16Array([23]);
    clickMap();
    RiverCreator.open();
    const riverHandler = select("#viewbox").on("click");
    expect(riverHandler).toBeTypeOf("function");
    vi.mocked(applyDefaultViewboxEvents).mockClear();
    await finishDependency();

    expect(pack.addedLabels).toEqual([]);
    expectNoPlacement();
    expect(select("#viewbox").on("click")).toBe(riverHandler);
    expect(document.getElementById("addLabel")!.classList.contains("pressed")).toBe(false);
    clickMap();
    expect(document.querySelector("#riverCreatorBody [data-cell='0']")).not.toBeNull();
    expect(document.querySelector<HTMLInputElement>("#riverCreatorBody input")!.value).toBe("23");
    expect(document.querySelector("#controlCells polygon")!.getAttribute("points")).toBe("0,0,1,0,0,1");
    clickMap();
    expect(document.querySelector("#riverCreatorBody [data-cell='0']")).toBeNull();
    expect(document.querySelector("#controlCells polygon")).toBeNull();
    expect(boundary.getLastSelectedGroup).toHaveBeenCalledOnce();
    expect(pack.addedLabels).toEqual([]);
    expectNoPlacement();
  });

  it("does not retire label placement when customization rejects manual river creation", async () => {
    clickMap(true);
    const labelHandler = select("#viewbox").on("click");
    vi.stubGlobal("customization", 1);
    RiverCreator.open();

    expect(document.getElementById("riverCreator")).toBeNull();
    expect(select("#viewbox").on("click")).toBe(labelHandler);
    expect(applyDefaultViewboxEvents).not.toHaveBeenCalled();
    expect(document.getElementById("addLabel")!.classList.contains("pressed")).toBe(true);
    await finishDependency();
    expect(pack.addedLabels).toHaveLength(1);
    expect(Layers.draw).toHaveBeenCalledExactlyOnceWith("labels");
    expect(document.getElementById("addLabel")!.classList.contains("pressed")).toBe(true);
  });

  it("does not let an old click consume a newly reopened label placement", async () => {
    clickMap();
    stopMapPlacement();
    LabelCreator.toggle();
    vi.mocked(applyDefaultViewboxEvents).mockClear();
    await finishDependency();

    expect(pack.addedLabels).toEqual([]);
    expect(document.getElementById("addLabel")!.classList.contains("pressed")).toBe(true);
    expectNoPlacement();

    clickMap();
    await finishDependency();
    expect(pack.addedLabels).toHaveLength(1);
    expect(boundary.load).toHaveBeenCalledOnce();
    expect(document.getElementById("addLabel")!.classList.contains("pressed")).toBe(false);
  });

  it.each(["replacement", "cancel and reopen"])("also fences the cached dependency after %s", async action => {
    clickMap(true);
    await finishDependency();
    pack.addedLabels = [];
    vi.mocked(Layers.draw).mockClear();
    boundary.findGroup.mockClear();
    boundary.createArc.mockClear();
    boundary.readGroup.mockClear();

    clickMap();
    expect(boundary.readGroup).not.toHaveBeenCalled();
    if (action === "replacement") {
      markMapModelUnstable();
      window.dispatchEvent(new Event("map:replacing"));
      markMapModelStable();
    } else {
      stopMapPlacement();
      LabelCreator.toggle();
      vi.mocked(applyDefaultViewboxEvents).mockClear();
    }
    await finishDependency();

    expect(boundary.load).toHaveBeenCalledOnce();
    expect(pack.addedLabels).toEqual([]);
    expect(document.getElementById("addLabel")!.classList.contains("pressed")).toBe(true);
    expectNoPlacement();
  });

  it("does not request the editor dependency for a point outside the map", async () => {
    boundary.findCell.mockReturnValue(undefined);
    clickMap();
    await finishDependency();

    expect(boundary.getCulture).not.toHaveBeenCalled();
    expect(boundary.load).not.toHaveBeenCalled();
    expect(pack.addedLabels).toEqual([]);
    expectNoPlacement();
  });
});
