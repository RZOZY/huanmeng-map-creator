// @vitest-environment jsdom
import Alea from "alea";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { confirmationDialog } from "@/components/dialog/dialog-helpers";
import { generate } from "@/components/lifecycle";
import { Pins } from "@/components/pins";
import { GenerationPipeline } from "@/generators/generation-pipeline";
import { drawHeights } from "@/renderers/draw-heightmap";
import { HeightmapColorSchemes } from "@/renderers/heightmap-color-schemes";
import "@/generators/grid-generator";
import "@/generators/heightmap-generator";

vi.mock("@/components/dialog/dialog-helpers", () => ({ closeDialogs: vi.fn(), confirmationDialog: vi.fn() }));
vi.mock("@/components/options/tabs/options-tab", () => ({ syncOptionInputs: vi.fn() }));
vi.mock("@/components/shell", () => ({ initShell: vi.fn(), warnIfServerless: vi.fn() }));
vi.mock("@/components/zoom", () => ({ invokeActiveZooming: vi.fn(), resetZoom: vi.fn() }));
vi.mock("@/services/url-params", () => ({ checkLoadParameters: vi.fn() }));
vi.mock("@/services/logging", () => ({ logStats: vi.fn() }));
vi.mock("@/services", () => ({ Services: {} }));
vi.mock("@/data/heightmap-templates", () => ({
  heightmapTemplates: { test: { name: "Download", probability: 1, template: "Hill 1 40 75-75 75-75" } }
}));
vi.mock("@/data/precreated-heightmaps", () => ({ precreatedHeightmaps: {} }));
vi.mock("@/renderers/draw-heightmap", () => ({
  drawHeightmap: vi.fn(),
  drawHeights: vi.fn(() => "data:image/png;base64,")
}));

interface SelectionDialog {
  title: string;
  buttons: Record<string, (this: HTMLElement) => void>;
  close: () => void;
}

const dialog = vi.fn<(settings: SelectionDialog | "close") => void>();
const regenerate = vi.fn();
let selection: typeof import("./heightmap-selection");

function openSelection(): SelectionDialog {
  selection.HeightmapSelection.open();
  const settings = dialog.mock.calls.at(-1)?.[0];
  if (!settings || typeof settings === "string") throw new Error("Missing heightmap selection dialog");
  return settings;
}

function getElement<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element: ${id}`);
  return element as T;
}

beforeAll(async () => {
  document.body.innerHTML = '<div id="dialogs"></div>';
  localStorage.clear();
  options = Options.getDefaultOptions();
  options.map.graph = { width: 800, height: 600, points: 1000 };
  options.generation.graph = { width: 800, height: 600, density: 1 };
  globalThis.grid = Grid.generate("old", 800, 600);
  vi.stubGlobal("aleaPRNG", Alea);
  vi.stubGlobal("$", () => ({ dialog }));
  vi.stubGlobal("regeneratePrompt", regenerate);
  vi.spyOn(GenerationPipeline, "run").mockImplementation(async ({ graph }) => {
    Grid.prepare(graph);
    await HeightmapGenerator.generate();
  });
  selection = await import("./heightmap-selection");
});

afterAll(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllTimers();
});

it.each([
  { width: 1600, height: 900, density: 1, points: 1000 },
  { width: 800, height: 600, density: 2, points: 2000 }
])("builds the selected preview for $width × $height and $points points", async requested => {
  options.map.graph = { width: 800, height: 600, points: 1000 };
  globalThis.grid = Grid.generate("old", 800, 600);
  const original = structuredClone(options.map);
  options.generation.graph = requested;
  options.generation.template = "test";
  Pins.clear("points");
  const settings = openSelection();
  expect(options.map).toEqual(original);

  const previewHeights = Array.from(vi.mocked(drawHeights).mock.calls.at(-1)![0].heights);
  settings.buttons.新建地图.call(getElement("heightmapSelection"));
  const config = regenerate.mock.calls.at(-1)![0];
  expect(config).toMatchObject({ width: requested.width, height: requested.height, points: requested.points });

  await generate(config);
  expect(options.map.graph).toEqual({ width: requested.width, height: requested.height, points: requested.points });
  expect(grid.spacing).toBe(Math.round(Math.sqrt((requested.width * requested.height) / requested.points) * 100) / 100);
  expect(grid.points.some(([x]) => x > requested.width * 0.9)).toBe(true);
  const generated = grid.cells.h;
  expect(Array.from(generated)).toEqual(previewHeights);
  expect(Math.max(...generated)).toBeGreaterThan(0);
});

it("renders Chinese section headings and preview controls from the owned template", () => {
  openSelection();
  const pane = getElement("heightmapSelection");
  expect(Array.from(pane.querySelectorAll("h1"), heading => heading.textContent)).toEqual([
    "高度图模板",
    "预制高度图",
    "选项"
  ]);
  expect(getElement("heightmapSelectionRedrawPreview").textContent?.trim()).toBe("重绘预览");
  expect(pane.querySelector('label[for="heightmapSelectionRenderOcean"]')?.textContent).toBe("显示海底高度");
  expect(getElement("heightmapSelectionColorScheme").parentElement?.textContent).toContain("配色方案");
  expect(getElement("heightmapSelectionEditTemplates").textContent).toBe("编辑模板");
  expect(getElement("heightmapSelectionImportHeightmap").textContent).toBe("导入高度图");
});

it("renders precise Chinese hints without changing tool identifiers", () => {
  const expected = [
    "选择高度图模板：每次生成的地图各不相同，但外观风格相似",
    "重新生成预览",
    "选择预制高度图：每次生成地图时都使用相同的高度图",
    "重新绘制所有预览图",
    "显示水域单元格的高度",
    "高度图预览使用的配色方案",
    "打开模板编辑器",
    "打开图像转换器"
  ];
  expect(
    Array.from(getElement("heightmapSelection").querySelectorAll<HTMLElement>("[data-tip]"), el => el.dataset.tip)
  ).toEqual(expected);
  expect(getElement("heightmapSelectionEditTemplates").dataset.tool).toBe("templateEditor");
  expect(getElement("heightmapSelectionImportHeightmap").dataset.tool).toBe("imageConverter");
});

it("preserves dynamic template names, seeds, scheme labels and machine values", () => {
  const originalMap = structuredClone(options.map);
  openSelection();
  const article = getElement("heightmapSelection").querySelector<HTMLElement>("article");
  expect(article?.dataset.id).toBe("test");
  expect(article?.dataset.seed).toBeTruthy();
  expect(article?.querySelector("img")?.alt).toBe("Download");
  expect(article?.querySelector("div")?.textContent?.trim()).toBe("Download");
  const schemeOptions = getElement<HTMLSelectElement>("heightmapSelectionColorScheme").options;
  expect(Array.from(schemeOptions, option => option.value)).toEqual(HeightmapColorSchemes.names());
  expect(Array.from(schemeOptions, option => option.textContent)).toEqual(HeightmapColorSchemes.names());
  expect(options.map).toEqual(originalMap);
});

it("keeps the Chinese cancel callback non-destructive and leaves the default Escape setting unchanged", () => {
  const original = structuredClone(options.generation);
  const regenerationCount = regenerate.mock.calls.length;
  const settings = openSelection();
  expect(settings.title).toBe("选择高度图");
  expect(Object.keys(settings.buttons)).toEqual(["取消", "选择", "新建地图"]);
  expect(settings).not.toHaveProperty("closeOnEscape");
  settings.buttons.取消.call(getElement("heightmapSelection"));
  expect(dialog).toHaveBeenLastCalledWith("close");
  expect(options.generation).toEqual(original);
  expect(regenerate).toHaveBeenCalledTimes(regenerationCount);
});

it("selects the original template ID and pins it without regenerating the current map", () => {
  options.generation.template = "unselected";
  const originalMap = structuredClone(options.map);
  const regenerationCount = regenerate.mock.calls.length;
  const settings = openSelection();
  getElement("heightmapSelection").querySelector<HTMLElement>("article")!.click();
  settings.buttons.选择.call(getElement("heightmapSelection"));
  expect(options.generation.template).toBe("test");
  expect(Pins.all().template).toBe("test");
  expect(options.map).toEqual(originalMap);
  expect(regenerate).toHaveBeenCalledTimes(regenerationCount);
  expect(dialog).toHaveBeenLastCalledWith("close");
});

it("redraws the same preview after ocean, color scheme and redraw controls change", () => {
  openSelection();
  const originalMap = structuredClone(options.map);
  const calls = vi.mocked(drawHeights).mock.calls.length;
  const ocean = getElement<HTMLInputElement>("heightmapSelectionRenderOcean");
  ocean.checked = true;
  ocean.dispatchEvent(new Event("change"));
  expect(drawHeights).toHaveBeenCalledTimes(calls + 1);
  expect(vi.mocked(drawHeights).mock.calls.at(-1)?.[0].renderOcean).toBe(true);
  const scheme = getElement<HTMLSelectElement>("heightmapSelectionColorScheme");
  scheme.value = "green";
  scheme.dispatchEvent(new Event("change"));
  expect(vi.mocked(drawHeights).mock.calls.at(-1)?.[0].scheme).toBe(HeightmapColorSchemes.get("green"));
  getElement("heightmapSelectionRedrawPreview").click();
  expect(drawHeights).toHaveBeenCalledTimes(calls + 3);
  expect(options.map).toEqual(originalMap);
});

it.each([
  { id: "heightmapSelectionEditTemplates", title: "打开模板编辑器", tool: "templateEditor" },
  { id: "heightmapSelectionImportHeightmap", title: "打开图像转换器", tool: "imageConverter" }
])("requires Chinese destructive-action confirmation before opening $tool", ({ id, title, tool }) => {
  const openEditor = vi.fn();
  const originalMap = structuredClone(options.map);
  vi.stubGlobal("Controllers", { HeightmapEditor: { open: openEditor } });
  getElement(id).click();
  const confirmation = vi.mocked(confirmationDialog).mock.calls.at(-1)?.[0];
  expect(confirmation).toMatchObject({
    title,
    message: "打开此工具将清除当前地图。确定要继续吗？",
    confirm: "继续",
    cancel: "取消"
  });
  expect(openEditor).not.toHaveBeenCalled();
  expect(options.map).toEqual(originalMap);
  confirmation?.onConfirm?.();
  expect(openEditor).toHaveBeenCalledExactlyOnceWith({ mode: "erase", tool });
});

it("retains close cleanup and can rebuild previews when reopened", () => {
  const settings = openSelection();
  const originalMap = structuredClone(options.map);
  const clearData = vi.spyOn(HeightmapGenerator, "clearData");
  settings.close();
  expect(clearData).toHaveBeenCalledOnce();
  const calls = vi.mocked(drawHeights).mock.calls.length;
  getElement("heightmapSelectionRedrawPreview").click();
  expect(drawHeights).toHaveBeenCalledTimes(calls);
  openSelection();
  expect(drawHeights).toHaveBeenCalledTimes(calls + 1);
  expect(options.map).toEqual(originalMap);
});
