// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadFile } from "@/utils/fileUtils";
import { beginMapIO, isMapIOBusy } from "./map-io";
import { markMapModelStable, markMapModelUnstable } from "./model-status";
import { saveToFileSystem } from "./save-to-file";

vi.mock("@/utils/fileUtils", () => ({ downloadFile: vi.fn() }));

function makeHandle(name = "Chosen.map") {
  const stream = {
    write: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    abort: vi.fn().mockResolvedValue(undefined)
  };
  const handle = { name, createWritable: vi.fn().mockResolvedValue(stream) };
  return { handle, stream };
}

beforeEach(() => {
  markMapModelStable();
  window.dispatchEvent(new Event("map:generated"));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  expect(isMapIOBusy()).toBe(false);
});

describe("saveToFileSystem", () => {
  it.each(["picker", "fallback"] as const)("does not serialize a quarantined model through %s", async mode => {
    const picker = vi.fn();
    vi.stubGlobal("showSaveFilePicker", mode === "picker" ? picker : undefined);
    const prepare = vi.fn(() => "partial model");
    markMapModelUnstable();
    await expect(saveToFileSystem(prepare, "Original.map")).resolves.toEqual({ type: "cancelled" });
    expect(picker).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
    expect(downloadFile).not.toHaveBeenCalled();
    expect(isMapIOBusy()).toBe(false);
  });
  it("picks a destination before preparing data and waits for close before reporting success", async () => {
    const { handle, stream } = makeHandle();
    let choose!: (handle: unknown) => void;
    const picker = vi.fn(
      () =>
        new Promise(resolve => {
          choose = resolve;
        })
    );
    vi.stubGlobal("showSaveFilePicker", picker);
    const prepare = vi.fn(() => "world\r\n世界 🌍");
    let close!: () => void;
    stream.close.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          close = resolve;
        })
    );

    const result = saveToFileSystem(prepare, "Suggested.map");
    expect(picker).toHaveBeenCalledWith({
      suggestedName: "Suggested.map",
      types: [{ description: "幻梦地图文件", accept: { "application/octet-stream": [".map"] } }]
    });
    expect(prepare).not.toHaveBeenCalled();
    choose(handle);
    await vi.waitFor(() => expect(stream.close).toHaveBeenCalledOnce());
    expect(prepare).toHaveBeenCalledOnce();
    expect(stream.write).toHaveBeenCalledWith("world\r\n世界 🌍");
    let settled = false;
    void result.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    close();
    await expect(result).resolves.toEqual({ type: "saved", filename: "Chosen.map" });
  });

  it("reuses the chosen file until Save As selects a new destination", async () => {
    const first = makeHandle("First.map");
    const second = makeHandle("Second.map");
    const picker = vi.fn().mockResolvedValueOnce(first.handle).mockResolvedValueOnce(second.handle);
    vi.stubGlobal("showSaveFilePicker", picker);
    await saveToFileSystem(() => "one", "Suggested.map");
    await saveToFileSystem(() => "two", "Suggested.map");
    await saveToFileSystem(() => "three", "Suggested.map", true);
    await saveToFileSystem(() => "four", "Suggested.map");
    expect(picker).toHaveBeenCalledTimes(2);
    expect(first.stream.write.mock.calls).toEqual([["one"], ["two"]]);
    expect(second.stream.write.mock.calls).toEqual([["three"], ["four"]]);
  });

  it("retains the previous destination when Save As is cancelled", async () => {
    const { handle, stream } = makeHandle();
    const picker = vi
      .fn()
      .mockResolvedValueOnce(handle)
      .mockRejectedValueOnce(new DOMException("Cancelled", "AbortError"));
    vi.stubGlobal("showSaveFilePicker", picker);
    await saveToFileSystem(() => "one", "Map.map");
    const prepare = vi.fn(() => "cancelled");
    await expect(saveToFileSystem(prepare, "Copy.map", true)).resolves.toEqual({ type: "cancelled" });
    await saveToFileSystem(() => "two", "Map.map");
    expect(picker).toHaveBeenCalledTimes(2);
    expect(prepare).not.toHaveBeenCalled();
    expect(stream.write.mock.calls).toEqual([["one"], ["two"]]);
  });

  it("forgets the destination when another map is generated or loaded", async () => {
    const first = makeHandle("First.map");
    const second = makeHandle("Second.map");
    const picker = vi.fn().mockResolvedValueOnce(first.handle).mockResolvedValueOnce(second.handle);
    vi.stubGlobal("showSaveFilePicker", picker);
    await saveToFileSystem(() => "first map", "Map.map");
    window.dispatchEvent(new Event("map:generated"));
    await saveToFileSystem(() => "second map", "Map.map");
    expect(picker).toHaveBeenCalledTimes(2);
    expect(first.stream.write).toHaveBeenCalledExactlyOnceWith("first map");
    expect(second.stream.write).toHaveBeenCalledExactlyOnceWith("second map");
  });

  it("ignores overlapping saves while the picker is pending", async () => {
    const { handle } = makeHandle();
    let choose!: (handle: unknown) => void;
    const picker = vi.fn(
      () =>
        new Promise(resolve => {
          choose = resolve;
        })
    );
    vi.stubGlobal("showSaveFilePicker", picker);
    const first = saveToFileSystem(() => "one", "Map.map");
    const prepare = vi.fn(() => "two");
    await expect(saveToFileSystem(prepare, "Map.map")).resolves.toEqual({ type: "cancelled" });
    expect(picker).toHaveBeenCalledOnce();
    expect(prepare).not.toHaveBeenCalled();
    choose(handle);
    await first;
  });

  it.each(["picker", "permission"])(
    "does not write a new map into the previous map's file during a pending %s",
    async stage => {
      const { handle, stream } = makeHandle();
      const changeMap = () => window.dispatchEvent(new Event("map:generated"));
      vi.stubGlobal(
        "showSaveFilePicker",
        vi.fn(async () => {
          if (stage === "picker") changeMap();
          return handle;
        })
      );
      handle.createWritable.mockImplementation(async () => {
        changeMap();
        return stream;
      });
      const prepare = vi.fn(() => "new map");
      await expect(saveToFileSystem(prepare, "Old.map")).resolves.toEqual({ type: "cancelled" });
      expect(prepare).not.toHaveBeenCalled();
      expect(stream.write).not.toHaveBeenCalled();
      if (stage === "permission") expect(stream.abort).toHaveBeenCalledOnce();
    }
  );

  it("does not restore an old destination if the map changes during a write", async () => {
    const first = makeHandle("First.map");
    const second = makeHandle("Second.map");
    first.stream.close.mockImplementation(async () => window.dispatchEvent(new Event("map:generated")));
    const picker = vi.fn().mockResolvedValueOnce(first.handle).mockResolvedValueOnce(second.handle);
    vi.stubGlobal("showSaveFilePicker", picker);
    await expect(saveToFileSystem(() => "first", "Map.map")).resolves.toEqual({ type: "cancelled" });
    await saveToFileSystem(() => "second", "Map.map");
    expect(picker).toHaveBeenCalledTimes(2);
    expect(second.stream.write).toHaveBeenCalledWith("second");
  });

  it.each(["picker", "permission"])(
    "does not serialize a partially replaced map during a pending %s without a generated event",
    async stage => {
      const { handle, stream } = makeHandle();
      const replaceMap = () => window.dispatchEvent(new Event("map:replacing"));
      vi.stubGlobal(
        "showSaveFilePicker",
        vi.fn(async () => {
          if (stage === "picker") replaceMap();
          return handle;
        })
      );
      handle.createWritable.mockImplementation(async () => {
        replaceMap();
        return stream;
      });
      const prepare = vi.fn(() => "partially replaced map");
      await expect(saveToFileSystem(prepare, "Old.map")).resolves.toEqual({ type: "cancelled" });
      expect(prepare).not.toHaveBeenCalled();
      expect(stream.write).not.toHaveBeenCalled();
      expect(stream.close).not.toHaveBeenCalled();
      if (stage === "permission") expect(stream.abort).toHaveBeenCalledOnce();
      else expect(handle.createWritable).not.toHaveBeenCalled();
    }
  );

  it.each([
    { operation: "write", event: "map:replacing" },
    { operation: "close", event: "map:replacing" },
    { operation: "write", event: "map:generated" },
    { operation: "close", event: "map:generated" }
  ] as const)(
    "does not commit or restore a destination when $event occurs during $operation",
    async ({ operation, event }) => {
      const first = makeHandle("Original.map");
      const second = makeHandle("Replacement.map");
      const picker = vi.fn().mockResolvedValueOnce(first.handle).mockResolvedValueOnce(second.handle);
      vi.stubGlobal("showSaveFilePicker", picker);
      await saveToFileSystem(() => "original", "Map.map");
      first.stream.close.mockClear();
      first.stream[operation].mockImplementationOnce(async () => {
        window.dispatchEvent(new Event(event));
      });
      await expect(saveToFileSystem(() => "original snapshot", "Map.map")).resolves.toEqual({ type: "cancelled" });
      if (operation === "write") {
        expect(first.stream.abort).toHaveBeenCalledOnce();
        expect(first.stream.close).not.toHaveBeenCalled();
      } else {
        expect(first.stream.close).toHaveBeenCalledOnce();
        expect(first.stream.abort).not.toHaveBeenCalled();
      }
      await expect(saveToFileSystem(() => "replacement", "Map.map")).resolves.toEqual({
        type: "saved",
        filename: "Replacement.map"
      });
      expect(picker).toHaveBeenCalledTimes(2);
      expect(first.stream.write.mock.calls).toEqual([["original"], ["original snapshot"]]);
      expect(second.stream.write).toHaveBeenCalledExactlyOnceWith("replacement");
    }
  );

  it.each(["map:replacing", "map:generated"])(
    "propagates an abort failure without closing when %s invalidates a completed write",
    async event => {
      const { handle, stream } = makeHandle();
      const error = new Error("Abort failed after write");
      vi.stubGlobal("showSaveFilePicker", vi.fn().mockResolvedValue(handle));
      stream.write.mockImplementationOnce(async () => {
        window.dispatchEvent(new Event(event));
      });
      stream.abort.mockRejectedValue(error);
      await expect(saveToFileSystem(() => "original snapshot", "Map.map")).rejects.toBe(error);
      expect(stream.abort).toHaveBeenCalled();
      expect(stream.close).not.toHaveBeenCalled();
      expect(isMapIOBusy()).toBe(false);
    }
  );

  it("forgets the previous destination on replacing even if generation never completes", async () => {
    const first = makeHandle("Original.map");
    const second = makeHandle("Recovered.map");
    const picker = vi.fn().mockResolvedValueOnce(first.handle).mockResolvedValueOnce(second.handle);
    vi.stubGlobal("showSaveFilePicker", picker);
    await saveToFileSystem(() => "original", "Map.map");
    window.dispatchEvent(new Event("map:replacing"));
    await saveToFileSystem(() => "recovered", "Map.map");
    expect(picker).toHaveBeenCalledTimes(2);
    expect(first.stream.write).toHaveBeenCalledExactlyOnceWith("original");
    expect(second.stream.write).toHaveBeenCalledExactlyOnceWith("recovered");
  });

  it.each(["load", "generate"] as const)("does not pick or serialize while %s holds the lease", async kind => {
    const picker = vi.fn();
    vi.stubGlobal("showSaveFilePicker", picker);
    const prepare = vi.fn(() => "busy map");
    const lease = beginMapIO(kind);
    try {
      expect(lease).not.toBeNull();
      await expect(saveToFileSystem(prepare, "Map.map")).resolves.toEqual({ type: "cancelled" });
      expect(picker).not.toHaveBeenCalled();
      expect(prepare).not.toHaveBeenCalled();
      expect(downloadFile).not.toHaveBeenCalled();
      expect(isMapIOBusy()).toBe(true);
    } finally {
      lease?.release();
    }
  });

  it.each(["load", "generate"] as const)("does not download a fallback while %s holds the lease", async kind => {
    vi.stubGlobal("showSaveFilePicker", undefined);
    const prepare = vi.fn(() => "busy map");
    const lease = beginMapIO(kind);
    try {
      expect(lease).not.toBeNull();
      await expect(saveToFileSystem(prepare, "Map.map")).resolves.toEqual({ type: "cancelled" });
      expect(prepare).not.toHaveBeenCalled();
      expect(downloadFile).not.toHaveBeenCalled();
      expect(isMapIOBusy()).toBe(true);
    } finally {
      lease?.release();
    }
  });

  it.each(["picker", "permission", "write", "close", "abort"] as const)(
    "holds the save lease until a pending %s settles",
    async stage => {
      const { handle, stream } = makeHandle();
      let resume!: () => void;
      const pending = new Promise<void>(resolve => {
        resume = resolve;
      });
      const picker = vi.fn(async () => {
        if (stage === "picker") await pending;
        return handle;
      });
      vi.stubGlobal("showSaveFilePicker", picker);
      if (stage === "permission") {
        handle.createWritable.mockImplementation(async () => {
          await pending;
          return stream;
        });
      } else if (stage !== "picker") {
        stream[stage].mockImplementation(() => pending);
      }
      const error = new Error("Serialization failed");
      const prepare = () => {
        if (stage === "abort") throw error;
        return "snapshot";
      };
      const result = saveToFileSystem(prepare, "Map.map").catch((error: unknown) => error);
      try {
        const operation = stage === "picker" ? picker : stage === "permission" ? handle.createWritable : stream[stage];
        await vi.waitFor(() => expect(operation).toHaveBeenCalledOnce());
        expect(isMapIOBusy()).toBe(true);
        for (const kind of ["save", "load", "generate"] as const) {
          const unexpected = beginMapIO(kind);
          try {
            expect(unexpected).toBeNull();
          } finally {
            unexpected?.release();
          }
        }
      } finally {
        resume();
        await result;
      }
      expect(await result).toEqual(stage === "abort" ? error : { type: "saved", filename: "Chosen.map" });
      expect(isMapIOBusy()).toBe(false);
    }
  );

  it("asks for a new destination on retry after access to the saved file is lost", async () => {
    const first = makeHandle("First.map");
    const second = makeHandle("Second.map");
    const picker = vi.fn().mockResolvedValueOnce(first.handle).mockResolvedValueOnce(second.handle);
    vi.stubGlobal("showSaveFilePicker", picker);
    await saveToFileSystem(() => "one", "Map.map");
    const error = new DOMException("File missing", "NotFoundError");
    first.handle.createWritable.mockRejectedValueOnce(error);
    const prepare = vi.fn(() => "two");
    await expect(saveToFileSystem(prepare, "Map.map")).rejects.toBe(error);
    expect(prepare).not.toHaveBeenCalled();
    await saveToFileSystem(prepare, "Map.map");
    expect(picker).toHaveBeenCalledTimes(2);
    expect(second.stream.write).toHaveBeenCalledWith("two");
  });

  it("retains the old destination if writing a Save As copy fails", async () => {
    const first = makeHandle("First.map");
    const second = makeHandle("Copy.map");
    const picker = vi.fn().mockResolvedValueOnce(first.handle).mockResolvedValueOnce(second.handle);
    vi.stubGlobal("showSaveFilePicker", picker);
    await saveToFileSystem(() => "one", "Map.map");
    second.stream.write.mockRejectedValueOnce(new Error("Disk full"));
    await expect(saveToFileSystem(() => "two", "Copy.map", true)).rejects.toThrow("Disk full");
    await saveToFileSystem(() => "three", "Map.map");
    expect(picker).toHaveBeenCalledTimes(2);
    expect(first.stream.write.mock.calls).toEqual([["one"], ["three"]]);
  });

  it.each([new DOMException("Cancelled", "AbortError"), { name: "AbortError" }])(
    "cancels without preparing data or downloading (%s)",
    async error => {
      vi.stubGlobal("showSaveFilePicker", vi.fn().mockRejectedValue(error));
      const prepare = vi.fn(() => "data");
      await expect(saveToFileSystem(prepare, "Map.map")).resolves.toEqual({ type: "cancelled" });
      expect(prepare).not.toHaveBeenCalled();
      expect(downloadFile).not.toHaveBeenCalled();
    }
  );

  it("uses the existing download helper when the API is absent", async () => {
    vi.stubGlobal("showSaveFilePicker", undefined);
    await expect(saveToFileSystem(() => "data", "Map.map")).resolves.toEqual({ type: "downloaded-fallback" });
    expect(downloadFile).toHaveBeenCalledExactlyOnceWith("data", "Map.map");
  });

  it.each(["prepare", "download"])("releases the lease after a fallback %s exception", async stage => {
    vi.stubGlobal("showSaveFilePicker", undefined);
    const error = new Error("Fallback failed");
    const prepare = () => {
      if (stage === "prepare") throw error;
      return "data";
    };
    if (stage === "download") {
      vi.mocked(downloadFile).mockImplementationOnce(() => {
        throw error;
      });
    }
    await expect(saveToFileSystem(prepare, "Map.map")).rejects.toBe(error);
    expect(isMapIOBusy()).toBe(false);
    await expect(saveToFileSystem(() => "retry", "Map.map")).resolves.toEqual({ type: "downloaded-fallback" });
  });

  it("releases the lease when aborting a replaced map fails", async () => {
    const { handle, stream } = makeHandle();
    const error = new Error("Abort failed");
    vi.stubGlobal("showSaveFilePicker", vi.fn().mockResolvedValue(handle));
    handle.createWritable.mockImplementation(async () => {
      window.dispatchEvent(new Event("map:replacing"));
      return stream;
    });
    stream.abort.mockRejectedValue(error);
    const prepare = vi.fn(() => "partially replaced map");
    await expect(saveToFileSystem(prepare, "Map.map")).rejects.toBe(error);
    expect(prepare).not.toHaveBeenCalled();
    expect(stream.write).not.toHaveBeenCalled();
    expect(isMapIOBusy()).toBe(false);
  });

  it("propagates picker permission errors without silently downloading", async () => {
    const error = new DOMException("Permission denied", "SecurityError");
    vi.stubGlobal("showSaveFilePicker", vi.fn().mockRejectedValue(error));
    const prepare = vi.fn(() => "data");
    await expect(saveToFileSystem(prepare, "Map.map")).rejects.toBe(error);
    expect(prepare).not.toHaveBeenCalled();
    expect(downloadFile).not.toHaveBeenCalled();
  });

  it("aborts the stream without committing when serialization fails", async () => {
    const { handle, stream } = makeHandle();
    vi.stubGlobal("showSaveFilePicker", vi.fn().mockResolvedValue(handle));
    const error = new Error("Serialization failed");
    await expect(
      saveToFileSystem(() => {
        throw error;
      }, "Map.map")
    ).rejects.toBe(error);
    expect(stream.abort).toHaveBeenCalledOnce();
    expect(stream.write).not.toHaveBeenCalled();
    expect(stream.close).not.toHaveBeenCalled();
  });

  it("propagates createWritable permission errors", async () => {
    const { handle } = makeHandle();
    const error = new DOMException("Permission denied", "NotAllowedError");
    handle.createWritable.mockRejectedValue(error);
    vi.stubGlobal("showSaveFilePicker", vi.fn().mockResolvedValue(handle));
    await expect(saveToFileSystem(() => "data", "Map.map")).rejects.toBe(error);
  });

  it.each(["write", "close"] as const)("aborts and propagates a %s failure, even an AbortError", async operation => {
    const { handle, stream } = makeHandle();
    const error = new DOMException("Disk write failed", "AbortError");
    stream[operation].mockRejectedValue(error);
    stream.abort.mockRejectedValue(new Error("Already closed"));
    vi.stubGlobal("showSaveFilePicker", vi.fn().mockResolvedValue(handle));
    await expect(saveToFileSystem(() => "data", "Map.map")).rejects.toBe(error);
    expect(stream.abort).toHaveBeenCalledOnce();
    if (operation === "write") expect(stream.close).not.toHaveBeenCalled();
  });
});
