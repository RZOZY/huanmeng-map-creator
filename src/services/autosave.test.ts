// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tip } from "@/components/tooltips";
import { Services } from "@/services";
import { ra } from "@/utils";
import { initiateAutosave } from "./autosave";
import { runMapLoad } from "./io/load-operation";
import { beginMapIO, isMapIOBusy } from "./io/map-io";
import { isMapModelStable, markMapModelStable, markMapModelUnstable } from "./io/model-status";

vi.mock("@/components/tooltips", () => ({ tip: vi.fn() }));
vi.mock("@/services", () => ({ Services: { Save: { prepareMapData: vi.fn(), writeToStorage: vi.fn() } } }));
vi.mock("@/utils", () => ({ ra: vi.fn((values: string[]) => values[0]) }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  markMapModelStable();
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.stubGlobal("options", { app: { autosave: { interval: 1, remind: false } } });
  vi.stubGlobal("customization", 0);
  vi.stubGlobal("ERROR", false);
  vi.mocked(Services.Save.prepareMapData).mockResolvedValue("complete model");
  vi.mocked(Services.Save.writeToStorage).mockResolvedValue(undefined);
});

afterEach(() => {
  markMapModelStable();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  expect(isMapIOBusy()).toBe(false);
});

describe("autosave operation isolation", () => {
  it.each(["load", "generate", "save"] as const)(
    "never serializes a partial model during %s and retries after the lease ends",
    async kind => {
      const lease = beginMapIO(kind);
      expect(lease).not.toBeNull();
      try {
        initiateAutosave();
        await vi.advanceTimersByTimeAsync(60_000);
        expect(Services.Save.prepareMapData).not.toHaveBeenCalled();
        expect(Services.Save.writeToStorage).not.toHaveBeenCalled();
      } finally {
        lease?.release();
      }
      await vi.advanceTimersByTimeAsync(30_000);
      expect(Services.Save.prepareMapData).toHaveBeenCalledOnce();
      expect(Services.Save.writeToStorage).toHaveBeenCalledExactlyOnceWith("complete model");
      expect(isMapIOBusy()).toBe(false);
    }
  );

  it("owns a save lease through both lazy serialization and the storage acknowledgement", async () => {
    const preparation = deferred<string>();
    const write = deferred<void>();
    vi.mocked(Services.Save.prepareMapData).mockReturnValue(preparation.promise);
    vi.mocked(Services.Save.writeToStorage).mockReturnValue(write.promise);
    initiateAutosave();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(isMapIOBusy()).toBe(true);
    expect(beginMapIO("load")).toBeNull();
    expect(Services.Save.writeToStorage).not.toHaveBeenCalled();
    preparation.resolve("complete model");
    await vi.advanceTimersByTimeAsync(0);
    expect(Services.Save.writeToStorage).toHaveBeenCalledOnce();
    expect(isMapIOBusy()).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(Services.Save.prepareMapData).toHaveBeenCalledOnce();
    expect(beginMapIO("generate")).toBeNull();
    write.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(isMapIOBusy()).toBe(false);
    expect(tip).toHaveBeenCalledWith("Autosave: map is saved", false, "success", 2000);
  });

  it.each(["prepare", "write"] as const)("releases the lease after %s fails and permits a later retry", async phase => {
    const error = new Error("unavailable storage");
    if (phase === "prepare") vi.mocked(Services.Save.prepareMapData).mockRejectedValueOnce(error);
    else vi.mocked(Services.Save.writeToStorage).mockRejectedValueOnce(error);
    initiateAutosave();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(isMapIOBusy()).toBe(false);
    expect(tip).toHaveBeenCalledWith("Autosave failed: unavailable storage", true, "error", 4000);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(Services.Save.prepareMapData).toHaveBeenCalledTimes(2);
    expect(isMapIOBusy()).toBe(false);
  });

  it("preserves the last good backup after adoption fails and retries only after a successful load", async () => {
    const failed = await runMapLoad(
      async () => "mixed settings and cells",
      () => {
        throw new Error("bad font JSON");
      }
    );
    expect(failed.type).toBe("failed");
    expect(isMapIOBusy()).toBe(false);
    expect(isMapModelStable()).toBe(false);
    initiateAutosave();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(Services.Save.prepareMapData).not.toHaveBeenCalled();
    expect(Services.Save.writeToStorage).not.toHaveBeenCalled();
    await expect(
      runMapLoad(
        async () => "reopened original",
        () => {}
      )
    ).resolves.toEqual({ type: "loaded" });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(Services.Save.writeToStorage).toHaveBeenCalledExactlyOnceWith("complete model");
  });

  it("does not treat a generated event before a later adoption error as a safe autosave checkpoint", async () => {
    await runMapLoad(
      async () => "partial",
      () => {
        window.dispatchEvent(new Event("map:generated"));
        throw new Error("later adoption failure");
      }
    );
    initiateAutosave();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(Services.Save.prepareMapData).not.toHaveBeenCalled();
    expect(Services.Save.writeToStorage).not.toHaveBeenCalled();
  });

  it("does not replace the recovery warning with save reminders while quarantined", async () => {
    markMapModelUnstable();
    options.app.autosave.interval = 0;
    options.app.autosave.remind = true;
    initiateAutosave();
    await vi.advanceTimersByTimeAsync(15 * 60_000);
    expect(ra).not.toHaveBeenCalled();
    expect(tip).not.toHaveBeenCalled();
  });

  it("keeps disabled autosave from reading or locking the model", async () => {
    options.app.autosave.interval = 0;
    initiateAutosave();
    await vi.advanceTimersByTimeAsync(300_000);
    expect(Services.Save.prepareMapData).not.toHaveBeenCalled();
    expect(isMapIOBusy()).toBe(false);
  });

  it("does not acquire a save lease during edit mode", async () => {
    vi.stubGlobal("customization", 1);
    initiateAutosave();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(Services.Save.prepareMapData).not.toHaveBeenCalled();
    expect(isMapIOBusy()).toBe(false);
  });

  it("does not overwrite operation feedback with reminders while I/O is busy", async () => {
    options.app.autosave.interval = 0;
    options.app.autosave.remind = true;
    const lease = beginMapIO("load");
    try {
      initiateAutosave();
      await vi.advanceTimersByTimeAsync(15 * 60_000);
      expect(ra).not.toHaveBeenCalled();
      expect(tip).not.toHaveBeenCalled();
    } finally {
      lease?.release();
    }
    await vi.advanceTimersByTimeAsync(15 * 60_000);
    expect(ra).toHaveBeenCalledOnce();
  });
});
