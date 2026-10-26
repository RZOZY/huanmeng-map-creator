import { describe, expect, it } from "vitest";
import { LAYER_TOGGLES } from "@/data/layer-labels";
import { getCommandSearchText } from "./command-search";

const PRESETS = [
  "political",
  "cultural",
  "religions",
  "provinces",
  "biomes",
  "heightmap",
  "physical",
  "poi",
  "goods",
  "trade",
  "military",
  "emblems",
  "landmass"
];

describe("built-in command search text", () => {
  it("projects Chinese text without changing command identity or its English source", () => {
    const command = Object.freeze({ id: "editStatesButton", name: "Open States Editor" });
    expect(getCommandSearchText(command)).toEqual({ name: "打开国家编辑器", keywords: "王国 邦国" });
    expect(command).toEqual({ id: "editStatesButton", name: "Open States Editor" });
    const text = getCommandSearchText(command);
    text.name = "custom";
    expect(getCommandSearchText(command).name).toBe("打开国家编辑器");
  });

  it("keeps technical formats and service names in display text", () => {
    for (const [id, token] of [
      ["saveToDropbox", "Dropbox"],
      ["loadFromURL", "URL"],
      ["exportSvg", "SVG"],
      ["exportPng", "PNG"],
      ["exportJpeg", "JPEG"],
      ["exportJsonPackCells", "JSON"],
      ["exportGeoJsonCells", "GeoJSON"],
      ["exportCsvBurgs", "CSV"],
      ["viewMesh", "3D"]
    ]) {
      expect(getCommandSearchText({ id, name: token }).name).toContain(token);
    }
  });

  it("covers current layer command IDs with plain Chinese text, not shortcut markup", () => {
    expect(LAYER_TOGGLES.size).toBe(33);
    for (const [id, layer] of LAYER_TOGGLES) {
      const text = getCommandSearchText({ id: `layer:${id}`, name: `Toggle ${layer.label}` });
      expect(text.name).toMatch(/^切换.+图层$/);
      expect(text.name).not.toMatch(/[<>]/);
      expect(text.keywords).toContain("显示 隐藏");
    }
  });

  it.each(PRESETS)("covers the known built-in preset %s", id => {
    const text = getCommandSearchText({ id: `preset:${id}`, name: id });
    expect(text.name).toMatch(/^应用图层预设：\p{Script=Han}+/u);
    expect(text.keywords).toContain("图层 预设");
  });

  it.each([
    "userCommand",
    "preset:my-map",
    "layer:my-layer",
    "__proto__",
    "constructor",
    "layer:constructor",
    "preset:constructor"
  ])("does not blindly translate unknown or inherited IDs: %s", id => {
    const name = '<img src=x onerror="bad()"> Open States Editor 国家';
    expect(getCommandSearchText({ id, name })).toEqual({ name, keywords: "" });
  });
});
