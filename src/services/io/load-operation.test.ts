// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readMapBlob, runMapLoad } from "./load-operation";
import { beginMapIO, isMapIOBusy } from "./map-io";
import { isMapModelStable, markMapModelStable, markMapModelUnstable } from "./model-status";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(markMapModelStable);
afterEach(() => {
  markMapModelStable();
  vi.unstubAllGlobals();
});

describe("awaitable map load", () => {
  it("holds the lease through preparation and adoption, not just FileReader completion", async () => {
    const preparation = deferred<{ seed: string } | null>();
    const adoption = deferred<void>();
    const order: string[] = [];
    const beforeAdopt = vi.fn(() => order.push("replacing"));
    const adopt = vi.fn(async () => {
      order.push("adopt");
      await adoption.promise;
    });
    const operation = runMapLoad(() => preparation.promise, adopt, beforeAdopt);
    expect(isMapIOBusy()).toBe(true);
    expect(adopt).not.toHaveBeenCalled();
    expect(beginMapIO("save")).toBeNull();
    expect(beginMapIO("generate")).toBeNull();
    preparation.resolve({ seed: "target" });
    await vi.waitFor(() => expect(adopt).toHaveBeenCalledExactlyOnceWith({ seed: "target" }));
    expect(order).toEqual(["replacing", "adopt"]);
    expect(isMapIOBusy()).toBe(true);
    let settled = false;
    void operation.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    adoption.resolve();
    await expect(operation).resolves.toEqual({ type: "loaded" });
    expect(isMapIOBusy()).toBe(false);
  });

  it.each(["save", "load", "generate"] as const)("rejects a concurrent %s without reading or mutating", async kind => {
    const lease = beginMapIO(kind);
    expect(lease).not.toBeNull();
    try {
      const prepare = vi.fn(async () => "target");
      const adopt = vi.fn();
      const beforeAdopt = vi.fn();
      await expect(runMapLoad(prepare, adopt, beforeAdopt)).resolves.toEqual({ type: "busy" });
      expect(prepare).not.toHaveBeenCalled();
      expect(beforeAdopt).not.toHaveBeenCalled();
      expect(adopt).not.toHaveBeenCalled();
      expect(isMapIOBusy()).toBe(true);
    } finally {
      lease?.release();
    }
    expect(isMapIOBusy()).toBe(false);
  });

  it("rejects an unsupported file without starting replacement", async () => {
    const beforeAdopt = vi.fn();
    const adopt = vi.fn();
    await expect(runMapLoad(async () => null, adopt, beforeAdopt)).resolves.toEqual({ type: "rejected" });
    expect(beforeAdopt).not.toHaveBeenCalled();
    expect(adopt).not.toHaveBeenCalled();
    expect(isMapIOBusy()).toBe(false);
  });

  it("returns a read failure without touching the old model and releases the lease", async () => {
    const error = new Error("unreadable file");
    const beforeAdopt = vi.fn();
    const adopt = vi.fn();
    await expect(
      runMapLoad(
        async () => {
          throw error;
        },
        adopt,
        beforeAdopt
      )
    ).resolves.toEqual({ type: "failed", error });
    expect(beforeAdopt).not.toHaveBeenCalled();
    expect(adopt).not.toHaveBeenCalled();
    expect(isMapIOBusy()).toBe(false);
  });

  it("does not report success when adoption throws, including after a legacy generated event", async () => {
    const error = new Error("post-registration failure");
    const replacing = vi.fn(() => window.dispatchEvent(new Event("map:replacing")));
    const adopt = vi.fn(async () => {
      window.dispatchEvent(new Event("map:generated"));
      throw error;
    });
    await expect(runMapLoad(async () => "target", adopt, replacing)).resolves.toEqual({ type: "failed", error });
    expect(replacing).toHaveBeenCalledOnce();
    expect(isMapIOBusy()).toBe(false);
  });

  it("releases the lease if replacement notification itself fails", async () => {
    const error = new Error("notification failure");
    const adopt = vi.fn();
    await expect(
      runMapLoad(
        async () => "target",
        adopt,
        () => {
          throw error;
        }
      )
    ).resolves.toEqual({ type: "failed", error });
    expect(adopt).not.toHaveBeenCalled();
    expect(isMapIOBusy()).toBe(false);
  });

  it("reports an aborted read as cancelled and does not adopt", async () => {
    const adopt = vi.fn();
    await expect(
      runMapLoad(async () => {
        throw new DOMException("cancelled", "AbortError");
      }, adopt)
    ).resolves.toEqual({ type: "cancelled" });
    expect(adopt).not.toHaveBeenCalled();
    expect(isMapIOBusy()).toBe(false);
  });

  it("treats an AbortError during adoption as a failure, not a harmless read cancellation", async () => {
    const error = new DOMException("adoption interrupted", "AbortError");
    await expect(
      runMapLoad(
        async () => "target",
        async () => {
          throw error;
        }
      )
    ).resolves.toEqual({ type: "failed", error });
    expect(isMapIOBusy()).toBe(false);
  });

  it("permits the next load after an earlier failed load", async () => {
    await runMapLoad(async () => {
      throw new Error("bad file");
    }, vi.fn());
    const adopt = vi.fn();
    await expect(runMapLoad(async () => "good file", adopt)).resolves.toEqual({ type: "loaded" });
    expect(adopt).toHaveBeenCalledExactlyOnceWith("good file");
  });
});

describe("failed adoption quarantine", () => {
  it("marks the model unstable before replacement notifications and only completes after adoption", async () => {
    const adoption = deferred<void>();
    const operation = runMapLoad(
      async () => "target",
      () => adoption.promise,
      () => {
        expect(isMapModelStable()).toBe(false);
      }
    );
    await vi.waitFor(() => expect(isMapModelStable()).toBe(false));
    expect(isMapIOBusy()).toBe(true);
    adoption.resolve();
    await expect(operation).resolves.toEqual({ type: "loaded" });
    expect(isMapModelStable()).toBe(true);
  });

  it("does not let an early legacy generated event clear an adoption failure", async () => {
    const error = new Error("failed after registration");
    await expect(
      runMapLoad(
        async () => "partial",
        () => {
          window.dispatchEvent(new Event("map:generated"));
          throw error;
        }
      )
    ).resolves.toEqual({ type: "failed", error });
    expect(isMapIOBusy()).toBe(false);
    expect(isMapModelStable()).toBe(false);
    await expect(
      runMapLoad(
        async () => "complete",
        () => {}
      )
    ).resolves.toEqual({ type: "loaded" });
    expect(isMapModelStable()).toBe(true);
  });

  it("keeps a rejected retry quarantined instead of blessing an earlier partial model", async () => {
    markMapModelUnstable();
    await expect(runMapLoad(async () => null, vi.fn())).resolves.toEqual({ type: "rejected" });
    expect(isMapModelStable()).toBe(false);
  });

  it("does not quarantine an intact model when source reading fails", async () => {
    await runMapLoad(async () => {
      throw new Error("network failed");
    }, vi.fn());
    expect(isMapModelStable()).toBe(true);
  });

  it("treats an aborted replacement notification as failed adoption and preserves quarantine", async () => {
    const error = new DOMException("mutation aborted", "AbortError");
    await expect(
      runMapLoad(
        async () => "target",
        vi.fn(),
        () => {
          throw error;
        }
      )
    ).resolves.toEqual({ type: "failed", error });
    expect(isMapIOBusy()).toBe(false);
    expect(isMapModelStable()).toBe(false);
  });
});

describe("map Blob reader", () => {
  it("reads the exact bytes including UTF-8 and zero bytes", async () => {
    const expected = new Uint8Array([0, 255, 0xe4, 0xb8, 0xad, 13, 10]);
    expect(new Uint8Array(await readMapBlob(new Blob([expected])))).toEqual(expected);
  });

  it.each(["error", "abort", "invalid-result", "throw"] as const)(
    "rejects FileReader %s instead of resolving on loadend",
    async behavior => {
      const error = new DOMException("disk error", "NotReadableError");
      class Reader {
        result: ArrayBuffer | string | null = null;
        error = error;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        onabort: (() => void) | null = null;
        readAsArrayBuffer() {
          if (behavior === "throw") throw error;
          if (behavior === "error") this.onerror?.();
          if (behavior === "abort") this.onabort?.();
          if (behavior === "invalid-result") {
            this.result = "not an ArrayBuffer";
            this.onload?.();
          }
        }
      }
      vi.stubGlobal("FileReader", Reader);
      const result = readMapBlob(new Blob(["test"]));
      if (behavior === "abort") await expect(result).rejects.toMatchObject({ name: "AbortError" });
      else if (behavior === "invalid-result") await expect(result).rejects.toBeInstanceOf(Error);
      else await expect(result).rejects.toBe(error);
    }
  );
});
