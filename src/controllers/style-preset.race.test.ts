// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMapModelEpoch, markMapModelStable, markMapModelUnstable } from "@/services/io/model-status";
import { StylePreset } from "./style-preset";

const boundary = vi.hoisted(() => ({
  load: vi.fn<(name: string) => Promise<{ name: string; styles: unknown; error?: string }>>(),
  confirm: vi.fn(),
  set: vi.fn(),
  write: vi.fn(),
  save: vi.fn(),
  tip: vi.fn(),
  remove: vi.fn(),
  refresh: vi.fn()
}));
vi.mock("@/components/dialog/dialog-helpers", () => ({
  alertDialog: vi.fn(),
  confirmationDialog: boundary.confirm,
  destroyDialog: vi.fn()
}));
vi.mock("@/components/icons", () => ({ CustomIcons: { all: [] } }));
vi.mock("@/components/tooltips", () => ({ tip: boundary.tip }));
vi.mock("@/components/zoom", () => ({ invokeActiveZooming: vi.fn() }));
vi.mock("@/controllers", () => ({ Controllers: { StyleEditor: { refresh: boundary.refresh } } }));
vi.mock("@/generators/styles", () => ({ Styles: { set: boundary.set, writeAll: boundary.write } }));
vi.mock("@/renderers/draw-vignette", () => ({ applyVignetteOptions: vi.fn() }));
vi.mock("@/renderers/heightmap-color-schemes", () => ({ HeightmapColorSchemes: { ensure: vi.fn() } }));
vi.mock("@/services/io/icons-archive", () => ({ IconsArchive: {} }));
vi.mock("@/services/style-presets", () => ({
  CUSTOM_PREFIX: "fmg-style-",
  LEGACY_PREFIX: "fmgStyle_",
  StylePresetsService: {
    load: boundary.load,
    parse: (value: unknown) => value,
    displayName: (name: string) => name,
    current: () => "default",
    isSystem: () => false,
    removeCustom: boundary.remove
  }
}));
vi.mock("@/utils", () => ({
  ensureEl: (id: string) => document.getElementById(id),
  downloadFile: vi.fn(),
  isValidJSON: vi.fn(),
  openURL: vi.fn(),
  uploadFile: vi.fn()
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

function replaceMap(): void {
  markMapModelUnstable();
  vi.stubGlobal("options", { map: { style: { preset: "target" }, labels: { groups: [] } } });
  markMapModelStable();
}

beforeEach(() => {
  vi.clearAllMocks();
  boundary.load.mockReset();
  boundary.refresh.mockResolvedValue(undefined);
  markMapModelStable();
  sessionStorage.clear();
  document.body.innerHTML = '<span id="stylePreset"></span><button id="addStyleButton"></button>';
  vi.stubGlobal("options", { map: { style: { preset: "old" }, labels: { groups: [] } } });
  vi.stubGlobal("styles", {
    heightmap: {
      groups: { landHeights: { options: { scheme: "land" } }, oceanHeights: { options: { scheme: "sea" } } }
    },
    labels: { groups: {} }
  });
  vi.stubGlobal("Options", { save: boundary.save });
  vi.stubGlobal("Burgs", { ensureBurgGroupStyles: vi.fn() });
  vi.stubGlobal("Routes", { ensureRouteGroupStyles: vi.fn() });
  vi.stubGlobal("Lakes", { ensureLakeGroupStyles: vi.fn() });
  vi.stubGlobal("Layers", { drawAll: vi.fn() });
});

afterEach(() => {
  markMapModelStable();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("style preset replacement fence", () => {
  it("still applies an ordinary completed style choice on the same map", async () => {
    boundary.load.mockResolvedValue({ name: "ink", styles: { valid: true } });
    await StylePreset.change("ink");
    expect(options.map.style.preset).toBe("ink");
    expect(boundary.save).toHaveBeenCalledOnce();
    expect(boundary.set).toHaveBeenCalledWith({ valid: true });
    expect(boundary.write).toHaveBeenCalledOnce();
  });

  it("drops an old in-flight style after a completed replacement", async () => {
    const pending = deferred<{ name: string; styles: unknown }>();
    boundary.load.mockReturnValue(pending.promise);
    const change = StylePreset.change("ink");
    const epoch = getMapModelEpoch();
    replaceMap();
    expect(getMapModelEpoch()).not.toBe(epoch);
    pending.resolve({ name: "ink", styles: { old: true } });
    await change;
    expect(options.map.style.preset).toBe("target");
    expect(boundary.save).not.toHaveBeenCalled();
    expect(boundary.set).not.toHaveBeenCalled();
    expect(boundary.refresh).not.toHaveBeenCalled();
  });

  it("drops an old in-flight style when replacement fails and stays quarantined", async () => {
    const pending = deferred<{ name: string; styles: unknown }>();
    boundary.load.mockReturnValue(pending.promise);
    const change = StylePreset.change("ink");
    markMapModelUnstable();
    pending.resolve({ name: "ink", styles: { old: true } });
    await change;
    expect(options.map.style.preset).toBe("old");
    expect(boundary.save).not.toHaveBeenCalled();
    expect(boundary.set).not.toHaveBeenCalled();
  });

  it("does not start another preset request in quarantine", async () => {
    markMapModelUnstable();
    await StylePreset.change("ink");
    StylePreset.requestChange("ink");
    expect(boundary.load).not.toHaveBeenCalled();
    expect(boundary.confirm).not.toHaveBeenCalled();
  });

  it("does not suppress a pending style merely because a read was cancelled without replacing the map", async () => {
    const pending = deferred<{ name: string; styles: unknown }>();
    boundary.load.mockReturnValue(pending.promise);
    const change = StylePreset.change("ink");
    const epoch = getMapModelEpoch();
    markMapModelStable();
    expect(getMapModelEpoch()).toBe(epoch);
    pending.resolve({ name: "ink", styles: { valid: true } });
    await change;
    expect(options.map.style.preset).toBe("ink");
    expect(boundary.set).toHaveBeenCalledOnce();
  });

  it("does not show an obsolete fallback tip on the new map", async () => {
    const pending = deferred<{ name: string; styles: unknown; error?: string }>();
    boundary.load.mockReturnValue(pending.promise);
    const change = StylePreset.change("ink");
    replaceMap();
    pending.resolve({ name: "default", styles: {}, error: "unavailable" });
    await change;
    expect(boundary.tip).not.toHaveBeenCalled();
  });

  it("ignores an old change confirmation before requesting or applying styles", () => {
    StylePreset.requestChange("ink");
    const confirm = boundary.confirm.mock.calls[0][0].onConfirm as () => void;
    replaceMap();
    confirm();
    expect(boundary.load).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("fmg-style-change-confirmed")).toBeNull();
  });

  it("ignores an old removal confirmation rather than changing the new map", () => {
    StylePreset.remove("custom-style");
    const confirm = boundary.confirm.mock.calls[0][0].onConfirm as () => void;
    replaceMap();
    confirm();
    expect(boundary.remove).not.toHaveBeenCalled();
    expect(boundary.load).not.toHaveBeenCalled();
    expect(boundary.refresh).not.toHaveBeenCalled();
  });

  it("does not apply a late startup preset to a map loaded in the meantime", async () => {
    const pending = deferred<{ name: string; styles: unknown }>();
    boundary.load.mockReturnValue(pending.promise);
    const change = StylePreset.applyOnLoad();
    replaceMap();
    pending.resolve({ name: "default", styles: {} });
    await change;
    expect(options.map.style.preset).toBe("target");
    expect(boundary.set).not.toHaveBeenCalled();
    expect(boundary.save).not.toHaveBeenCalled();
  });
});
