// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Services } from "@/services";
import { downloadFile } from "@/utils/fileUtils";
import { beginMapIO, isMapIOBusy } from "./map-io";
import { markMapModelStable, markMapModelUnstable } from "./model-status";
import { type MapSaveOutcome, Save } from "./save";

vi.mock("@/components/layers", () => ({ Layers: { state: {} } }));
vi.mock("@/generators/graph-override", () => ({ GraphOverride: { state: {} } }));
vi.mock("@/generators/notes", () => ({ Notes: { list: () => [] } }));
vi.mock("@/services/fonts", () => ({ getUsedFonts: () => [] }));
vi.mock("@/services", () => ({ Services: { Cloud: { save: vi.fn() } } }));
vi.mock("@/utils/fileUtils", () => ({ downloadFile: vi.fn() }));

function makeFile() {
  const stream = {
    write: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    abort: vi.fn().mockResolvedValue(undefined)
  };
  return { stream, handle: { name: "用户副本.map", createWritable: vi.fn().mockResolvedValue(stream) } };
}

beforeEach(() => {
  vi.mocked(Services.Cloud.save).mockReset();
  markMapModelStable();
  window.dispatchEvent(new Event("map:generated"));
  document.body.innerHTML =
    '<div id="tooltip"></div><div id="alertMessage"></div><svg id="map" xmlns="http://www.w3.org/2000/svg"><g id="viewbox"/></svg>';
  vi.stubGlobal("customization", 0);
  vi.stubGlobal("alertMessage", document.getElementById("alertMessage"));
  vi.stubGlobal(
    "$",
    vi.fn(() => ({ dialog: vi.fn(), not: () => ({ each: () => {} }) }))
  );
  vi.stubGlobal("Names", { getNameBases: () => [], nameBases: [] });
  vi.stubGlobal("styles", {});
  vi.stubGlobal("mapHistory", [{ created: 123 }]);
  vi.stubGlobal("grid", {
    spacing: 1,
    cellsX: 1,
    cellsY: 1,
    boundary: [],
    points: [[0, 0]],
    features: [],
    cells: { h: [21], prec: [1], f: [0], t: [0], temp: [0] }
  });
  vi.stubGlobal("pack", { cells: { pop: [0] } });
  vi.stubGlobal("showSaveFilePicker", undefined);
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  expect(isMapIOBusy()).toBe(false);
});

describe("observable save command results", () => {
  it("reports saved only after write and close have both completed", async () => {
    const { stream, handle } = makeFile();
    let finish!: () => void;
    stream.close.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          finish = resolve;
        })
    );
    vi.stubGlobal("showSaveFilePicker", vi.fn().mockResolvedValue(handle));
    const saving = Save.toMachine();
    await vi.waitFor(() => expect(stream.close).toHaveBeenCalledOnce());
    expect(isMapIOBusy()).toBe(true);
    expect(stream.write).toHaveBeenCalledOnce();
    finish();
    await expect(saving).resolves.toEqual({ type: "saved", filename: "用户副本.map" });
  });

  it("distinguishes picker cancellation from a successful save", async () => {
    vi.stubGlobal("showSaveFilePicker", vi.fn().mockRejectedValue(new DOMException("cancel", "AbortError")));
    await expect(Save.toMachine()).resolves.toEqual({ type: "cancelled" });
  });

  it("reports a download request without claiming the file has been saved", async () => {
    await expect(Save.toMachine()).resolves.toEqual({ type: "downloaded-fallback" });
    expect(downloadFile).toHaveBeenCalledOnce();
    expect(document.getElementById("tooltip")!.textContent).toContain("已发起地图下载");
    expect(document.getElementById("tooltip")!.textContent).not.toContain("已保存");
  });

  it.each(["toMachine", "toStorage", "toDropbox"] as const)("returns busy from %s", async method => {
    const lease = beginMapIO("load")!;
    try {
      await expect(Save[method]()).resolves.toEqual({ type: "busy" });
    } finally {
      lease.release();
    }
    expect(downloadFile).not.toHaveBeenCalled();
  });

  it.each(["edit-mode", "unstable-model"] as const)("returns the specific %s rejection", async reason => {
    if (reason === "edit-mode") vi.stubGlobal("customization", 1);
    else markMapModelUnstable();
    await expect(Save.toMachine()).resolves.toEqual({ type: "rejected", reason });
    expect(downloadFile).not.toHaveBeenCalled();
  });

  it.each(["picker", "permission"] as const)("rechecks edit mode after a pending %s", async stage => {
    const { stream, handle } = makeFile();
    let resume!: () => void;
    const pending = new Promise<void>(resolve => {
      resume = resolve;
    });
    vi.stubGlobal(
      "showSaveFilePicker",
      vi.fn(async () => {
        if (stage === "picker") await pending;
        return handle;
      })
    );
    if (stage === "permission")
      handle.createWritable.mockImplementation(async () => {
        await pending;
        return stream;
      });
    const saving = Save.toMachine();
    if (stage === "permission") await vi.waitFor(() => expect(handle.createWritable).toHaveBeenCalledOnce());
    vi.stubGlobal("customization", 1);
    resume();
    await expect(saving).resolves.toEqual({ type: "rejected", reason: "edit-mode" });
    expect(stream.write).not.toHaveBeenCalled();
    expect(stream.close).not.toHaveBeenCalled();
    expect(stream.abort).toHaveBeenCalledOnce();
  });

  it("preserves the original failure object even when error feedback throws", async () => {
    const error = { message: "permission denied", original: true };
    vi.stubGlobal("showSaveFilePicker", vi.fn().mockRejectedValue(error));
    vi.stubGlobal(
      "$",
      vi.fn(() => ({
        not: () => ({ each: () => {} }),
        dialog: () => {
          throw new Error("dialog unavailable");
        }
      }))
    );
    const result = await Save.toMachine();
    expect(result).toEqual({ type: "failed", error });
    if (result.type !== "failed") throw new Error("Expected failed outcome");
    expect(result.error).toBe(error);
  });

  it("does not turn an already completed write into a failure when its tooltip throws", async () => {
    const { stream, handle } = makeFile();
    vi.stubGlobal("showSaveFilePicker", vi.fn().mockResolvedValue(handle));
    Object.defineProperty(document.getElementById("tooltip"), "innerHTML", {
      configurable: true,
      set() {
        throw new Error("tooltip unavailable");
      }
    });
    await expect(Save.toMachine()).resolves.toEqual({ type: "saved", filename: "用户副本.map" });
    expect(stream.close).toHaveBeenCalledOnce();
  });

  it.each(["toStorage", "toDropbox"] as const)("holds the lease through the pending %s operation", async method => {
    let finish!: (value: boolean) => void;
    const pending = new Promise<boolean>(resolve => {
      finish = resolve;
    });
    vi.stubGlobal("ldb", { set: vi.fn(() => pending) });
    vi.mocked(Services.Cloud.save).mockReturnValueOnce(pending);
    const saving = Save[method]();
    await Promise.resolve();
    try {
      expect(isMapIOBusy()).toBe(true);
      await expect(Save.toMachine()).resolves.toEqual({ type: "busy" });
    } finally {
      finish(true);
    }
    await expect(saving).resolves.toEqual({ type: "stored", target: method === "toStorage" ? "browser" : "dropbox" });
  });

  it.each(["picker", "permission"] as const)(
    "rejects a model that became unstable during %s without a replacement event",
    async stage => {
      const { stream, handle } = makeFile();
      let resume!: () => void;
      const pending = new Promise<void>(resolve => {
        resume = resolve;
      });
      vi.stubGlobal(
        "showSaveFilePicker",
        vi.fn(async () => {
          if (stage === "picker") await pending;
          return handle;
        })
      );
      if (stage === "permission")
        handle.createWritable.mockImplementation(async () => {
          await pending;
          return stream;
        });
      const saving = Save.toMachine();
      if (stage === "permission") await vi.waitFor(() => expect(handle.createWritable).toHaveBeenCalledOnce());
      markMapModelUnstable();
      resume();
      await expect(saving).resolves.toEqual({ type: "rejected", reason: "unstable-model" });
      expect(stream.write).not.toHaveBeenCalled();
      expect(stream.close).not.toHaveBeenCalled();
      expect(stream.abort).toHaveBeenCalledOnce();
    }
  );

  it.each(["toStorage", "toDropbox"] as const)(
    "preserves the %s failure object and releases the lease",
    async method => {
      const error = { message: "transaction aborted", original: true };
      vi.stubGlobal("ldb", { set: vi.fn().mockRejectedValue(error) });
      vi.mocked(Services.Cloud.save).mockRejectedValue(error);
      const outcome = await Save[method]();
      if (outcome.type !== "failed") throw new Error("Expected failed outcome");
      expect(outcome.error).toBe(error);
      expect(isMapIOBusy()).toBe(false);
    }
  );

  it.each([false, true])("keeps a retry independent of the first failure (retry fails: %s)", async failsAgain => {
    const firstError = new Error("first write failed");
    const secondError = new Error("second write failed");
    const { handle } = makeFile();
    const picker = vi.fn().mockRejectedValueOnce(firstError);
    if (failsAgain) picker.mockRejectedValueOnce(secondError);
    else picker.mockResolvedValueOnce(handle);
    vi.stubGlobal("showSaveFilePicker", picker);
    let retry: (() => Promise<MapSaveOutcome>) | undefined;
    vi.stubGlobal(
      "$",
      vi.fn(() => ({
        not: () => ({ each: () => {} }),
        dialog: (config: string | { buttons?: { 重试?: (this: HTMLElement) => Promise<MapSaveOutcome> } }) => {
          if (config === "close") throw new Error("closing dialog failed");
          if (typeof config === "object" && config.buttons?.重试) retry = config.buttons.重试.bind(alertMessage);
        }
      }))
    );
    const first = await Save.toMachine();
    if (first.type !== "failed" || !retry) throw new Error("Expected failed outcome and retry");
    expect(first.error).toBe(firstError);
    const second = await retry();
    if (failsAgain) {
      if (second.type !== "failed") throw new Error("Expected second failure");
      expect(second.error).toBe(secondError);
    } else expect(second).toEqual({ type: "saved", filename: "用户副本.map" });
    expect(first.error).toBe(firstError);
    expect(isMapIOBusy()).toBe(false);
  });

  it.each(["busy", "rejected"] as const)("preserves %s when warning feedback throws", async kind => {
    Object.defineProperty(document.getElementById("tooltip"), "innerHTML", {
      configurable: true,
      set() {
        throw new Error("tooltip unavailable");
      }
    });
    const lease = kind === "busy" ? beginMapIO("load") : null;
    if (kind === "rejected") markMapModelUnstable();
    try {
      await expect(Save.toMachine()).resolves.toEqual(
        kind === "busy" ? { type: "busy" } : { type: "rejected", reason: "unstable-model" }
      );
    } finally {
      lease?.release();
    }
  });

  it("does not relabel an after-close map invalidation as user cancellation", async () => {
    const { stream, handle } = makeFile();
    stream.close.mockImplementation(async () => {
      window.dispatchEvent(new Event("map:replacing"));
    });
    vi.stubGlobal("showSaveFilePicker", vi.fn().mockResolvedValue(handle));
    await expect(Save.toMachine()).resolves.toEqual({ type: "invalidated" });
    expect(stream.close).toHaveBeenCalledOnce();
  });
});
