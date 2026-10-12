/**
 * 球面的「要素填充」：直接用平面图自己那批填充路径铺球面，而不是逐格拼 Voronoi 单元。
 *
 * 为什么要这么改：单元多边形只有 ~10px，海岸线只能画成阶梯状，极点还会因为单元收敛成放射状花瓣；
 * 平面图之所以细腻，是因为它画的是要素级路径 ——
 * - 陆地：\`#defs\` 里的 \`#feature_*\` 路径（Coastline.getFeaturePath 生成的平滑海岸线，
 *   平面图的陆地遮罩与海岸线图层都引用它）
 * - 水面：一整块海洋（球面网格），平面图的海洋也只是平色 + 图案
 * - 生物群系 / 国家 / 省 / 湖 / 河 / 冰：各图层已经画好的填充路径，颜色与透明度照抄
 *
 * 曲线用 flattenPathData 真的展开（只取端点会把平滑海岸画成折角），三角化后按需要在地图空间细分，
 * 免得大三角形的弦切进球面里。UV 是地图空间归一化的，供贴图叠加层使用。
 */
import { flattenPathData } from "@/utils/pathUtils";
import type { Point } from "@/types/global";
import { createGlobeProjector } from "./globe-vector";

export type GlobeFeatureFill = {
  /** 该层在球面上的半径（越大越靠外，用来定绘制层次） */
  radius: number;
  positions: number[];
  uvs: number[];
  colors: number[];
  /** 是否半透明（国家 40% 那类） */
  transparent: boolean;
  opacity: number;
};

/** 大三角形的弦会切进球面，超过这个长度（世界单位）就细分 */
const FILL_MAX_EDGE = 0.2;
const FILL_SUBDIVIDE_DEPTH = 3;

/** 面图层：从外到里的绘制顺序就是数组顺序（后面的半径更大、盖在前面上） */
const AREA_LAYERS = ["biomes", "states", "provinces", "lakes", "rivers", "ice"] as const;

type ThreeRuntime = {
  Vector2: new (x: number, y: number) => { x: number; y: number };
  ShapeUtils: { triangulateShape(contour: unknown[], holes: unknown[][]): number[][] };
};

function threeRuntime(): ThreeRuntime | null {
  return (window as unknown as { THREE?: ThreeRuntime }).THREE ?? null;
}

export function parseRgb(value: string): [number, number, number] | null {
  const rgb = value.match(/rgba?\(([^)]+)\)/);
  if (rgb) {
    const [r, g, b] = rgb[1].split(",").map(part => Number.parseFloat(part));
    if ([r, g, b].some(part => !Number.isFinite(part))) return null;
    return [r / 255, g / 255, b / 255];
  }
  if (value.startsWith("#")) {
    const digits = value.slice(1);
    const size = digits.length === 3 ? 1 : 2;
    const channels = [0, 1, 2].map(index => {
      const part = digits.slice(index * size, index * size + size);
      return Number.parseInt(size === 1 ? part + part : part, 16) / 255;
    });
    return channels.some(part => !Number.isFinite(part)) ? null : (channels as [number, number, number]);
  }
  return null;
}

/** 一次填充层的累积器 */
class FillBuilder {
  readonly positions: number[] = [];
  readonly uvs: number[] = [];
  readonly colors: number[] = [];

  constructor(
    private readonly project: (x: number, y: number) => [number, number, number],
    private readonly width: number,
    private readonly height: number,
    private readonly radius: number,
    private readonly maxEdge: number
  ) {}

  private pushTriangle(a: Point, b: Point, c: Point, color: [number, number, number]): void {
    for (const point of [a, b, c]) {
      const projected = this.project(point[0], point[1]);
      this.positions.push(projected[0] * this.radius, projected[1] * this.radius, projected[2] * this.radius);
      this.uvs.push(point[0] / this.width, point[1] / this.height);
      this.colors.push(color[0], color[1], color[2]);
    }
  }

  /** 细分到足够小再投：大三角形的弦会切进球面，中段被球体挡掉 */
  private emitTriangle(a: Point, b: Point, c: Point, depth: number, color: [number, number, number]): void {
    const longest = Math.max(
      Math.hypot(b[0] - a[0], b[1] - a[1]),
      Math.hypot(c[0] - b[0], c[1] - b[1]),
      Math.hypot(a[0] - c[0], a[1] - c[1])
    );
    if (longest > this.maxEdge && depth < FILL_SUBDIVIDE_DEPTH) {
      const ab: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const bc: Point = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2];
      const ca: Point = [(c[0] + a[0]) / 2, (c[1] + a[1]) / 2];
      this.emitTriangle(a, ab, ca, depth + 1, color);
      this.emitTriangle(ab, b, bc, depth + 1, color);
      this.emitTriangle(ca, bc, c, depth + 1, color);
      this.emitTriangle(ab, bc, ca, depth + 1, color);
      return;
    }
    this.pushTriangle(a, b, c, color);
  }

  /** 一条 path 的 d：第一条子路径当外轮廓，其余当孔洞 */
  addPath(d: string, color: [number, number, number]): void {
    const runtime = threeRuntime();
    if (!runtime) return;

    const contours = flattenPathData(d).filter(points => points.length >= 3);
    if (!contours.length) return;

    const outer = contours[0].map(([x, y]) => new runtime.Vector2(x, y));
    const holes = contours.slice(1).map(contour => contour.map(([x, y]) => new runtime.Vector2(x, y)));
    const vertices = [...outer, ...holes.flat()];
    const faces = runtime.ShapeUtils.triangulateShape(outer, holes);

    for (const face of faces) {
      const triangle = face.map(index => {
        const vertex = vertices[index];
        return [vertex.x, vertex.y] as Point;
      });
      this.emitTriangle(triangle[0], triangle[1], triangle[2], 0, color);
    }
  }

  get empty(): boolean {
    return this.positions.length === 0;
  }
}

/**
 * 球面网格：用作海洋底色与海洋图案叠加（UV 就是地图空间的归一化坐标）
 */
export function buildGlobeOceanGrid(
  segmentsX = 64,
  segmentsY = 32,
  maxLat = 90
): { positions: number[]; uvs: number[] } {
  const project = createGlobeProjector();
  const width = options.map.graph.width;
  const height = options.map.graph.height;
  const positions: number[] = [];
  const uvs: number[] = [];

  const push = (x: number, y: number) => {
    const point = project(x, y);
    positions.push(point[0], point[1], point[2]);
    uvs.push(x / width, y / height);
  };

  // 极区那几行在球面上会收敛成一点，贴图会被拉成同心环 —— 需要时把纬度带收窄
  const { latN = 90, latT = 180 } = options.map.geography.coordinates;
  const north = Math.min(latN, maxLat);
  const south = Math.max(latN - latT, -maxLat);
  const top = ((latN - north) / latT) * height;
  const bottom = ((latN - south) / latT) * height;

  for (let row = 0; row < segmentsY; row++) {
    for (let column = 0; column < segmentsX; column++) {
      const x0 = (column / segmentsX) * width;
      const x1 = ((column + 1) / segmentsX) * width;
      const y0 = top + (row / segmentsY) * (bottom - top);
      const y1 = top + ((row + 1) / segmentsY) * (bottom - top);
      push(x0, y0);
      push(x0, y1);
      push(x1, y1);
      push(x0, y0);
      push(x1, y1);
      push(x1, y0);
    }
  }

  return { positions, uvs };
}

/**
 * 按平面图的图层堆叠构建要素填充层（顺序 = 绘制顺序，索引越大半径越大）
 * 陆地基底用 #defs 里的 #feature_* 平滑路径，其余面图层用它们已经画好的填充路径。
 */
export function buildGlobeFeatureFills(): GlobeFeatureFill[] {
  const project = createGlobeProjector();
  const width = options.map.graph.width;
  const height = options.map.graph.height;
  const maxEdge = FILL_MAX_EDGE / ((Math.PI * 2) / width); // 世界单位 → 地图像素

  const landColor = parseRgb(String(styles?.landmass?.attrs?.fill ?? "#eef6fb")) ?? [0.93, 0.96, 0.98];
  const land = new FillBuilder(project, width, height, 1.0002, maxEdge);
  const featurePaths = document.querySelectorAll<SVGPathElement>('path[id^="feature_"]') // 平面图把要素路径放进 #featurePaths，不限定容器才稳妥;
  for (const path of featurePaths) {
    const index = Number.parseInt((path.id.match(/feature_(\d+)/) ?? [])[1] ?? "-1", 10);
    const feature = index >= 0 ? pack.features?.[index] : undefined;
    if (feature?.type === "lake") continue; // 湖泊单独一层
    const d = path.getAttribute("d");
    if (d) land.addPath(d, landColor);
  }

  const fills: GlobeFeatureFill[] = [];
  if (!land.empty) {
    fills.push({ radius: 1.0002, positions: land.positions, uvs: land.uvs, colors: land.colors, transparent: false, opacity: 1 });
  }

  let radius = 1.0004;
  for (const layer of AREA_LAYERS) {
    const group = document.querySelector<SVGGElement>(`#map g[data-layer="${layer}"]`);
    if (!group || getComputedStyle(group).display === "none") continue;

    const layerOpacity = Number.parseFloat(getComputedStyle(group).opacity);
    const opacity = Number.isFinite(layerOpacity) ? layerOpacity : 1;
    if (opacity <= 0.02) continue;

    const builder = new FillBuilder(project, width, height, radius, maxEdge);
    let added = 0;

    for (const path of group.querySelectorAll<SVGPathElement>("path")) {
      const d = path.getAttribute("d");
      if (!d) continue;
      const style = getComputedStyle(path);
      const fillOpacity = Number.parseFloat(style.fillOpacity || "1");
      if (fillOpacity <= 0.02) continue;
      const fill = parseRgb(style.fill);
      if (!fill) continue;

      // 同一层的颜色通常只有几种，按颜色分桶太重，这里直接按当前路径改色
      const tint: [number, number, number] = [fill[0] * opacity, fill[1] * opacity, fill[2] * opacity];
      builder.addPath(d, tint);
      added++;
    }

    TIME && console.info("[globe] 图层 " + layer + "：路径 " + group.querySelectorAll("path").length + "，采用 " + added + "，三角形 " + builder.positions.length / 9);

    if (added && !builder.empty) {
      fills.push({
        radius,
        positions: builder.positions,
        uvs: builder.uvs,
        colors: builder.colors,
        transparent: opacity < 0.995,
        opacity
      });
      radius += 0.0002;
    }
  }

  return fills;
}

/** 仅供日志：每层贡献了多少三角形 */
export function describeGlobeFeatureFills(fills: GlobeFeatureFill[]): string {
  return fills.map(fill => fill.positions.length / 9 + "三角@" + fill.radius.toFixed(4)).join("，");
}
