import { beginMapIO } from "./map-io";
import { markMapModelStable, markMapModelUnstable } from "./model-status";

export type MapLoadOutcome =
  | { type: "loaded" }
  | { type: "busy" }
  | { type: "rejected" }
  | { type: "cancelled" }
  | { type: "failed"; error: unknown };

/** A result describes model adoption, not rollback or external resource readiness. */
export async function runMapLoad<T>(
  prepare: () => Promise<T | null>,
  adopt: (prepared: T) => Promise<void> | void,
  beforeAdopt?: () => void
): Promise<MapLoadOutcome> {
  const lease = beginMapIO("load");
  if (!lease) return { type: "busy" };
  let adopting = false;
  try {
    const prepared = await prepare();
    if (prepared === null) return { type: "rejected" };
    adopting = true;
    markMapModelUnstable();
    beforeAdopt?.();
    await adopt(prepared);
    markMapModelStable();
    return { type: "loaded" };
  } catch (error) {
    if (!adopting && typeof error === "object" && error !== null && "name" in error && error.name === "AbortError") {
      return { type: "cancelled" };
    }
    return { type: "failed", error };
  } finally {
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
