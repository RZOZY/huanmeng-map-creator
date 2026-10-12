/**
 * 矢量球面：不贴图，直接把地图自己的 Voronoi 单元按顶点经纬度投到球面上。
 *
 * 为什么这样做（见 docs/矢量球面-交接.md）：平面图贴到球上时，地图顶边整行必然收敛成一个点
 * （极区被挤成放射状花瓣），左右两端又必然在 ±180° 留一道硬接缝 —— 这是贴图方式的数学性质，
 * 无解。换成矢量单元后，极点是普通顶点、跨接缝的多边形直接连过去，两个问题一起消失。
 *
 * 坐标换算：整世界地图把经度横向拉伸铺满整圈（与引擎贴图一致），区域地图用引擎自己的真实
 * 跨度；纬度一律 latN - (y/H) * latT —— latT 是「跨度」不是边界。
 *
 * 拓扑上必须做两件事，少一件都会在极点或接缝留洞：
 *   1) 边界环外推：引擎 grid.boundary 只在地图外 1*spacing，斜切处会让约 0.023% 的地图矩形面积
 *      不属于任何真实单元（离线脚本 analyze-globe-coverage.mjs 实测）。再外推 1*spacing 即 100%。
 *   2) 裁到地图矩形：把越界顶点压到边上 —— y=0 压到 lat=+90（极冠收成一个点），x=0 与 x=W 压到
 *      lon=∓180（同一条经线，接缝闭合）。裁剪后各单元并集 = 矩形本身，球面被覆盖恰好一次。
 *
 * 纯计算，不依赖 three：渲染器把数组塞进 BufferGeometry，单测直接验证数组。
 */
import { calculateVoronoi } from "@/generators/voronoi";
import { SEA_LEVEL } from "@/utils";

export type Polygon2D = [number, number][];

/**
 * 球面该按平面图的哪些图层、什么透明度来上色。
 * 平面图的国色是「40% 半透明压在生物群系上」，直接用纯色就会变成色块，所以这里照抄它的合成方式。
 * 由 globe-lines.readGlobeLayerStyle() 从实时 SVG 读出（图层开关 + 实际透明度 + 底色），
 * 单测用默认值。
 */
export type GlobeLayerStyle = {
  statesVisible: boolean;
  stateOpacity: number; // 来自平面图 states 层的 opacity，默认 0.4
  biomesVisible: boolean;
  reliefVisible: boolean; // 地形阴影开关（跟随 relief 图层）
  landColor: string; // 生物群系关闭时的陆地底色（landmass 填充）
  oceanColor: string;
};

export const DEFAULT_GLOBE_LAYER_STYLE: GlobeLayerStyle = {
  statesVisible: true,
  stateOpacity: 0.4,
  biomesVisible: true,
  reliefVisible: true,
  landColor: "#eef6fb",
  oceanColor: "#466eab"
};

export type GlobeVectorMeshData = {
  positions: number[]; // 每三个一组，非索引三角形列表
  colors: number[]; // 与 positions 一一对应，线性色彩空间（可直接作为顶点色）
  world: boolean; // 是否整世界地图（经度被拉伸铺满整圈）
};

export const LAND_FALLBACK_COLOR = "#c8bfa8"; // 无主且无生物群系的陆地
export const WATER_FALLBACK_COLOR = "#466eab"; // 没有 pack 对应的水域（深海点被 pack 剔除）

/** 带符号的多边形面积（地图 y 向下，正值 = 屏幕上的顺时针环） */
export function signedPolygonArea(polygon: Polygon2D): number {
  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const [x1, y1] = polygon[i];
    const [x2, y2] = polygon[(i + 1) % polygon.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

function interpolateEdge(from: Polygon2D[number], to: Polygon2D[number], dFrom: number, dTo: number): number[] {
  const t = dFrom === dTo ? 0 : dFrom / (dFrom - dTo);
  return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
}

/** Sutherland–Hodgman：把凸多边形裁到地图矩形 [0,W]×[0,H]（Voronoi 单元都是凸的） */
export function clipPolygonToMapRect(polygon: Polygon2D, width: number, height: number): Polygon2D {
  const edges = [
    (p: Polygon2D[number]) => p[0],
    (p: Polygon2D[number]) => width - p[0],
    (p: Polygon2D[number]) => p[1],
    (p: Polygon2D[number]) => height - p[1]
  ];

  let output = polygon;
  for (const signedDistance of edges) {
    if (output.length === 0) return output;
    const input = output;
    output = [];
    for (let i = 0; i < input.length; i++) {
      const current = input[i];
      const previous = input[(i + input.length - 1) % input.length];
      const dCurrent = signedDistance(current);
      const dPrevious = signedDistance(previous);
      if (dCurrent >= 0) {
        if (dPrevious < 0) output.push(interpolateEdge(previous, current, dPrevious, dCurrent) as Polygon2D[number]);
        output.push(current);
      } else if (dPrevious >= 0) {
        output.push(interpolateEdge(previous, current, dPrevious, dCurrent) as Polygon2D[number]);
      }
    }
  }
  return output;
}

/** 两个颜色按 t 混合（0..255 通道空间，与浏览器的图层合成一致） */
function mixHex(base: string, over: string, t: number): string {
  const [br, bg, bb] = parseHexColor(base);
  const [or, og, ob] = parseHexColor(over);
  const mix = (a: number, b: number) => Math.round(a + (b - a) * t);
  return `rgb(${mix(br, or)}, ${mix(bg, og)}, ${mix(bb, ob)})`;
}

function parseHexColor(hex: string): [number, number, number] {
  const value = hex.trim();
  if (value.startsWith("#")) {
    const digits = value.slice(1);
    if (digits.length === 3) {
      return [
        parseInt(digits[0] + digits[0], 16),
        parseInt(digits[1] + digits[1], 16),
        parseInt(digits[2] + digits[2], 16)
      ];
    }
    if (digits.length >= 6) {
      return [
        parseInt(digits.slice(0, 2), 16),
        parseInt(digits.slice(2, 4), 16),
        parseInt(digits.slice(4, 6), 16)
      ];
    }
  }
  const rgb = value.match(/rgba?\(([^)]+)\)/);
  if (rgb) {
    const [r, g, b] = rgb[1].split(",").map(part => Number.parseFloat(part));
    return [r, g, b];
  }
  return [255, 255, 255]; // 解析不了的色值退到白色，不要静默变黑
}

/**
 * 十六进制颜色 → 0..1 的通道值，**不做色域转换**。
 *
 * 应用的地球仪走 `public/libs/three.min.js`（旧版全局构建，没有 ColorManagement），
 * 颜色按原始 sRGB 直接进着色器，输出也不再编码：喂线性值会让整个球偏暗（实测海面
 * #466eab 会渲染成 #102868）。这里的取值必须与那个构建里 `new THREE.Color(hex)` 一致。
 */
export function hexToColorChannels(hex: string): [number, number, number] {
  const [r, g, b] = parseHexColor(hex);
  return [r / 255, g / 255, b / 255];
}

/** 把引擎的边界伪点再外推 1*spacing（合计 2*spacing），用来重算 Voronoi */
function expandedBoundaryRing(width: number, height: number, spacing: number): Polygon2D {
  const push = spacing || 1;
  return grid.boundary.map(([x, y]): Polygon2D[number] => [
    x <= 0 ? x - push : x >= width ? x + push : x,
    y <= 0 ? y - push : y >= height ? y + push : y
  ]);
}

/** 地图像素 → 单位球面直角坐标的投影器（球面与线画共用，保证严丝合缝对齐） */
export function createGlobeProjector() {
  const width = options.map.graph.width;
  const height = options.map.graph.height;
  const { latN, latT, lonW, lonT } = options.map.geography.coordinates;
  const world = latT > 179; // 整世界：经度要拉伸铺满整圈（与 updateGlobeTexure 同一判定）

  return (x: number, y: number): [number, number, number] => {
    const lon = world ? -180 + (x / width) * 360 : lonW + (x / width) * lonT;
    const lat = Math.max(-90, Math.min(90, latN - (y / height) * latT)); // 夹住浮点误差，防止越过极点
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);
    const sinPhi = Math.sin(phi);
    return [-sinPhi * Math.cos(theta), Math.cos(phi), sinPhi * Math.sin(theta)];
  };
}

export function buildGlobeVectorMeshData(
  style: GlobeLayerStyle = DEFAULT_GLOBE_LAYER_STYLE
): GlobeVectorMeshData | null {
  const width = options.map.graph.width;
  const height = options.map.graph.height;
  const world = options.map.geography.coordinates.latT > 179; // 只用于回报构建结果，投影本身在工厂里

  const { cells, vertices } = calculateVoronoi(grid.points, expandedBoundaryRing(width, height, grid.spacing));

  // 取色：不要依赖 gridToPackCellMap（它在地球仪路径下是空的），从 pack.cells.g 建反查表
  const packOfGrid = new Map<number, number>();
  for (let i = 0; i < pack.cells.i.length; i++) {
    const gridCell = pack.cells.g[i];
    if (!packOfGrid.has(gridCell)) packOfGrid.set(gridCell, i);
  }

  const colorCache = new Map<string, [number, number, number]>();

  /** 地形阴影：西北来光，按与西北相邻单元的高度差压暗/提亮（跟随 relief 图层的开关） */
  const heights = grid.cells.h;
  const terrainType = grid.cells.t;
  const cellsX = grid.cellsX;
  const shadeOf = (cell: number, onLand: boolean): number => {
    if (!onLand) {
      // 海洋按水深分带：深海压暗、近岸提亮，和平面图的浅深带一致
      const type = terrainType[cell];
      if (type <= -2) return 0.9;
      if (type === -1) return 1.06;
      return 1;
    }
    if (!style.reliefVisible) return 1;
    const left = cell % cellsX === 0 ? heights[cell] : heights[cell - 1];
    const up = cell < cellsX ? heights[cell] : heights[cell - cellsX];
    const rise = (left + up) / 2 - heights[cell];
    return Math.max(0.86, Math.min(1.14, 1 - rise * 0.012));
  };

  /**
   * 按平面图的合成方式取色：生物群系打底 → 国色按 states 层的透明度压上去
   * → 再乘地形/水深的明暗
   */
  const colorOfGridCell = (cell: number): [number, number, number] => {
    const packCell = packOfGrid.get(cell);
    const onLand = heights[cell] >= SEA_LEVEL;
    let hex = onLand ? style.landColor : style.oceanColor;

    if (packCell !== undefined) {
      const biome = pack.biomes?.[pack.cells.biome[packCell]];
      if (biome?.color && (onLand ? style.biomesVisible : true)) hex = biome.color;

      const stateId = pack.cells.state[packCell];
      const stateColor = stateId ? pack.states[stateId]?.color : undefined;
      if (onLand && style.statesVisible && stateColor) hex = mixHex(hex, stateColor, style.stateOpacity);
    } else if (!onLand) {
      hex = WATER_FALLBACK_COLOR;
    }

    const shade = shadeOf(cell, onLand);
    const key = hex + "|" + shade.toFixed(3);
    const cached = colorCache.get(key);
    if (cached) return cached;

    const base = hexToColorChannels(hex);
    const parsed: [number, number, number] = [base[0] * shade, base[1] * shade, base[2] * shade];
    colorCache.set(key, parsed);
    return parsed;
  };

  const project = createGlobeProjector();

  const positions: number[] = [];
  const colors: number[] = [];

  for (const cell of cells.i) {
    const ring = cells.v[cell];
    if (!ring || ring.length < 3) continue;

    const polygon: Polygon2D = [];
    let broken = false;
    for (const vertex of ring) {
      const point = vertices.p[vertex];
      if (!point || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
        broken = true;
        break;
      }
      polygon.push([point[0], point[1]]);
    }
    if (broken) continue;

    const clipped = clipPolygonToMapRect(polygon, width, height);
    if (clipped.length < 3) continue;

    // 统一环的绕序：引擎的 Voronoi 环偶尔给出反向环，反向环会让这一格的三角形全部朝内被剔除
    if (signedPolygonArea(clipped) < 0) clipped.reverse();

    const [cellR, cellG, cellB] = colorOfGridCell(cell);
    const projected = clipped.map(point => project(point[0], point[1]));

    // 扇形三角化（单元是凸的，裁剪后仍凸）；反序出三角形：地图 y 向下、球面 y 向上
    for (let k = 1; k < projected.length - 1; k++) {
      const a = projected[0];
      const b = projected[k];
      const c = projected[k + 1];

      // 叉积过小 = 极点处顶点被压到一起、或单元被压成极细的条。这类三角形面积在 1e-16 sr 量级，
      // 既看不见，留着还会让 computeVertexNormals 产出 NaN
      const normal = [
        (c[1] - a[1]) * (b[2] - a[2]) - (c[2] - a[2]) * (b[1] - a[1]),
        (c[2] - a[2]) * (b[0] - a[0]) - (c[0] - a[0]) * (b[2] - a[2]),
        (c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])
      ];
      if (Math.hypot(normal[0], normal[1], normal[2]) < 1e-8) continue;

      positions.push(a[0], a[1], a[2], c[0], c[1], c[2], b[0], b[1], b[2]);
      colors.push(cellR, cellG, cellB, cellR, cellG, cellB, cellR, cellG, cellB);
    }
  }

  return positions.length ? { positions, colors, world } : null;
}
