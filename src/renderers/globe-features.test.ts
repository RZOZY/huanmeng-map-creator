// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { parseRgb } from "./globe-features";

describe("parseRgb", () => {
  it("解析 rgb() 与 rgba()（曾经把正则写坏，导致面图层全部被静默丢掉）", () => {
    expect(parseRgb("rgb(255, 0, 0)")).toEqual([1, 0, 0]);
    expect(parseRgb("rgba(0, 128, 255, 0.4)")).toEqual([0, 128 / 255, 1]);
  });

  it("解析三位与六位十六进制", () => {
    expect(parseRgb("#fff")).toEqual([1, 1, 1]);
    const [r, g, b] = parseRgb("#466eab")!;
    expect([r, g, b]).toEqual([0x46 / 255, 0x6e / 255, 0xab / 255]);
  });

  it("解析不了的返回 null", () => {
    expect(parseRgb("none")).toBeNull();
    expect(parseRgb("transparent")).toBeNull();
  });
});
