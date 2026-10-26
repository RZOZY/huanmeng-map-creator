import { afterEach, describe, expect, it, vi } from "vitest";
import { beginMapIO, isMapIOBusy, type MapIOKind, type MapIOLease } from "./map-io";

const leases: MapIOLease[] = [];
const kinds: MapIOKind[] = ["save", "load", "generate"];

function acquire(kind: MapIOKind): MapIOLease | null {
  const lease = beginMapIO(kind);
  if (lease) leases.push(lease);
  return lease;
}

afterEach(() => {
  for (const lease of leases) lease.release();
  leases.length = 0;
  vi.unstubAllGlobals();
  expect(isMapIOBusy()).toBe(false);
});

describe("map IO leases", () => {
  it.each(kinds)("acquires a %s lease synchronously", kind => {
    expect(isMapIOBusy()).toBe(false);
    const lease = acquire(kind);
    expect(lease).toEqual({ kind, isCurrent: expect.any(Function), release: expect.any(Function) });
    expect(lease?.isCurrent()).toBe(true);
    expect(isMapIOBusy()).toBe(true);
  });

  it.each(kinds)("does not queue or preempt a %s owner", kind => {
    const lease = acquire(kind);
    expect(lease).not.toBeNull();
    for (const next of kinds) expect(acquire(next)).toBeNull();
    expect(isMapIOBusy()).toBe(true);
    lease?.release();
    expect(isMapIOBusy()).toBe(false);
  });

  it("acquires a new lease after an idempotent release", () => {
    const first = acquire("save");
    expect(first).not.toBeNull();
    first?.release();
    first?.release();
    expect(isMapIOBusy()).toBe(false);
    expect(acquire("load")?.kind).toBe("load");
    expect(isMapIOBusy()).toBe(true);
  });

  it("does not let an old lease release a newer owner", () => {
    const first = acquire("save");
    expect(first).not.toBeNull();
    first?.release();
    const second = acquire("load");
    expect(second).not.toBeNull();
    first?.release();
    expect(isMapIOBusy()).toBe(true);
    expect(acquire("generate")).toBeNull();
    second?.release();
    expect(acquire("generate")?.kind).toBe("generate");
  });

  it("does not require browser globals", () => {
    vi.stubGlobal("window", undefined);
    vi.stubGlobal("document", undefined);
    expect(acquire("generate")?.kind).toBe("generate");
    expect(isMapIOBusy()).toBe(true);
  });
});
