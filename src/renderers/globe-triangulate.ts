/**
 * 多边形三角化（耳切法），不依赖任何运行时库。
 *
 * 为什么自己写：原来借用页面里旧版 three 全局包的 ShapeUtils.triangulateShape，
 * 它返回的索引约定与现代 earcut 版不同 —— 索引一旦错位，球面上就会出现
 * 「横贯全球的巨大楔形」和「成片三角形破洞」。自己实现可以单测（面积守恒），
 * 也不受打包版/开发版运行时差异影响。
 *
 * 只处理外轮廓：湖这类孔洞由平面图的 lakes 图层自己画在上面，
 * 与平面图的图层堆叠一致（关掉湖泊图层时，湖面本来就显示陆地色）。
 */
import type { Point } from "@/types/global";

export type GlobeTriangle = [Point, Point, Point];

/** 有向面积（正 = 逆时针） */
export function signedArea(points: Point[]): number {
  let sum = 0;
  for (let index = 0; index < points.length; index++) {
    const [x1, y1] = points[index];
    const [x2, y2] = points[(index + 1) % points.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

/**
 * 按最小间距抽稀轮廓。地图路径动辄上万个点，过密的点只会切出细长三角形，
 * 而且耳切是 O(n²) —— 抽到 3 地图像素（球面上约 1.5 屏幕像素）肉眼无损。
 */
export function simplifyRing(points: Point[], minDistance = 3): Point[] {
  const out: Point[] = [];
  for (const point of points) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(point[0] - last[0], point[1] - last[1]) >= minDistance) out.push(point);
  }

  // 首尾太近的点会退化成零面积，去掉
  while (out.length > 3 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) < minDistance) {
    out.pop();
  }

  return out.length >= 3 ? out : points;
}

const cross = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) =>
  (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);

/** 点是否在三角形内（含边界，用于耳判定） */
function inTriangle(px: number, py: number, a: Point, b: Point, c: Point): boolean {
  const d1 = cross(a[0], a[1], b[0], b[1], px, py);
  const d2 = cross(b[0], b[1], c[0], c[1], px, py);
  const d3 = cross(c[0], c[1], a[0], a[1], px, py);
  return d1 >= 0 && d2 >= 0 && d3 >= 0;
}

/**
 * 耳切三角化。输入的轮廓会被复制，不改动调用方数据。
 * 自相交等病态轮廓可能切不出耳：那时把剩下的多边形直接作为一个三角形吐出，宁可留一块也比整片糊掉好。
 */
export function triangulatePolygon(points: Point[]): GlobeTriangle[] {
  const ring = simplifyRing(points).map(point => [point[0], point[1]] as Point);
  if (ring.length < 3) return [];

  // 统一成逆时针，耳的判定才只需看一次叉积符号
  if (signedArea(ring) < 0) ring.reverse();

  const triangles: GlobeTriangle[] = [];
  const indices = ring.map((_, index) => index);
  let guard = 0;
  const maxGuard = indices.length * indices.length + 16;

  while (indices.length > 3 && guard++ < maxGuard) {
    let clipped = false;

    for (let position = 0; position < indices.length; position++) {
      const previous = indices[(position - 1 + indices.length) % indices.length];
      const current = indices[position];
      const next = indices[(position + 1) % indices.length];
      const a = ring[previous];
      const b = ring[current];
      const c = ring[next];

      // 凹点不是耳
      if (cross(a[0], a[1], b[0], b[1], c[0], c[1]) <= 0) continue;

      // 耳内不能有其它顶点
      let contains = false;
      for (const index of indices) {
        if (index === previous || index === current || index === next) continue;
        if (inTriangle(ring[index][0], ring[index][1], a, b, c)) {
          contains = true;
          break;
        }
      }
      if (contains) continue;

      triangles.push([a, b, c]);
      indices.splice(position, 1);
      clipped = true;
      break;
    }

    if (!clipped) break; // 病态轮廓：下面的收尾会把剩余部分补上
  }

  if (indices.length === 3) {
    triangles.push([ring[indices[0]], ring[indices[1]], ring[indices[2]]]);
  }

  return triangles;
}
