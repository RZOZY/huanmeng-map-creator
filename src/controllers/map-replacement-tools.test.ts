// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyGraphSize, fitMapToScreen } from "@/components/canvas";
import { destroyDialog } from "@/components/dialog/dialog-helpers";
import { Layers } from "@/components/layers";
import { registerMap } from "@/components/lifecycle";
import { changeCellsDensity } from "@/components/options/tabs/options-tab";
import { tip } from "@/components/tooltips";
import { undraw } from "@/components/undraw";
import { Resample } from "@/generators/resample";
import { beginMapIO, isMapIOBusy } from "@/services/io/map-io";
import { isMapModelStable, markMapModelStable, markMapModelUnstable } from "@/services/io/model-status";
import { saveToFileSystem } from "@/services/io/save-to-file";
import { logStats } from "@/services/logging";
import { SubmapTool } from "./submap-tool";
import { TransformTool } from "./transform-tool";

vi.mock("@/components/canvas", () => ({ applyGraphSize: vi.fn(), fitMapToScreen: vi.fn() }));
vi.mock("@/components/dialog/dialog-helpers", () => ({ destroyDialog: vi.fn() }));
vi.mock("@/components/layers", () => ({ Layers: { drawAll: vi.fn() } }));
vi.mock("@/components/lifecycle", () => ({ registerMap: vi.fn() }));
vi.mock("@/components/options/tabs/options-tab", () => ({
  cellsDensityColor: () => "green",
  changeCellsDensity: vi.fn()
}));
vi.mock("@/components/tooltips", () => ({ tip: vi.fn() }));
vi.mock("@/components/undraw", () => ({ undraw: vi.fn() }));
vi.mock("@/components/viewport", () => ({ viewport: { scale: 2, x: -100, y: -80 } }));
vi.mock("@/generators/resample", () => ({ Resample: { process: vi.fn() } }));
vi.mock("@/services/logging", () => ({ logStats: vi.fn() }));
vi.mock("@/utils/fileUtils", () => ({ downloadFile: vi.fn() }));

type DialogButton = (this: HTMLElement) => void | Promise<void>;
interface DialogConfig {
  buttons: Record<string, DialogButton>;
  close(): void;
}

const tools = [
  { name: "submap", tool: SubmapTool, id: "submapTool", button: "Submap", points: "submapPointsInput" },
  { name: "transform", tool: TransformTool, id: "transformTool", button: "Transform", points: "transformPointsInput" }
];
const dialogs = new Map<string, DialogConfig>();
const events: string[] = [];
let replacementSnapshots: { options: typeof options; stable: boolean; busy: boolean }[];

function record(step: string): void {
  events.push(step);
  expect(isMapIOBusy()).toBe(true);
  expect(isMapModelStable()).toBe(false);
}

function onReplacing(): void {
  record("replacing");
  replacementSnapshots.push({ options: structuredClone(options), stable: isMapModelStable(), busy: isMapIOBusy() });
}

function openTool(tool: (typeof tools)[number]): () => void | Promise<void> {
  tool.tool.open();
  const element = document.getElementById(tool.id)!;
  const button = dialogs.get(tool.id)!.buttons[tool.button];
  return () => button.call(element);
}

beforeEach(() => {
  vi.resetAllMocks();
  markMapModelStable();
  window.dispatchEvent(new Event("map:generated"));
  options = Options.getDefaultOptions();
  options.map.graph = { width: 800, height: 600, points: 1000 };
  options.generation.graph.density = 1;
  options.map.geography.mapSize = 80;
  options.map.units.distance.scale = 6;
  options.map.units.population.scale = 1000;
  vi.stubGlobal("pack", { burgs: [{ i: 1, label: { group: "burg" } }] });
  vi.stubGlobal("styles", {
    burgIcons: { groups: { village: { groups: { icons: { options: { size: 1 } } } } } },
    labels: { groups: { burg: { attrs: { "font-size": "10%" } } } }
  });
  vi.stubGlobal("Burgs", { ensureBurgGroupStyles: vi.fn(() => record("burg-styles")) });
  vi.stubGlobal("Services", { ExportMap: { getMapURL: vi.fn().mockResolvedValue("data:image/png;base64,") } });
  vi.stubGlobal(
    "resetZoom",
    vi.fn(() => record("reset-zoom"))
  );
  vi.stubGlobal("$", (target: string | HTMLElement) => ({
    dialog(config: DialogConfig | string) {
      const id = typeof target === "string" ? target.slice(1) : target.id;
      if (typeof config !== "string") dialogs.set(id, config);
      else if (config === "close") {
        events.push("close");
        dialogs.get(id)!.close();
      }
    }
  }));
  vi.mocked(destroyDialog).mockImplementation(id => document.getElementById(id)?.remove());
  vi.spyOn(Options, "save").mockImplementation(() => record("save-options"));
  vi.mocked(changeCellsDensity).mockImplementation(density => {
    record("density");
    options.generation.graph.density = density;
  });
  vi.mocked(applyGraphSize).mockImplementation(() => record("graph-size"));
  vi.mocked(fitMapToScreen).mockImplementation(() => record("fit"));
  vi.mocked(undraw).mockImplementation(() => record("undraw"));
  vi.mocked(Resample.process).mockImplementation(() => record("resample"));
  vi.mocked(Layers.drawAll).mockImplementation(() => record("draw"));
  vi.mocked(registerMap).mockImplementation(() => record("register"));
  vi.mocked(logStats).mockImplementation(() => record("stats"));
  document.body.innerHTML = '<div id="dialogs"></div><svg><g id="burgIcons"><g id="village"></g></g></svg>';
  dialogs.clear();
  events.length = 0;
  replacementSnapshots = [];
  window.addEventListener("map:replacing", onReplacing);
});

afterEach(() => {
  window.removeEventListener("map:replacing", onReplacing);
  expect(isMapIOBusy()).toBe(false);
  markMapModelStable();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
  localStorage.clear();
});

describe.each(tools)("$name replacement entry", tool => {
  it.each(["1", "2"])("cannot rehabilitate a quarantined model at density %s", async density => {
    markMapModelUnstable();
    const apply = openTool(tool);
    (document.getElementById(tool.points) as HTMLInputElement).value = density;
    const previousOptions = structuredClone(options);
    const previousStyles = structuredClone(styles);
    const previousPack = structuredClone(pack);
    const previousDOM = document.body.innerHTML;
    const previousCleanupCount = vi.mocked(destroyDialog).mock.calls.length;

    await apply();
    await apply();

    expect(options).toEqual(previousOptions);
    expect(styles).toEqual(previousStyles);
    expect(pack).toEqual(previousPack);
    expect(document.body.innerHTML).toBe(previousDOM);
    expect(destroyDialog).toHaveBeenCalledTimes(previousCleanupCount);
    expect(events).toEqual([]);
    expect(replacementSnapshots).toEqual([]);
    expect(Options.save).not.toHaveBeenCalled();
    expect(changeCellsDensity).not.toHaveBeenCalled();
    expect(undraw).not.toHaveBeenCalled();
    expect(Resample.process).not.toHaveBeenCalled();
    expect(registerMap).not.toHaveBeenCalled();
    expect(isMapModelStable()).toBe(false);
    expect(isMapIOBusy()).toBe(false);
    expect(tip).toHaveBeenCalledTimes(2);
    expect(tip).toHaveBeenCalledWith(
      "当前地图状态不完整，请先成功重新载入地图或全新生成地图，再使用此工具。",
      true,
      "warn",
      5000
    );
    const next = beginMapIO("load");
    expect(next).not.toBeNull();
    next?.release();
  });

  it.each(["save", "load", "generate"] as const)("does not change anything while %s owns the lease", async kind => {
    const apply = openTool(tool);
    (document.getElementById(tool.points) as HTMLInputElement).value = "2";
    const previousOptions = structuredClone(options);
    const previousStyles = structuredClone(styles);
    const previousPack = pack;
    const previousDOM = document.body.innerHTML;
    const lease = beginMapIO(kind)!;
    try {
      await apply();
      expect(options).toEqual(previousOptions);
      expect(styles).toEqual(previousStyles);
      expect(pack).toBe(previousPack);
      expect(document.body.innerHTML).toBe(previousDOM);
      expect(events).toEqual([]);
      expect(Options.save).not.toHaveBeenCalled();
      expect(changeCellsDensity).not.toHaveBeenCalled();
      expect(Resample.process).not.toHaveBeenCalled();
      expect(isMapModelStable()).toBe(true);
      expect(tip).toHaveBeenCalledExactlyOnceWith("正在读取、保存或生成地图，请完成后重试", true, "warn", 5000);
      expect(beginMapIO("save")).toBeNull();
    } finally {
      lease.release();
    }
  });

  it("cannot replace a map while a real file save awaits createWritable", async () => {
    const apply = openTool(tool);
    let resume!: () => void;
    const stream = { write: vi.fn(), close: vi.fn(), abort: vi.fn() };
    const handle = {
      name: "Original.map",
      createWritable: vi.fn(() => new Promise<typeof stream>(resolve => (resume = () => resolve(stream))))
    };
    vi.stubGlobal("showSaveFilePicker", vi.fn().mockResolvedValue(handle));
    const original = structuredClone(options);
    const saving = saveToFileSystem(() => JSON.stringify(options), "Original.map");
    await vi.waitFor(() => expect(handle.createWritable).toHaveBeenCalledOnce());
    try {
      await apply();
      expect(options).toEqual(original);
      expect(events).toEqual([]);
      expect(Resample.process).not.toHaveBeenCalled();
    } finally {
      resume();
      await expect(saving).resolves.toEqual({ type: "saved", filename: "Original.map" });
    }
    expect(stream.write).toHaveBeenCalledExactlyOnceWith(JSON.stringify(original));
  });

  it("announces replacement before the first mutation and preserves the successful pipeline", async () => {
    const apply = openTool(tool);
    (document.getElementById(tool.points) as HTMLInputElement).value = "2";
    if (tool.name === "transform") {
      (document.getElementById("transformShiftX") as HTMLInputElement).value = "15";
      (document.getElementById("transformShiftY") as HTMLInputElement).value = "-20";
      (document.getElementById("transformAngleInput") as HTMLInputElement).value = "90";
      (document.getElementById("transformScaleResult") as HTMLOutputElement).value = "1.5";
      (document.getElementById("transformMirrorH") as HTMLInputElement).checked = true;
    }
    const original = structuredClone(options);
    await apply();

    expect(replacementSnapshots).toEqual([{ options: original, stable: false, busy: true }]);
    expect(events).toEqual([
      "replacing",
      ...(tool.name === "submap" ? ["save-options"] : []),
      "density",
      "graph-size",
      "fit",
      "reset-zoom",
      "undraw",
      "resample",
      ...(tool.name === "submap" ? ["burg-styles"] : []),
      "draw",
      "register",
      "stats",
      "close"
    ]);
    expect(options.generation.graph.density).toBe(2);
    expect(resetZoom).toHaveBeenCalledExactlyOnceWith(0);
    const config = vi.mocked(Resample.process).mock.calls[0][0];
    if (tool.name === "submap") {
      expect(config.scale).toBe(2);
      expect(config.projection(70, 90)).toEqual([40, 100]);
      expect(config.inverse(40, 100)).toEqual([70, 90]);
      expect(options.map.geography.mapSize).toBe(40);
      expect(options.map.units.distance.scale).toBe(3);
      expect(options.map.units.population.scale).toBe(500);
      expect(styles.burgIcons.groups.village.groups.icons.options.size).toBe(2);
      expect(styles.labels.groups.burg.attrs["font-size"]).toBe("15%");
      expect(document.querySelector("#burgIcons > g")).toBeNull();
    } else {
      expect(config.scale).toBe(1);
      const point = config.projection(410, 320);
      expect(point[0]).toBeCloseTo(445);
      expect(point[1]).toBeCloseTo(295);
      const restored = config.inverse(...point);
      expect(restored[0]).toBeCloseTo(410);
      expect(restored[1]).toBeCloseTo(320);
      expect(options.map).toEqual(original.map);
    }
    expect(document.getElementById(tool.id)).toBeNull();
    expect(isMapModelStable()).toBe(true);
    expect(isMapIOBusy()).toBe(false);
  });

  it("holds ownership across await and rejects double clicks and the other replacement tool", async () => {
    const apply = openTool(tool);
    const other = openTool(tools.find(candidate => candidate !== tool)!);
    let resume!: () => void;
    vi.mocked(Resample.process).mockImplementation(() => {
      record("resample");
      return new Promise<void>(resolve => (resume = resolve));
    });
    const replacing = apply();
    try {
      expect(isMapModelStable()).toBe(false);
      expect(Layers.drawAll).not.toHaveBeenCalled();
      for (const kind of ["save", "load", "generate"] as const) expect(beginMapIO(kind)).toBeNull();
      await apply();
      await other();
      expect(Resample.process).toHaveBeenCalledOnce();
      expect(replacementSnapshots).toHaveLength(1);
      expect(events).not.toContain("close");
      expect(isMapIOBusy()).toBe(true);
      expect(isMapModelStable()).toBe(false);
      expect(tip).toHaveBeenCalledTimes(2);
    } finally {
      resume();
      await replacing;
    }
    expect(registerMap).toHaveBeenCalledOnce();
    expect(isMapIOBusy()).toBe(false);
    expect(isMapModelStable()).toBe(true);
  });

  it("keeps unchanged density and the optional submap style setting", async () => {
    const apply = openTool(tool);
    if (tool.name === "submap") {
      (document.getElementById("submapRescaleBurgStyles") as HTMLInputElement).checked = false;
    }
    await apply();
    expect(changeCellsDensity).not.toHaveBeenCalled();
    expect(events).not.toContain("burg-styles");
    expect(styles.burgIcons.groups.village.groups.icons.options.size).toBe(1);
    expect(Layers.drawAll).toHaveBeenCalledOnce();
    expect(registerMap).toHaveBeenCalledOnce();
  });

  it.each(["options", "resample", "resample rejection", "draw", "register", "stats"])(
    "releases ownership after a failure in %s without claiming rollback or stability",
    async stage => {
      const apply = openTool(tool);
      (document.getElementById(tool.points) as HTMLInputElement).value = "2";
      const fail = () => {
        throw new Error("Replacement failed");
      };
      if (stage === "options") {
        if (tool.name === "submap") vi.mocked(Options.save).mockImplementation(fail);
        else vi.mocked(changeCellsDensity).mockImplementation(fail);
      } else if (stage === "resample") vi.mocked(Resample.process).mockImplementation(fail);
      else if (stage === "resample rejection") {
        vi.mocked(Resample.process).mockImplementation(() => Promise.reject(new Error("Replacement failed")));
      } else if (stage === "draw") vi.mocked(Layers.drawAll).mockImplementation(fail);
      else if (stage === "register") vi.mocked(registerMap).mockImplementation(fail);
      else vi.mocked(logStats).mockImplementation(fail);

      await apply();
      expect(replacementSnapshots).toHaveLength(1);
      expect(isMapIOBusy()).toBe(false);
      expect(isMapModelStable()).toBe(false);
      expect(tip).toHaveBeenCalledWith(expect.stringContaining("地图可能已部分更改"), true, "error", 10000);
      expect(events).not.toContain("close");
      expect(document.getElementById(tool.id)).not.toBeNull();
      const next = beginMapIO("load");
      expect(next).not.toBeNull();
      next?.release();
    }
  );
});
