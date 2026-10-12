/**
 * 地球仪上的线画：海岸线、国界、省界、河流、道路……
 *
 * 做法是直接读平面图 SVG 里已经画好的那些 `path`：同一批线、同一套样式。
 * 不能直接用 THREE.LineSegments —— WebGL 的线宽恒为 1px，平面图里河流的粗细变化、
 * 国界的虚线都表现不出来。这里把每条线按 stroke-width 展开成**世界空间的带状三角形**，
 * 并沿折线按 stroke-dasharray 切出实线段，所以球面上的线宽与虚线节奏和平面图一致。
 */
import { Relief } from "@/generators/relief-generator";
import { parsePathPoints } from "@/utils/pathUtils";
import type { Point } from "@/types/global";
import { DEFAULT_GLOBE_LAYER_STYLE, type GlobeLayerStyle, createGlobeProjector } from "./globe-vector";

export type GlobeLineData = {
  positions: number[]; // 带状三角形的顶点
  colors: number[]; // 与 positions 一一对应
  paths: number; // 取到的子路径数
  segments: number; // 生成的带条数
  relief: number; // 投上球的地形符号数（图标集是异步加载的，0 表示可能还没加载好）
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
const MIN_STROKE_WIDTH = 0.7; // 地图像素。省界只有 0.12px，兜住下限才不至于在球面上完全消失
const MAX_STROKE_WIDTH = 14;
const MIN_SEGMENT = 0.05; // 更短的段直接丢掉，省得生成退化三角形

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

/** stroke-dasharray → 地图像素长度的循环数组；返回空数组表示实线 */
function parseDashArray(value: string): number[] {
  if (!value || value === "none") return [];
  const parts = value
    .split(/[\s,]+/)
    .map(part => Number.parseFloat(part))
    .filter(part => Number.isFinite(part) && part >= 0);
  if (!parts.length || parts.every(part => part <= 0)) return [];

  // SVG 规则：奇数个值时重复一遍
  return parts.length % 2 === 1 ? [...parts, ...parts] : parts;
}

/** viewBox="x y w h" → 数字；缺失时按图标集的 100x100 处理 */
function parseViewBox(value: string | null): { x: number; y: number; width: number; height: number } {
  const parts = (value ?? "")
    .trim()
    .split(/[\s,]+/)
    .map(Number.parseFloat);
  if (parts.length === 4 && parts.every(part => Number.isFinite(part)) && parts[2] > 0 && parts[3] > 0) {
    return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
  }
  return { x: 0, y: 0, width: 100, height: 100 };
}

const cross = (a: number[], b: number[]) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];

const normalize = (v: number[]) => {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
};

/**
 * 球面该按平面图当前的哪些图层、什么透明度上色。
 * 图层开关与样式都取自实时 SVG / styles，所以菜单里怎么调，球面就怎么变。
 */
export function readGlobeLayerStyle(): GlobeLayerStyle {
  const group = (layer: string) => document.querySelector<SVGGElement>(`#map g[data-layer="${layer}"]`);
  const visible = (layer: string) => {
    const element = group(layer);
    return element !== null && getComputedStyle(element).display !== "none";
  };

  // 国色的半透明度写在 statesBody 分组上（path 自身是 1），必须从这里读
  const stateGroup = document.querySelector<SVGGElement>("#map g#statesBody");
  const styleOpacity = (styles?.states?.groups as Record<string, { attrs?: { opacity?: unknown } }> | undefined)
    ?.statesBody?.attrs?.opacity;
  const domOpacity = stateGroup ? Number.parseFloat(getComputedStyle(stateGroup).opacity) : Number.NaN;
  const stateOpacity = typeof styleOpacity === "number" ? styleOpacity : domOpacity;

  const oceanFill = styles?.ocean?.groups?.base?.attrs?.fill;
  const landFill = styles?.landmass?.attrs?.fill;

  return {
    statesVisible: visible("states"),
    stateOpacity: Number.isFinite(stateOpacity) ? stateOpacity : DEFAULT_GLOBE_LAYER_STYLE.stateOpacity,
    biomesVisible: visible("biomes"),
    reliefVisible: visible("relief"),
    landColor: typeof landFill === "string" ? landFill : DEFAULT_GLOBE_LAYER_STYLE.landColor,
    oceanColor: typeof oceanFill === "string" ? oceanFill : DEFAULT_GLOBE_LAYER_STYLE.oceanColor
  };
}

/** 这些图层的填充要单独画：河流与湖泊本身就是填充多边形（宽度即几何），没有描边可循。
 *  国家/生物群系等面图层已由逐单元取色负责，再叠一层只会互相盖住。 */
const FILL_LAYERS = new Set(["rivers", "lakes", "ice"]);

/** 三的运行时是旧版全局构建，挂在 window.THREE 上（view-3d-renderer 取的是同一个） */
type ThreeRuntime = {
  Vector2: new (x: number, y: number) => { x: number; y: number };
  ShapeUtils: { triangulateShape(contour: unknown[], holes: unknown[][]): number[][] };
};

function threeRuntime(): ThreeRuntime | null {
  return (window as unknown as { THREE?: ThreeRuntime }).THREE ?? null;
}
const FILL_RADIUS = 1.0008; // 在球面之上、线画之下
const FILL_MAX_EDGE = 0.12; // 世界单位。三角形弦长了会切进球面，中段被球挡掉
const FILL_SUBDIVIDE_DEPTH = 4;

/** 把填充多边形（含孔洞）三角化后投到球面 */
export function buildGlobeFillData(): { positions: number[]; colors: number[]; paths: number } | null {
  const root = document.querySelector("#map");
  if (!root) return null;

  const runtime = threeRuntime();
  if (!runtime) return null;

  const project = createGlobeProjector();
  const worldPerMapPixel = (Math.PI * 2) / options.map.graph.width;
  const maxEdge = FILL_MAX_EDGE / worldPerMapPixel;
  const positions: number[] = [];
  const colors: number[] = [];
  let paths = 0;

  for (const group of root.querySelectorAll<SVGGElement>("g[data-layer]")) {
    if (!FILL_LAYERS.has(group.dataset.layer ?? "")) continue;
    const groupStyle = getComputedStyle(group);
    if (groupStyle.display === "none") continue;
    const groupOpacity = Number.parseFloat(groupStyle.opacity);
    const opacity = Number.isFinite(groupOpacity) ? groupOpacity : 1;

    for (const path of group.querySelectorAll<SVGPathElement>("path")) {
      const d = path.getAttribute("d");
      if (!d) continue;

      const style = getComputedStyle(path);
      if (Number.parseFloat(style.fillOpacity || "1") <= 0.02) continue;
      const channels = colorChannels(style.fill);
      if (!channels) continue;
      const color: [number, number, number] = [channels[0] * opacity, channels[1] * opacity, channels[2] * opacity];

      // 第一条子路径是外轮廓，其余当孔洞（湖泊里的岛）
      const contours = d
        .split(/(?=[Mm])/)
        .map(subpath => parsePathPoints(subpath))
        .filter(points => points.length >= 3);
      if (!contours.length) continue;

      const outer = contours[0].map(([x, y]) => new runtime.Vector2(x, y));
      const holes = contours.slice(1).map(contour => contour.map(([x, y]) => new runtime.Vector2(x, y)));
      const faces = runtime.ShapeUtils.triangulateShape(outer, holes);
      const vertices = [...outer, ...holes.flat()];

      const emitTriangle = (a: Point, b: Point, c: Point, depth: number) => {
        const longest = Math.max(
          Math.hypot(b[0] - a[0], b[1] - a[1]),
          Math.hypot(c[0] - b[0], c[1] - b[1]),
          Math.hypot(a[0] - c[0], a[1] - c[1])
        );
        // 大三角形的弦会切进球面里（中段被球挡掉），所以先在地图空间细分到足够小再投影
        if (longest > maxEdge && depth < FILL_SUBDIVIDE_DEPTH) {
          const ab: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
          const bc: Point = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2];
          const ca: Point = [(c[0] + a[0]) / 2, (c[1] + a[1]) / 2];
          emitTriangle(a, ab, ca, depth + 1);
          emitTriangle(ab, b, bc, depth + 1);
          emitTriangle(ca, bc, c, depth + 1);
          emitTriangle(ab, bc, ca, depth + 1);
          return;
        }

        for (const point of [a, b, c]) {
          const projected = project(point[0], point[1]);
          positions.push(projected[0] * FILL_RADIUS, projected[1] * FILL_RADIUS, projected[2] * FILL_RADIUS);
          colors.push(color[0], color[1], color[2]);
        }
      };

      for (const face of faces) {
        const triangle = face.map(index => {
          const vertex = vertices[index];
          return [vertex.x, vertex.y] as Point;
        });
        emitTriangle(triangle[0], triangle[1], triangle[2], 0);
      }
      paths++;
    }
  }

  return positions.length ? { positions, colors, paths } : null;
}

export function buildGlobeLineData(): GlobeLineData | null {
  const root = document.querySelector("#map");
  if (!root) return null;

  const project = createGlobeProjector();
  const worldPerMapPixel = (Math.PI * 2) / options.map.graph.width; // 地图宽度铺满整圈
  const positions: number[] = [];
  const colors: number[] = [];
  let paths = 0;
  let segments = 0;

  const pushVertex = (point: number[], color: [number, number, number]) => {
    positions.push(point[0], point[1], point[2]);
    colors.push(color[0], color[1], color[2]);
  };

  /** 一段实线 → 一个四边形（两个三角形），宽度沿球面切向展开 */
  const emitSpan = (from: Point, to: Point, halfWidth: number, color: [number, number, number]) => {
    const [ax, ay] = from;
    const [bx, by] = to;
    const pa = project(ax, ay);
    const pb = project(bx, by);
    const a = [pa[0] * LINE_RADIUS, pa[1] * LINE_RADIUS, pa[2] * LINE_RADIUS];
    const b = [pb[0] * LINE_RADIUS, pb[1] * LINE_RADIUS, pb[2] * LINE_RADIUS];

    const direction = normalize([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
    const normal = normalize([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
    const side = normalize(cross(direction, normal));
    const width = halfWidth * worldPerMapPixel;

    const a1 = [a[0] + side[0] * width, a[1] + side[1] * width, a[2] + side[2] * width];
    const a2 = [a[0] - side[0] * width, a[1] - side[1] * width, a[2] - side[2] * width];
    const b1 = [b[0] + side[0] * width, b[1] + side[1] * width, b[2] + side[2] * width];
    const b2 = [b[0] - side[0] * width, b[1] - side[1] * width, b[2] - side[2] * width];

    pushVertex(a1, color);
    pushVertex(b1, color);
    pushVertex(b2, color);
    pushVertex(a1, color);
    pushVertex(b2, color);
    pushVertex(a2, color);
    segments++;
  };

  /** 沿折线走，按虚线节奏只把「实」的那几段交给 emitSpan；pattern 为空即整条实线 */
  const emitPath = (points: Point[], halfWidth: number, pattern: number[], color: [number, number, number]) => {
    if (!pattern.length) {
      for (let i = 1; i < points.length; i++) {
        const [x0, y0] = points[i - 1];
        const [x1, y1] = points[i];
        if (Math.hypot(x1 - x0, y1 - y0) < MIN_SEGMENT) continue;
        emitSpan(points[i - 1], points[i], halfWidth, color);
      }
      return;
    }

    let patternIndex = 0;
    let remaining = pattern[0];
    let on = true;

    for (let i = 1; i < points.length; i++) {
      let x0 = points[i - 1][0];
      let y0 = points[i - 1][1];
      const x1 = points[i][0];
      const y1 = points[i][1];
      let length = Math.hypot(x1 - x0, y1 - y0);

      while (length > MIN_SEGMENT) {
        const step = Math.min(length, remaining);
        const ratio = step / length;
        const nx = x0 + (x1 - x0) * ratio;
        const ny = y0 + (y1 - y0) * ratio;
        if (on && step >= MIN_SEGMENT) emitSpan([x0, y0], [nx, ny], halfWidth, color);

        x0 = nx;
        y0 = ny;
        length -= step;
        remaining -= step;
        if (remaining <= MIN_SEGMENT) {
          patternIndex = (patternIndex + 1) % pattern.length;
          remaining = Math.max(pattern[patternIndex], MIN_SEGMENT);
          on = !on;
        }
      }
    }
  };

  for (const group of root.querySelectorAll<SVGGElement>("g[data-layer]")) {
    if (EXCLUDED_LAYERS.has(group.dataset.layer ?? "")) continue;
    const groupStyle = getComputedStyle(group);
    if (groupStyle.display === "none") continue; // 该图层当前是关掉的

    // 图层自身的 opacity（比如国界 0.8）要乘进线色，否则球面上的线比平面图重
    const groupOpacity = Number.parseFloat(groupStyle.opacity);
    const opacity = Number.isFinite(groupOpacity) ? groupOpacity : 1;
    if (opacity <= 0.02) continue;

    for (const path of group.querySelectorAll<SVGPathElement>("path")) {
      // 国名的白色外发光（blur 过的粗描边）在平面图里压在填充之下，当线画会变成一圈毛刺
      if (path.closest("#statesHalo")) continue;

      const d = path.getAttribute("d");
      if (!d) continue;

      const style = getComputedStyle(path);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const strokeWidth = Number.parseFloat(style.strokeWidth);
      if (!Number.isFinite(strokeWidth) || strokeWidth <= 0) continue;
      if (Number.parseFloat(style.strokeOpacity || "1") <= 0.02) continue;

      const channels = colorChannels(style.stroke);
      if (!channels) continue;
      const color: [number, number, number] = [channels[0] * opacity, channels[1] * opacity, channels[2] * opacity];

      const halfWidth = Math.max(MIN_STROKE_WIDTH, Math.min(MAX_STROKE_WIDTH, strokeWidth)) / 2;
      const pattern = parseDashArray(style.strokeDasharray);

      // 每条子路径单独成链：否则 M 起点之间会连出一条假线
      for (const subpath of d.split(/(?=[Mm])/)) {
        const points = parsePathPoints(subpath);
        if (points.length < 2) continue;
        paths++;
        emitPath(points, halfWidth, pattern, color);
      }
    }
  }

  // 地形符号（山、林…）：图层默认关闭；开启后把 pack.relief 里每个图标的路径投到球上。
  // 图标是描边线画，符号定义在图标集加载完成后才存在于 DOM，所以取不到时会 count 0 让上层稍后重试。
  let reliefIcons = 0;
  const reliefGroup = root.querySelector<SVGGElement>('g[data-layer="relief"]');
  if (reliefGroup && getComputedStyle(reliefGroup).display !== "none") {
    const sample = reliefGroup.querySelector<SVGUseElement>("use");
    const sampleStyle = sample ? getComputedStyle(sample) : null;
    const fallbackStroke = typeof styles?.relief?.attrs?.stroke === "string" ? styles.relief.attrs.stroke : "#5c5c70";
    const channels = colorChannels(
      sampleStyle && sampleStyle.stroke !== "none" ? sampleStyle.stroke : fallbackStroke
    );
    // 图标大多是填充路径（stroke="none"）：fill/stroke 都要照平面图的实际值来，不能一律当描边画
    const inheritedFill = sampleStyle?.fill ?? "none";
    const inheritedStroke = sampleStyle && sampleStyle.stroke !== "none" ? sampleStyle.stroke : fallbackStroke;
    const inheritedStrokeWidth = Number.parseFloat(sampleStyle?.strokeWidth ?? "1");
    const runtimeThree = threeRuntime();
    const groupOpacity = Number.parseFloat(getComputedStyle(reliefGroup).opacity);
    const opacity = Number.isFinite(groupOpacity) ? groupOpacity : 1;
    const color: [number, number, number] | null = channels
      ? [channels[0] * opacity, channels[1] * opacity, channels[2] * opacity]
      : null;
    const iconScale = typeof styles?.relief?.options?.size === "number" ? styles.relief.options.size : 1;
    const set = styles?.relief?.options?.set;

    if (color) {
      for (const icon of pack.relief ?? []) {
        const symbolId = Relief.symbolId(icon, set);
        const symbol = document.getElementById(symbolId);
        if (!symbol) continue;

        const frame = parseViewBox(symbol.getAttribute("viewBox"));
        const drawn = icon.s * iconScale;
        const shift = (drawn - icon.s) / 2; // 与平面图一致：以图标中心缩放
        const left = icon.x - shift;
        const top = icon.y - shift;
        let drawnPaths = 0;

        for (const path of symbol.querySelectorAll<SVGPathElement>("path")) {
          const d = path.getAttribute("d");
          if (!d) continue;

          const contours = d
            .split(/(?=[Mm])/)
            .map(subpath => parsePathPoints(subpath))
            .filter(points => points.length >= 2);
          if (!contours.length) continue;

          const toMap = (points: Point[]): Point[] =>
            points.map(([px, py]) => [
              left + ((px - frame.x) / frame.width) * drawn,
              top + ((py - frame.y) / frame.height) * drawn
            ]);

          // 描边：路径自带的 stroke-width 是图标单位，要按缩放换算；没有则用 <use> 的继承值（地图像素）
          const strokeAttr = path.getAttribute("stroke") ?? inheritedStroke;
          if (strokeAttr && strokeAttr !== "none") {
            const strokeColor = colorChannels(strokeAttr);
            const ownWidth = Number.parseFloat(path.getAttribute("stroke-width") ?? "");
            const widthPx = Number.isFinite(ownWidth) && ownWidth > 0 ? ownWidth * (drawn / frame.width) : inheritedStrokeWidth;
            if (strokeColor) {
              const tint: [number, number, number] = [strokeColor[0] * opacity, strokeColor[1] * opacity, strokeColor[2] * opacity];
              for (const contour of contours) {
                if (contour.length < 2) continue;
                emitPath(toMap(contour), Math.max(0.3, widthPx) / 2, [], tint);
              }
            }
          }

          // 填充：图标多为填充路径，用 earcut 三角化（图标很小，不必细分）
          const fillAttr = path.getAttribute("fill") ?? inheritedFill;
          if (fillAttr && fillAttr !== "none" && runtimeThree) {
            const fillColor = colorChannels(fillAttr);
            if (fillColor) {
              const outer = toMap(contours[0]).map(([x, y]) => new runtimeThree.Vector2(x, y));
              const holes = contours.slice(1).map(contour => toMap(contour).map(([x, y]) => new runtimeThree.Vector2(x, y)));
              const vertices = [...outer, ...holes.flat()];
              const faces = runtimeThree.ShapeUtils.triangulateShape(outer, holes);
              const tint: [number, number, number] = [fillColor[0] * opacity, fillColor[1] * opacity, fillColor[2] * opacity];
              for (const face of faces) {
                for (const index of face) {
                  const vertex = vertices[index];
                  const projected = project(vertex.x, vertex.y);
                  positions.push(projected[0] * LINE_RADIUS, projected[1] * LINE_RADIUS, projected[2] * LINE_RADIUS);
                  colors.push(tint[0], tint[1], tint[2]);
                }
              }
            }
          }
          drawnPaths++;
        }
        if (drawnPaths > 0) reliefIcons++;
      }
    }
  }

  return segments ? { positions, colors, paths, segments, relief: reliefIcons } : null;
}
