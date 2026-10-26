// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { isMapModelStable, markMapModelStable, markMapModelUnstable } from "./model-status";

afterEach(markMapModelStable);

describe("replacement save quarantine", () => {
  it("starts compatible with an already adopted model without requiring browser globals", () => {
    expect(isMapModelStable()).toBe(true);
  });

  it("remains unstable until an explicit successful adoption", () => {
    markMapModelUnstable();
    expect(isMapModelStable()).toBe(false);
    markMapModelUnstable();
    expect(isMapModelStable()).toBe(false);
    markMapModelStable();
    expect(isMapModelStable()).toBe(true);
  });
});
