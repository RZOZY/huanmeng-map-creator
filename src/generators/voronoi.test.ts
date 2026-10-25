import Delaunator from "delaunator";
import { describe, expect, it } from "vitest";
import { type Cells, calculateVoronoi, type Point, type Vertices, Voronoi } from "./voronoi";

describe("Voronoi", () => {
  // A Voronoi vertex is the circumcenter of its Delaunay triangle: equidistant from
  // all three of the triangle's points. Quantizing vertex coordinates (the old
  // Math.floor in circumcenter) breaks this and makes cells visibly blocky once cell
  // spacing approaches the quantization step (high cell counts).
  it("places each vertex at the exact circumcenter of its triangle (no rounding)", () => {
    const points: Point[] = [
      [3.17, 4.93],
      [11.61, 2.27],
      [7.44, 9.81],
      [14.02, 8.66],
      [10.35, 15.49],
      [2.71, 12.08]
    ];
    const boundary: Point[] = [
      [-50, -50],
      [70, -50],
      [70, 66],
      [-50, 66]
    ];
    const allPoints = points.concat(boundary);

    const { vertices } = new Voronoi(Delaunator.from(allPoints), allPoints, points.length);

    let checked = 0;
    vertices.p.forEach((vertex, t) => {
      const dist = (p: Point) => Math.hypot(vertex[0] - p[0], vertex[1] - p[1]);
      const [ra, rb, rc] = vertices.c[t].map(pointId => dist(allPoints[pointId]));
      expect(Math.abs(ra - rb), `vertex ${t} not equidistant from its triangle points`).toBeLessThan(1e-6);
      expect(Math.abs(ra - rc), `vertex ${t} not equidistant from its triangle points`).toBeLessThan(1e-6);
      checked++;
    });
    expect(checked).toBeGreaterThan(0);
  });
});

// Frozen pre-optimization algorithm: keep its temporary arrays and arithmetic for differential checks.
class ReferenceVoronoi {
  delaunay: Delaunator<Float64Array<ArrayBufferLike>>;
  points: Point[];
  pointsN: number;
  cells: Cells = { v: [], c: [], b: [], i: new Uint32Array() };
  vertices: Vertices = { p: [], v: [], c: [] };

  constructor(delaunay: Delaunator<Float64Array<ArrayBufferLike>>, points: Point[], pointsN: number) {
    this.delaunay = delaunay;
    this.points = points;
    this.pointsN = pointsN;
    for (let e = 0; e < this.delaunay.triangles.length; e++) {
      const p = this.delaunay.triangles[this.nextHalfedge(e)];
      if (p < this.pointsN && !this.cells.c[p]) {
        const edges = this.edgesAroundPoint(e);
        this.cells.v[p] = edges.map(e => this.triangleOfEdge(e));
        this.cells.c[p] = edges.map(e => this.delaunay.triangles[e]).filter(c => c < this.pointsN);
        this.cells.b[p] = edges.length > this.cells.c[p].length ? 1 : 0;
      }

      const t = this.triangleOfEdge(e);
      if (!this.vertices.p[t]) {
        this.vertices.p[t] = this.triangleCenter(t);
        this.vertices.v[t] = this.trianglesAdjacentToTriangle(t);
        this.vertices.c[t] = this.pointsOfTriangle(t);
      }
    }
  }

  private pointsOfTriangle(triangleIndex: number): [number, number, number] {
    return this.edgesOfTriangle(triangleIndex).map(edge => this.delaunay.triangles[edge]) as [number, number, number];
  }

  private trianglesAdjacentToTriangle(triangleIndex: number): number[] {
    const triangles = [];
    for (const edge of this.edgesOfTriangle(triangleIndex)) {
      const opposite = this.delaunay.halfedges[edge];
      triangles.push(this.triangleOfEdge(opposite));
    }
    return triangles;
  }

  private edgesAroundPoint(start: number): number[] {
    const result = [];
    let incoming = start;
    do {
      result.push(incoming);
      const outgoing = this.nextHalfedge(incoming);
      incoming = this.delaunay.halfedges[outgoing];
    } while (incoming !== -1 && incoming !== start && result.length < 20);
    return result;
  }

  private triangleCenter(triangleIndex: number): Point {
    const vertices = this.pointsOfTriangle(triangleIndex).map(p => this.points[p]);
    return this.circumcenter(vertices[0], vertices[1], vertices[2]);
  }

  private edgesOfTriangle(triangleIndex: number): [number, number, number] {
    return [3 * triangleIndex, 3 * triangleIndex + 1, 3 * triangleIndex + 2];
  }

  private triangleOfEdge(e: number): number {
    return Math.floor(e / 3);
  }

  private nextHalfedge(e: number): number {
    return e % 3 === 2 ? e - 2 : e + 1;
  }

  private circumcenter(a: Point, b: Point, c: Point): Point {
    const [ax, ay] = a;
    const [bx, by] = b;
    const [cx, cy] = c;
    const ad = ax * ax + ay * ay;
    const bd = bx * bx + by * by;
    const cd = cx * cx + cy * cy;
    const D = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    return [
      (1 / D) * (ad * (by - cy) + bd * (cy - ay) + cd * (ay - by)),
      (1 / D) * (ad * (cx - bx) + bd * (ax - cx) + cd * (bx - ax))
    ];
  }
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function gridPoints(columns: number, rows: number, jitter = 0, seed = 1): Point[] {
  const random = seededRandom(seed);
  const points: Point[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      points.push([
        Math.round((x + 0.5 + (random() - 0.5) * jitter) * 100) / 100,
        Math.round((y + 0.5 + (random() - 0.5) * jitter) * 100) / 100
      ]);
    }
  }
  return points;
}

function boundaryPoints(width: number, height: number): Point[] {
  return [
    [-1, -1],
    [width / 2, -1],
    [width + 1, -1],
    [width + 1, height / 2],
    [width + 1, height + 1],
    [width / 2, height + 1],
    [-1, height + 1],
    [-1, height / 2]
  ];
}

interface Fixture {
  name: string;
  points: Point[];
  boundary: Point[];
}

const fixtures: Fixture[] = [
  { name: "empty", points: [], boundary: [] },
  { name: "boundary only", points: [], boundary: boundaryPoints(10, 10) },
  { name: "one point", points: [[0.3, 0.7]], boundary: boundaryPoints(1, 1) },
  {
    name: "two unbounded points",
    points: [
      [0, 0],
      [1, 1]
    ],
    boundary: []
  },
  {
    name: "unbounded triangle",
    points: [
      [0, 0],
      [5, 0],
      [1, 4]
    ],
    boundary: []
  },
  { name: "collinear", points: Array.from({ length: 17 }, (_, i) => [i, i * 0.5]), boundary: [] },
  {
    name: "near collinear",
    points: Array.from({ length: 17 }, (_, i) => [i, i * 0.5 + (i % 2) * 1e-12]),
    boundary: boundaryPoints(20, 10)
  },
  {
    name: "duplicates and sparse cell slots",
    points: [
      [1, 1],
      [1, 1],
      [8, 1],
      [4, 7],
      [4, 7],
      [3, 3]
    ],
    boundary: boundaryPoints(10, 10)
  },
  { name: "regular lattice", points: gridPoints(12, 9), boundary: boundaryPoints(12, 9) },
  { name: "jittered lattice", points: gridPoints(37, 23, 0.9, 510), boundary: boundaryPoints(37, 23) },
  {
    name: "sparse packed-like coast",
    points: gridPoints(32, 19, 0.9, 714).filter(([x, y]) => x < 14 || Math.abs(y - 10) < 1),
    boundary: boundaryPoints(32, 19)
  },
  {
    name: "large coordinate offsets",
    points: gridPoints(9, 7, 0.9, 86).map(([x, y]) => [x + 1e6, y - 1e6]),
    boundary: boundaryPoints(9, 7).map(([x, y]) => [x + 1e6, y - 1e6])
  }
];

for (let seed = 1; seed <= 20; seed++) {
  const random = seededRandom(seed);
  fixtures.push({
    name: `seeded cloud ${seed}`,
    points: Array.from({ length: 20 + seed * 7 }, () => [random() * 100, random() * 60]),
    boundary: boundaryPoints(100, 60)
  });
}

describe("Voronoi differential compatibility", () => {
  it.each(fixtures)("preserves every ordered cells/vertices array for $name", ({ points, boundary }) => {
    const allPoints = points.concat(boundary);
    const originalPoints = structuredClone(allPoints);
    const delaunay = Delaunator.from(allPoints);
    const triangles = delaunay.triangles.slice();
    const halfedges = delaunay.halfedges.slice();
    const reference = new ReferenceVoronoi(delaunay, allPoints, points.length);
    const actual = new Voronoi(delaunay, allPoints, points.length);

    expect(actual.cells).toStrictEqual(reference.cells);
    expect(actual.vertices).toStrictEqual(reference.vertices);
    expect(allPoints).toStrictEqual(originalPoints);
    expect(delaunay.triangles).toStrictEqual(triangles);
    expect(delaunay.halfedges).toStrictEqual(halfedges);

    const result = calculateVoronoi(points, boundary);
    reference.cells.i = Uint32Array.from({ length: points.length }, (_, i) => i);
    expect(result).toStrictEqual({ cells: reference.cells, vertices: reference.vertices });
  });

  it("retains sparse slots for duplicate points and -1 hull neighbors", () => {
    const points: Point[] = [
      [0, 0],
      [5, 0],
      [0, 0],
      [1, 4]
    ];
    const delaunay = Delaunator.from(points);
    const actual = new Voronoi(delaunay, points, points.length);
    const reference = new ReferenceVoronoi(delaunay, points, points.length);
    expect(actual.cells).toStrictEqual(reference.cells);
    expect(actual.vertices).toStrictEqual(reference.vertices);
    expect(actual.cells.c.filter(Boolean).length).toBeLessThan(points.length);
    expect(actual.vertices.v.some(neighbors => neighbors.includes(-1))).toBe(true);
  });

  it("keeps the original traversal start and 20-step guard for high-valence cells", () => {
    const points: Point[] = [
      [0, 0],
      ...Array.from({ length: 32 }, (_, i): Point => [Math.cos((i * Math.PI) / 16), Math.sin((i * Math.PI) / 16)])
    ];
    const delaunay = Delaunator.from(points);
    const actual = new Voronoi(delaunay, points, points.length);
    const reference = new ReferenceVoronoi(delaunay, points, points.length);
    expect(actual.cells.v[0]).toHaveLength(20);
    expect(actual.cells).toStrictEqual(reference.cells);
    expect(actual.vertices).toStrictEqual(reference.vertices);
  });

  it.each([0, 1, 7, 12])("preserves boundary filtering for a real-point prefix of %i", pointsN => {
    const points = gridPoints(4, 3, 0.9, 629);
    const delaunay = Delaunator.from(points);
    const actual = new Voronoi(delaunay, points, pointsN);
    const reference = new ReferenceVoronoi(delaunay, points, pointsN);
    expect(actual.cells).toStrictEqual(reference.cells);
    expect(actual.vertices).toStrictEqual(reference.vertices);
    if (pointsN && pointsN < points.length) expect(actual.cells.b).toContain(1);
  });
});

it.runIf(process.env.FMG_VORONOI_BENCH === "1")(
  "reports an opt-in warm local allocation benchmark",
  () => {
    const points = gridPoints(240, 135, 0.9, 20261026);
    const allPoints = points.concat(boundaryPoints(240, 135));
    const delaunay = Delaunator.from(allPoints);
    const rounds = 11;
    const warmups = 5;
    const referenceMs: number[] = [];
    const optimizedMs: number[] = [];
    let checksum = 0;
    const reference = () => new ReferenceVoronoi(delaunay, allPoints, points.length);
    const optimized = () => new Voronoi(delaunay, allPoints, points.length);
    const run = (build: () => Pick<Voronoi, "cells" | "vertices">): number => {
      const start = performance.now();
      const result = build();
      const elapsed = performance.now() - start;
      checksum += result.cells.c.length + result.vertices.p.length + result.vertices.c[0][0];
      return elapsed;
    };
    for (let i = 0; i < warmups; i++) {
      run(reference);
      run(optimized);
    }
    for (let i = 0; i < rounds; i++) {
      if (i % 2) {
        optimizedMs.push(run(optimized));
        referenceMs.push(run(reference));
      } else {
        referenceMs.push(run(reference));
        optimizedMs.push(run(optimized));
      }
    }
    const median = (samples: number[]): number => [...samples].sort((a, b) => a - b)[Math.floor(samples.length / 2)];
    const referenceMedian = median(referenceMs);
    const optimizedMedian = median(optimizedMs);
    console.info(
      JSON.stringify({
        scope: "Voronoi construction only; prebuilt Delaunator; no CPU profiling or forced GC; not map loading",
        node: process.version,
        seed: 20261026,
        points: points.length,
        triangles: delaunay.triangles.length / 3,
        warmups,
        rounds,
        referenceMs,
        optimizedMs,
        referenceMedian,
        optimizedMedian,
        speedup: referenceMedian / optimizedMedian,
        checksum
      })
    );
    expect(Number.isFinite(checksum)).toBe(true);
  },
  60000
);
