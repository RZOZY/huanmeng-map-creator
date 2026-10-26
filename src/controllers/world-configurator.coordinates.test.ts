// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { Pins } from "@/components/pins";
import { Climate } from "@/generators/climate-generator";
import { Coordinates } from "@/generators/coordinates";
import { WorldConfigurator } from "./world-configurator";

vi.mock("@/components/dialog/dialog-helpers", () => ({
  destroyDialog: vi.fn((id: string) => document.getElementById(id)?.remove())
}));
vi.mock("@/components/layers", () => ({ Layers: { draw: vi.fn() } }));
vi.mock("@/components/pins", () => ({ Pins: { bindIcons: vi.fn(), set: vi.fn() } }));
vi.mock("@/generators/climate-generator", () => ({ Climate: { regenerate: vi.fn() } }));

const savedCoordinates = { latT: 39.3, latN: 59.3, latS: 20, lonT: 70, lonW: 78, lonE: 148 };
let applyWorld: () => void;

beforeEach(() => {
  options = Options.getDefaultOptions();
  options.map.graph.width = 1600;
  options.map.graph.height = 900;
  options.map.geography = { mapSize: 60, latitude: 0, longitude: 0, coordinates: { ...savedCoordinates } };
  document.body.innerHTML = '<div id="dialogs"></div>';
  vi.stubGlobal("customization", 0);
  vi.stubGlobal("Coordinates", Coordinates);
  vi.stubGlobal("$", () => ({
    dialog: (config: { buttons: Record<string, () => void> }) => {
      applyWorld = Object.values(config.buttons)[0];
    }
  }));
  vi.spyOn(Coordinates, "calculate");
  vi.spyOn(Options, "save").mockImplementation(() => {});
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

function inputValue(id: string, value: string): void {
  const input = document.getElementById(id) as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function setAutomaticUpdates(enabled: boolean): void {
  document.body.insertAdjacentHTML("beforeend", '<input id="wcAutoChange" type="checkbox">');
  (document.getElementById("wcAutoChange") as HTMLInputElement).checked = enabled;
}

test("opening and reopening preserves the saved frame without rewriting legacy controls", () => {
  const savedMap = structuredClone(options.map);
  const coordinates = options.map.geography.coordinates;

  for (let opened = 0; opened < 2; opened++) {
    WorldConfigurator.open();

    expect(options.map).toEqual(savedMap);
    expect(options.map.geography.coordinates).toBe(coordinates);
    expect((document.getElementById("mapSizeInput") as HTMLInputElement).value).toBe("60");
    expect((document.getElementById("latitudeInput") as HTMLInputElement).value).toBe("0");
    expect((document.getElementById("longitudeInput") as HTMLInputElement).value).toBe("0");
    expect(document.getElementById("mapCoordinates")?.textContent).toContain("59°N");
    expect(document.getElementById("mapCoordinates")?.textContent).toContain("20°N");
    expect(document.getElementById("globeArea")?.getAttribute("d")).toBeTruthy();
  }

  expect(Coordinates.calculate).not.toHaveBeenCalled();
  expect(Options.save).not.toHaveBeenCalled();
  expect(Climate.regenerate).not.toHaveBeenCalled();
});

test("applying the unchanged world keeps the saved frame during the globe preview", () => {
  WorldConfigurator.open();
  vi.mocked(Coordinates.calculate).mockClear();

  applyWorld();

  expect(options.map.geography.coordinates).toEqual(savedCoordinates);
  expect(Coordinates.calculate).not.toHaveBeenCalled();
  expect(Climate.regenerate).toHaveBeenCalledOnce();
});

test.each([
  ["temperatureEquator", "30"],
  ["prec", "125"]
])("automatic %s edits keep the saved frame", (key, value) => {
  WorldConfigurator.open();
  setAutomaticUpdates(true);
  vi.mocked(Coordinates.calculate).mockClear();

  inputValue(`${key}Input`, value);

  expect(options.map.geography.coordinates).toEqual(savedCoordinates);
  expect(Coordinates.calculate).not.toHaveBeenCalled();
  expect(Climate.regenerate).toHaveBeenCalledOnce();
  expect(Pins.set).toHaveBeenCalledWith(key, Number(value));
  expect(Options.save).toHaveBeenCalledOnce();
});

describe.each([false, true])("explicit geography edits with automatic updates %s", autoUpdate => {
  test.each([
    ["mapSize", "30", { latT: 54, latN: 90, latS: 36, lonT: 96, lonW: 84, lonE: 180 }],
    ["latitude", "25", { latT: 108, latN: 72, latS: -36, lonT: 192, lonW: -12, lonE: 180 }],
    ["longitude", "50", { latT: 108, latN: 90, latS: -18, lonT: 192, lonW: -96, lonE: 96 }]
  ] as const)("%s still recalculates using the existing algorithm", (key, value, expected) => {
    WorldConfigurator.open();
    setAutomaticUpdates(autoUpdate);
    vi.mocked(Coordinates.calculate).mockClear();

    inputValue(`${key}Input`, value);

    expect(options.map.geography[key]).toBe(Number(value));
    expect(options.map.geography.coordinates).toEqual(expected);
    expect(Coordinates.calculate).toHaveBeenCalled();
    expect((document.getElementById(`${key}Output`) as HTMLInputElement).value).toBe(value);
    expect(Pins.set).toHaveBeenCalledWith(key, Number(value));
    expect(Options.save).toHaveBeenCalledOnce();
    expect(Climate.regenerate).toHaveBeenCalledTimes(autoUpdate ? 1 : 0);
  });
});

test.each([
  ["wcWholeWorld", 100, 50, { latT: 180, latN: 90, latS: -90, lonT: 320, lonW: -140, lonE: 180 }],
  ["wcNorthern", 33, 25, { latT: 59.4, latN: 59.9, latS: 0.5, lonT: 105.6, lonW: 74.4, lonE: 180 }],
  ["wcTropical", 33, 50, { latT: 59.4, latN: 29.7, latS: -29.7, lonT: 105.6, lonW: 74.4, lonE: 180 }],
  ["wcSouthern", 33, 75, { latT: 59.4, latN: -0.4, latS: -59.8, lonT: 105.6, lonW: 74.4, lonE: 180 }]
] as const)("the %s preset still explicitly recalculates coordinates", (id, size, latitude, expected) => {
  WorldConfigurator.open();
  setAutomaticUpdates(true);
  vi.mocked(Coordinates.calculate).mockClear();

  (document.getElementById(id) as HTMLButtonElement).click();

  expect(options.map.geography).toEqual({ mapSize: size, latitude, longitude: 0, coordinates: expected });
  expect(Coordinates.calculate).toHaveBeenCalled();
  expect(Pins.set).toHaveBeenCalledWith("mapSize", size);
  expect(Pins.set).toHaveBeenCalledWith("latitude", latitude);
  expect(Options.save).toHaveBeenCalledOnce();
  expect(Climate.regenerate).toHaveBeenCalledOnce();
});
