// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { landOverlaySpec, PATTERN_TILE, waterOverlaySpec } from "./globe-texture";

const installEnvironment = (attributes: Record<string, unknown>, href: string) => {
  document.body.innerHTML = `<div id="map"><g data-layer="texture"></g></div>`;
  (globalThis as any).styles = {
    texture: { options: { href, ...attributes } },
    ocean: { groups: { pattern: { attrs: {} } } }
  };
  return document.querySelector('#map g[data-layer="texture"]') as SVGGElement;
};

describe("waterOverlaySpec", () => {
  it("图案每 100 地图像素循环一次", () => {
    (globalThis as any).styles = {
      ocean: { groups: { pattern: { attrs: { href: "./images/pattern1.png", opacity: 0.2 } } } }
    };

    const spec = waterOverlaySpec(1920, 1080);
    expect(spec).not.toBeNull();
    expect(spec!.repeatX).toBeCloseTo(1920 / PATTERN_TILE, 6);
    expect(spec!.repeatY).toBeCloseTo(1080 / PATTERN_TILE, 6);
    expect(spec!.opacity).toBeCloseTo(0.2, 6);
    expect(spec!.offsetX).toBe(0);
  });

  it("没有图案时不返回", () => {
    (globalThis as any).styles = { ocean: { groups: { pattern: { attrs: {} } } } };
    expect(waterOverlaySpec(1920, 1080)).toBeNull();
  });
});

describe("landOverlaySpec", () => {
  it("图层开着且有图片尺寸时，按 slice 铺法换算 repeat/offset", () => {
    installEnvironment({ x: 0, y: 0 }, "./images/textures/marble-big.jpg");

    // 图片 1000x500 铺到 1920x1080：按高铺满（scale = 1080/500 = 2.16），宽超出后居中裁掉
    const spec = landOverlaySpec(1920, 1080, 1000, 500);
    expect(spec).not.toBeNull();

    const drawWidth = 1000 * 2.16;
    const drawHeight = 500 * 2.16;
    expect(spec!.repeatX).toBeCloseTo(1920 / drawWidth, 6);
    expect(spec!.repeatY).toBeCloseTo(1080 / drawHeight, 6);
    expect(spec!.offsetX).toBeCloseTo(-(0 + (1920 - drawWidth) / 2) / drawWidth, 6);
    expect(spec!.offsetY).toBeCloseTo(0, 6);
  });

  it("图层关掉时不返回", () => {
    const layer = installEnvironment({}, "./images/textures/marble-big.jpg");
    layer.style.display = "none";

    expect(landOverlaySpec(1920, 1080, 1000, 500)).toBeNull();
  });

  it("还没有图片尺寸时不返回", () => {
    installEnvironment({}, "./images/textures/marble-big.jpg");
    expect(landOverlaySpec(1920, 1080, 0, 0)).toBeNull();
  });
});
