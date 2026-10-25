// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Layers } from "@/components/layers";
import { Climate } from "@/generators/climate-generator";
import { WorldConfigurator } from "./world-configurator";

vi.mock("@/components/dialog/dialog-helpers", () => ({ destroyDialog: vi.fn() }));
vi.mock("@/components/layers", () => ({ Layers: { draw: vi.fn() } }));
vi.mock("@/components/pins", () => ({ Pins: { bindIcons: vi.fn(), set: vi.fn() } }));
vi.mock("@/generators/climate-generator", () => ({ Climate: { regenerate: vi.fn() } }));

let applyWorld: () => void;

beforeEach(() => {
  options = Options.getDefaultOptions();
  document.body.innerHTML = '<div id="dialogs"></div>';
  vi.stubGlobal("customization", 0);
  vi.stubGlobal("Coordinates", { calculate: vi.fn() });
  vi.stubGlobal("$", () => ({
    dialog: (config: { buttons: Record<string, () => void> }) => {
      applyWorld = Object.values(config.buttons)[0];
    }
  }));
  vi.clearAllMocks();
  WorldConfigurator.open();
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
  localStorage.clear();
});

test("warns that climate updates replace manual river and ice edits", () => {
  expect(document.getElementById("worldConfigurator")?.textContent).toContain(
    "更新气候会重新生成河流与冰层，覆盖相关手动编辑；城镇与标签保持不变。"
  );
});

test("the apply button refreshes climate data and redraws ice along with the climate layers", () => {
  applyWorld();

  expect(Climate.regenerate).toHaveBeenCalledOnce();
  expect(Layers.draw).toHaveBeenCalledWith("temperature", "precipitation");
  expect(Layers.draw).toHaveBeenCalledWith("biomes", "coordinates", "rivers", "ice");
});

test("automatic position edits use the same complete climate refresh", () => {
  document.body.insertAdjacentHTML("beforeend", '<input id="wcAutoChange" type="checkbox" checked>');
  const latitude = document.getElementById("latitudeInput") as HTMLInputElement;
  latitude.value = "25";
  latitude.dispatchEvent(new Event("input", { bubbles: true }));

  expect(options.map.geography.latitude).toBe(25);
  expect(Climate.regenerate).toHaveBeenCalledOnce();
  expect(Layers.draw).toHaveBeenCalledWith("biomes", "coordinates", "rivers", "ice");
});
