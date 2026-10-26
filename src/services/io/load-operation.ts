import { beginMapIO } from "./map-io";
import { getMapModelEpoch, isMapModelStable, markMapModelStable, markMapModelUnstable } from "./model-status";

export type MapLoadOutcome =
  | { type: "loaded" }
  | { type: "busy" }
  | { type: "rejected" }
  | { type: "cancelled" }
  | { type: "failed"; error: unknown };

export interface MapLoadControls {
  start(): void;
  cancel(): void;
}

// biome-ignore lint/suspicious/noConfusingVoidType: Allow a synchronous callback without cleanup, but never a promise.
export type MapLoadAuthorization<T> = (prepared: T, controls: MapLoadControls) => void | (() => void);

/** A result describes model adoption, not rollback or external resource readiness. */
export async function runMapLoad<T>(
  prepare: (controls: Pick<MapLoadControls, "cancel">) => Promise<T | null>,
  adopt: (prepared: T) => Promise<void> | void,
  beforeAdopt?: () => void,
  authorize?: MapLoadAuthorization<T>,
  canAdopt: () => boolean = () => true
): Promise<MapLoadOutcome> {
  const lease = beginMapIO("load");
  if (!lease) return { type: "busy" };
  const epoch = getMapModelEpoch();
  const wasStable = isMapModelStable();
  let adopting = false;
  let preparing = true;
  let cancelled = false;
  let finished = false;
  let dispose: (() => void) | undefined;
  try {
    const prepared = await prepare({
      cancel: () => {
        if (!preparing || adopting || finished) return;
        cancelled = true;
        lease.release();
      }
    });
    preparing = false;
    if (cancelled) return { type: "cancelled" };
    if (prepared === null) return { type: "rejected" };
    return await new Promise<MapLoadOutcome>((resolve, reject) => {
      let decided = false;
      const controls: MapLoadControls = {
        cancel() {
          if (decided) return;
          decided = true;
          resolve({ type: "cancelled" });
        },
        start() {
          if (decided) return;
          try {
            if (!lease.isCurrent() || epoch !== getMapModelEpoch() || wasStable !== isMapModelStable() || !canAdopt()) {
              controls.cancel();
              return;
            }
            decided = true;
            adopting = true;
            markMapModelUnstable();
            beforeAdopt?.();
            // Invoke before returning from the click, not after resolving a UI choice promise.
            Promise.resolve(adopt(prepared)).then(() => {
              markMapModelStable();
              resolve({ type: "loaded" });
            }, reject);
          } catch (error) {
            decided = true;
            reject(error);
          }
        }
      };
      try {
        if (authorize) {
          const cleanup = authorize(prepared, controls);
          if (typeof cleanup === "function") dispose = cleanup;
        } else controls.start();
      } catch (error) {
        // Once started, the adoption promise owns settlement and the lease.
        if (!decided) {
          decided = true;
          reject(error);
        }
      }
    });
  } catch (error) {
    if (
      !adopting &&
      (cancelled || (typeof error === "object" && error !== null && "name" in error && error.name === "AbortError"))
    ) {
      return { type: "cancelled" };
    }
    return { type: "failed", error };
  } finally {
    finished = true;
    try {
      dispose?.();
    } catch {
      // UI cleanup cannot turn a completed replacement into another operation's failure.
    }
    lease.release();
  }
}

export function readMapBlob(file: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result);
      else reject(new Error("未能读取地图文件字节"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("无法读取地图文件"));
    reader.onabort = () => reject(new DOMException("已取消读取地图文件", "AbortError"));
    reader.readAsArrayBuffer(file);
  });
}
