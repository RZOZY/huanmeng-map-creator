import { Color } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildGlobeVectorMeshData,
  DEFAULT_GLOBE_LAYER_STYLE,
  clipPolygonToMapRect,
  hexToColorChannels,
  signedPolygonArea
} from "./globe-vector";

const W = 80;
const H = 40;
const SPACING = 10;

const WORLD = { latT: 180, latN: 90, latS: -90, lonT: 320, lonW: -160, lonE: 160 };
const REGION = { latT: 60, latN: 40, latS: -20, lonT: 100, lonW: -50, lonE: 50 };

const STATE_COLOR = "#ff0000";
const BIOME_COLOR = "#29bc56"; // 生物群系 5
const MARINE_COLOR = "#466eab"; // 生物群系 0 = 海洋

/** 一张 8x4 的抖动方网格 + 引擎同款外部边界环（只造出模块真正读取的字段） */
function installFixture(coordinates: typeof WORLD | typeof REGION) {
  const boundary: [number, number][] = [];
  for (let x = 0; x <= W; x += SPACING) boundary.push([x, -SPACING], [x, H + SPACING]);
  for (let y = 0; y <= H; y += SPACING) boundary.push([-SPACING, y], [W + SPACING, y]);

  let seed = 12345;
  const jitter = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return (seed / 2147483648 - 0.5) * 6; // 与引擎一样，点只在自身方格内抖动
  };
  const points: [number, number][] = [];
  for (let y = SPACING / 2; y < H; y += SPACING)
    for (let x = SPACING / 2; x < W; x += SPACING) points.push([x + jitter(), y + jitter()]);

  const heights = new Uint8Array(points.length).fill(10);
  const terrain = new Int8Array(points.length).fill(1); // 浅海：水深分带按 1 处理 // 默认全是水
  heights[0] = 30; // 有主陆地
  heights[20] = 30; // 无主陆地

  const biomes = Array.from({ length: 13 }, (_, i) => ({ color: i === 5 ? BIOME_COLOR : MARINE_COLOR }));

  vi.stubGlobal("grid", { spacing: SPACING, points, boundary, cellsX: W / SPACING, cells: { h: heights, t: terrain } });
  vi.stubGlobal("pack", {
    cells: {
      i: [0, 1, 2],
      g: [0, 20, 5], // pack 单元 → grid 单元
      state: [1, 0, 0],
      biome: [0, 5, 0]
    },
    states: [{ i: 0 }, { i: 1, name: "测试国", color: STATE_COLOR }],
    biomes
  });
  vi.stubGlobal("options", { map: { graph: { width: W, height: H }, geography: { coordinates } } });

  return { heights, terrain };
}

afterEach(() => vi.unstubAllGlobals());

type Vec3 = [number, number, number];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];

/** 单位球面三角形面积（实体角） */
function sphericalArea(a: Vec3, b: Vec3, c: Vec3): number {
  const det = Math.abs(dot(a, cross(b, c)));
  const den = 1 + dot(a, b) + dot(b, c) + dot(c, a);
  return 2 * Math.atan2(det, den);
}

/** 把三角形列表拆成 [a, b, c] 三元组 */
function triangles(positions: number[]): Vec3[][] {
  const result: Vec3[][] = [];
  for (let i = 0; i < positions.length; i += 9) {
    result.push([
      [positions[i], positions[i + 1], positions[i + 2]],
      [positions[i + 3], positions[i + 4], positions[i + 5]],
      [positions[i + 6], positions[i + 7], positions[i + 8]]
    ]);
  }
  return result;
}

describe("clipPolygonToMapRect", () => {
  it("把越界的凸多边形裁到矩形边上", () => {
    const square: [number, number][] = [
      [-10, -10],
      [30, -10],
      [30, 30],
      [-10, 30]
    ];
    const clipped = clipPolygonToMapRect(square, 10, 10);
    expect(signedPolygonArea(clipped)).toBeCloseTo(100, 9); // 只留 [0,10]x[0,10]
    for (const [x, y] of clipped) {
      expect(x).toBeGreaterThanOrEqual(-1e-9);
      expect(x).toBeLessThanOrEqual(10 + 1e-9);
      expect(y).toBeGreaterThanOrEqual(-1e-9);
      expect(y).toBeLessThanOrEqual(10 + 1e-9);
    }
  });

  it("整个多边形都在外面时裁成空", () => {
    expect(clipPolygonToMapRect([[-5, -5], [-1, -5], [-1, -1]], 10, 10).length).toBeLessThan(3);
  });
});

describe("hexToColorChannels", () => {
  it("给的是原始 sRGB 通道值，不做线性化", () => {
    // 地球仪用的是 public/libs/three.min.js（旧版全局构建，无色彩管理）：
    // 颜色原样进着色器、输出也不再编码，所以顶点色必须与 new THREE.Color(hex) 一致 = 原始 sRGB。
    // 预先线性化会让整个球偏暗（海面 #466eab 渲染成 #102868），这是实测过的坑。
    expect(hexToColorChannels("#ffffff")).toEqual([1, 1, 1]);
    expect(hexToColorChannels("#000000")).toEqual([0, 0, 0]);
    const [r, g, b] = hexToColorChannels(MARINE_COLOR);
    expect([r, g, b]).toEqual([0x46 / 255, 0x6e / 255, 0xab / 255]);
    // 顺带确认：npm 版 three（有色彩管理）给出的是线性值，两者不能混用
    expect(new Color(MARINE_COLOR).b).not.toBeCloseTo(b, 3);
  });
});

describe("buildGlobeVectorMeshData", () => {
  it("整世界地图：球面被覆盖恰好一次，三角形全部朝外", () => {
    installFixture(WORLD);
    const data = buildGlobeVectorMeshData();
    expect(data).not.toBeNull();

    const list = triangles(data!.positions);
    expect(list.length).toBeGreaterThan(20);
    expect(data!.colors.length).toBe(data!.positions.length);

    let area = 0;
    let volume = 0;
    let inward = 0;
    for (const [a, b, c] of list) {
      area += sphericalArea(a, b, c);
      // 所有三角形对原点的带符号体积之和 = 包围的体积（顶点顺序是 p1,p2,p3，朝向反了会变负）
      volume += dot(a, cross(b, c)) / 6;
      const normal = cross(sub(b, a), sub(c, a));
      if (dot(normal, [a[0] + b[0] + c[0], a[1] + b[1] + c[1], a[2] + b[2] + c[2]]) < 0) inward++;
      for (const p of [a, b, c]) expect(Math.hypot(p[0], p[1], p[2])).toBeCloseTo(1, 9);
    }

    // 面积总量 = 4π：单元既不重不漏地铺满地图矩形，投影就恰好覆盖球面一次（有洞会 < 4π，有重叠会 > 4π）
    expect(area / (4 * Math.PI)).toBeCloseTo(1, 9);
    expect(volume).toBeGreaterThan(0);
    expect(inward).toBe(0);
  });

  it("区域地图：只覆盖配置的经纬度带，边界精确落在 lonW/lonE/latS/latN", () => {
    installFixture(REGION);
    const data = buildGlobeVectorMeshData();
    expect(data).not.toBeNull();
    expect(data!.world).toBe(false);

    let lonMin = 180;
    let lonMax = -180;
    let latMin = 90;
    let latMax = -90;
    for (const [x, y, z] of triangles(data!.positions).flat()) {
      const lat = 90 - (Math.acos(Math.max(-1, Math.min(1, y))) * 180) / Math.PI;
      let lon = (Math.atan2(z, -x) * 180) / Math.PI - 180;
      if (lon < -180) lon += 360;
      lonMin = Math.min(lonMin, lon);
      lonMax = Math.max(lonMax, lon);
      latMin = Math.min(latMin, lat);
      latMax = Math.max(latMax, lat);
    }

    expect(lonMin).toBeCloseTo(REGION.lonW, 6);
    expect(lonMax).toBeCloseTo(REGION.lonE, 6);
    expect(latMin).toBeCloseTo(REGION.latS, 6);
    expect(latMax).toBeCloseTo(REGION.latN, 6);
  });

  it("取色：国色按 states 层的透明度压在生物群系上，水域用水深分带", () => {
    installFixture(WORLD);
    // 关掉地形阴影，单独验合成规则
    const data = buildGlobeVectorMeshData({ ...DEFAULT_GLOBE_LAYER_STYLE, reliefVisible: false });
    expect(data).not.toBeNull();

    const distinct = new Set<string>();
    for (let i = 0; i < data!.colors.length; i += 3) {
      distinct.add([data!.colors[i], data!.colors[i + 1], data!.colors[i + 2]].map(v => v.toFixed(6)).join(
));
    }

    const channels = (rgb: number[]) => rgb.map(v => v.toFixed(6)).join(
);
    // 与 mixHex 同一套算法：0..255 通道空间取整后再归一
    const blend = (baseHex: string, overHex: string, t: number) => {
      const base = hexToColorChannels(baseHex).map(v => v * 255);
      const over = hexToColorChannels(overHex).map(v => v * 255);
      return base.map((value, index) => Math.round(value + (over[index] - value) * t) / 255);
    };

    expect(distinct.size).toBe(3); // 有主陆地=生物群系+国色、无主陆地=生物群系、水域=海洋色
    expect(distinct.has(channels(blend(MARINE_COLOR, STATE_COLOR, 0.4)))).toBe(true);
    expect(distinct.has(channels(hexToColorChannels(BIOME_COLOR)))).toBe(true);
    expect(distinct.has(channels(hexToColorChannels(MARINE_COLOR)))).toBe(true);
  });

  it("水深分带：深海压暗、近岸提亮", () => {
    const { terrain } = installFixture(WORLD);
    terrain[1] = -2; // 深海
    terrain[2] = -1; // 近岸
    const data = buildGlobeVectorMeshData({ ...DEFAULT_GLOBE_LAYER_STYLE, reliefVisible: false });
    expect(data).not.toBeNull();

    const distinct = new Set<string>();
    for (let i = 0; i < data!.colors.length; i += 3) {
      distinct.add([data!.colors[i], data!.colors[i + 1], data!.colors[i + 2]].map(v => v.toFixed(6)).join(
));
    }

    const marine = hexToColorChannels(MARINE_COLOR);
    const shaded = (factor: number) => marine.map(v => (v * factor).toFixed(6)).join(
);
    expect(distinct.has(shaded(0.9))).toBe(true);
    expect(distinct.has(shaded(1.06))).toBe(true);
  });
});
