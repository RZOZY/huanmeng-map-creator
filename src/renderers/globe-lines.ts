/**
 * 地球仪上的线画：海岸线、国界、省界、河流、湖泊轮廓……
 *
 * 做法是直接读平面图 SVG 里已经画好的那些 `path`：同一批线、同一套样式，
 * 所以球面与平面图看起来一致；线画本身是矢量的，放大也不会糊。
 * 取不到 SVG（例如单测环境）时返回 null，渲染器就当作没有线画。
 */
import { parsePathPoints } from "@/utils/pathUtils";
import { createGlobeProjector } from "./globe-vector";

export type GlobeLineData = {
  positions: number[]; // 线段端点对
  colors: number[]; // 与 positions 一一对应
  paths: number; // 取到的子路径数
  segments: number;
};

/** 不画到球上的图层：网格与单元这类辅助线，以及贴图、高度图 */
const EXCLUDED_LAYERS = new Set([
  "grid",
  "cells",
  "coordinates",
  "compass",
  "heightmap",
  "texture",
  "temperature",
  "precipitation"
]);

const LINE_RADIUS = 1.0015; // 略高于球面，避免与面片 z-fighting

let colorContext: CanvasRenderingContext2D | null = null;

/** CSS 颜色 → 0..1 通道值。与其它顶点色一致：原始 sRGB，不做色域转换 */
function colorChannels(css: string): [number, number, number] | null {
  if (!css || css === "none" || css === "transparent") return null;
  if (!colorContext) colorContext = document.createElement("canvas").getContext("2d");
  if (!colorContext) return null;

  colorContext.fillStyle = "#010203"; // 哨兵：解析失败时保持不变，据此判断非法色值
  colorContext.fillStyle = css;
  const normalized = colorContext.fillStyle;
  if (normalized === "#010203") return null;

  if (normalized.startsWith("#")) {
    const digits = normalized.slice(1);
    return [
      Number.parseInt(digits.slice(0, 2), 16) / 255,
      Number.parseInt(digits.slice(2, 4), 16) / 255,
      Number.parseInt(digits.slice(4, 6), 16) / 255
    ];
  }

  const channels = normalized.match(/rgba?\(([^)]+)\)/);
  if (!channels) return null;
  const [r, g, b, a] = channels[1].split(",").map(value => Number.parseFloat(value));
  if (a !== undefined && a <= 0.02) return null;
  return [r / 255, g / 255, b / 255];
}

export function buildGlobeLineData(): GlobeLineData | null {
  const root = document.querySelector("#map");
  if (!root) return null;

  const project = createGlobeProjector();
  const positions: number[] = [];
  const colors: number[] = [];
  let paths = 0;
  let segments = 0;

  const groups = root.querySelectorAll<SVGGElement>("g[data-layer]");
  for (const group of groups) {
    if (EXCLUDED_LAYERS.has(group.dataset.layer ?? "")) continue;
    if (getComputedStyle(group).display === "none") continue; // 该图层当前是关掉的

    for (const path of group.querySelectorAll<SVGPathElement>("path")) {
      const d = path.getAttribute("d");
      if (!d) continue;

      const style = getComputedStyle(path);
      if (style.display === "none" || style.visibility === "hidden") continue;
      if (Number.parseFloat(style.strokeWidth) <= 0) continue;
      if (Number.parseFloat(style.strokeOpacity || "1") <= 0.02) continue;
      const stroke = colorChannels(style.stroke);
      if (!stroke) continue;

      // 每条子路径单独成链：否则 M 起点之间会连出一条假线
      for (const subpath of d.split(/(?=[Mm])/)) {
        const points = parsePathPoints(subpath);
        if (points.length < 2) continue;
        paths++;

        for (let i = 1; i < points.length; i++) {
          const [ax, ay] = points[i - 1];
          const [bx, by] = points[i];
          if (![ax, ay, bx, by].every(Number.isFinite)) continue;

          const a = project(ax, ay);
          const b = project(bx, by);
          positions.push(
            a[0] * LINE_RADIUS,
            a[1] * LINE_RADIUS,
            a[2] * LINE_RADIUS,
            b[0] * LINE_RADIUS,
            b[1] * LINE_RADIUS,
            b[2] * LINE_RADIUS
          );
          colors.push(stroke[0], stroke[1], stroke[2], stroke[0], stroke[1], stroke[2]);
          segments++;
        }
      }
    }
  }

  return segments ? { positions, colors, paths, segments } : null;
}
