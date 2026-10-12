import { describe, expect, it } from "vitest";
import { signedArea, simplifyRing, triangulatePolygon } from "./globe-triangulate";

const areaOf = (triangles: ReturnType<typeof triangulatePolygon>) =>
  triangles.reduce((sum, [a, b, c]) => sum + Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2, 0);

describe("triangulatePolygon", () => {
  it("正方形切成两个三角形，面积守恒", () => {
    const square = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10]
    ] as [number, number][];

    const triangles = triangulatePolygon(square);
    expect(triangles).toHaveLength(2);
    expect(areaOf(triangles)).toBeCloseTo(100, 6);
  });

  it("L 形（凹多边形）面积守恒，且没有三角形跑到轮廓外", () => {
    const shape = [
      [0, 0],
      [10, 0],
      [10, 4],
      [4, 4],
      [4, 10],
      [0, 10]
    ] as [number, number][];

    const triangles = triangulatePolygon(shape);
    expect(areaOf(triangles)).toBeCloseTo(10 * 4 + 4 * 6, 6);
    for (const [a, b, c] of triangles) {
      // 所有顶点都必须来自原轮廓（索引错位会造出不存在的点）
      for (const point of [a, b, c]) {
        expect(shape.some(([x, y]) => x === point[0] && y === point[1])).toBe(true);
      }
    }
  });

  it("顺时针输入也能处理（内部会统一绕向）", () => {
    const clockwise = [
      [0, 0],
      [0, 10],
      [10, 10],
      [10, 0]
    ] as [number, number][];

    expect(areaOf(triangulatePolygon(clockwise))).toBeCloseTo(100, 6);
  });

  it("重复点与共线点不会漏面积", () => {
    const noisy = [
      [0, 0],
      [5, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 5]
    ] as [number, number][];

    expect(areaOf(triangulatePolygon(noisy))).toBeCloseTo(100, 6);
  });

  it("顶点不足三个时返回空", () => {
    expect(triangulatePolygon([[0, 0], [1, 1]] as [number, number][])).toHaveLength(0);
  });

  it("有向面积：逆时针为正", () => {
    expect(signedArea([[0, 0], [10, 0], [10, 10], [0, 10]] as [number, number][])).toBeGreaterThan(0);
    expect(signedArea([[0, 0], [0, 10], [10, 10], [10, 0]] as [number, number][])).toBeLessThan(0);
  });
});

describe("simplifyRing", () => {
  it("去掉过密的点，密集正方形的面积基本保持不变", () => {
    const dense: [number, number][] = [];
    for (let step = 0; step < 100; step++) dense.push([step, 0]);
    for (let step = 0; step < 100; step++) dense.push([100, step]);
    for (let step = 0; step < 100; step++) dense.push([100 - step, 100]);
    for (let step = 0; step < 100; step++) dense.push([0, 100 - step]);

    const simplified = simplifyRing(dense, 3);
    expect(simplified.length).toBeLessThan(dense.length / 2);
    expect(Math.abs(signedArea(simplified))).toBeGreaterThan(100 * 100 * 0.95);
    expect(simplified.length).toBeGreaterThan(3);
  });

  it("点数不足时原样返回", () => {
    const triangle: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10]
    ];
    expect(simplifyRing(triangle, 3)).toHaveLength(3);
  });
});
