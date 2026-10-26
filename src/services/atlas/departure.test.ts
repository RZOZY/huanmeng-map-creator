import { describe, expect, it } from "vitest";
import type { MapSaveOutcome } from "@/services/io/save";
import { type DepartureIntent, decideMapDeparture } from "./departure";

const healthy = Object.freeze({ busy: false, stable: true, editing: false });

describe("departure policy, not a navigation permit", () => {
  it("cancellation always retains the current document", () => {
    expect(decideMapDeparture({ type: "cancel" }, healthy)).toEqual({ type: "stay", reason: "cancelled" });
  });

  it("represents explicit discard only as a request, never a load instruction", () => {
    expect(decideMapDeparture({ type: "discard" }, healthy)).toEqual({ type: "discard-requested" });
  });

  it.each([
    [{ ...healthy, busy: true }, "busy"],
    [{ ...healthy, stable: false }, "unstable-model"],
    [{ ...healthy, editing: true }, "edit-mode"]
  ] as const)("blocks discard for the current state %j", (state, reason) => {
    expect(decideMapDeparture({ type: "discard" }, state)).toEqual({ type: "stay", reason });
  });

  it.each([
    [{ type: "saved", filename: "old snapshot.map" }, "saved-snapshot-only"],
    [{ type: "stored", target: "browser" }, "saved-snapshot-only"],
    [{ type: "stored", target: "dropbox" }, "saved-snapshot-only"],
    [{ type: "downloaded-fallback" }, "download-unconfirmed"],
    [{ type: "cancelled" }, "save-cancelled"],
    [{ type: "failed", error: new Error("disk full") }, "save-failed"],
    [{ type: "busy" }, "busy"],
    [{ type: "rejected", reason: "edit-mode" }, "edit-mode"],
    [{ type: "rejected", reason: "unstable-model" }, "unstable-model"],
    [{ type: "invalidated" }, "save-invalidated"]
  ] satisfies readonly (readonly [MapSaveOutcome, string])[])("never auto-discards after %j", (result, reason) => {
    expect(decideMapDeparture({ type: "save", result }, healthy)).toEqual({ type: "stay", reason });
  });

  it("does not infer freshness from a past successful file save when the document is edited later", () => {
    const result = Object.freeze({ type: "saved" as const, filename: "A.map" });
    expect(decideMapDeparture({ type: "save", result }, healthy).type).toBe("stay");
    expect(decideMapDeparture({ type: "save", result }, { ...healthy, editing: true })).toEqual({
      type: "stay",
      reason: "edit-mode"
    });
    expect(decideMapDeparture({ type: "save", result }, healthy).type).toBe("stay");
  });

  it("does not let a stale save result bypass a replacement or failed model", () => {
    const intent: DepartureIntent = { type: "save", result: { type: "saved", filename: "A.map" } };
    expect(decideMapDeparture(intent, { ...healthy, busy: true })).toEqual({ type: "stay", reason: "busy" });
    expect(decideMapDeparture(intent, { ...healthy, stable: false })).toEqual({
      type: "stay",
      reason: "unstable-model"
    });
  });

  it("does not mutate inputs or add a fake dirty/verified state", () => {
    const result = Object.freeze({ type: "stored" as const, target: "browser" as const });
    const intent = Object.freeze({ type: "save" as const, result });
    const before = JSON.stringify({ intent, healthy });
    decideMapDeparture(intent, healthy);
    expect(JSON.stringify({ intent, healthy })).toBe(before);
    expect(result).not.toHaveProperty("currentUnchanged");
    expect(healthy).not.toHaveProperty("dirty");
  });
});
