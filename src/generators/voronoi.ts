import Delaunator from "delaunator";
import type { Point } from "@/types/global";

export type { Point } from "@/types/global";

export type Vertices = { p: Point[]; v: number[][]; c: number[][] };
export type Cells = {
  v: number[][];
  c: number[][];
  b: number[];
  i: Uint32Array<ArrayBufferLike>;
};

/**
 * Creates a Voronoi diagram from the given Delaunator, a list of points, and the number of points. The Voronoi diagram is constructed using (I think) the {@link https://en.wikipedia.org/wiki/Bowyer%E2%80%93Watson_algorithm |Bowyer-Watson Algorithm}
 * The {@link https://github.com/mapbox/delaunator/ |Delaunator} library uses {@link https://en.wikipedia.org/wiki/Doubly_connected_edge_list |half-edges} to represent the relationship between points and triangles.
 * @param {{triangles: Uint32Array, halfedges: Int32Array}} delaunay A {@link https://github.com/mapbox/delaunator/blob/master/index.js |Delaunator} instance.
 * @param {Point[]} points A list of coordinates.
 * @param {number} pointsN The number of points.
 */
export class Voronoi {
  delaunay: Delaunator<Float64Array<ArrayBufferLike>>;
  points: Point[];
  pointsN: number;
  cells: Cells = { v: [], c: [], b: [], i: new Uint32Array() }; // voronoi cells: v = cell vertices, c = adjacent cells, b = near-border cell, i = cell indexes;
  vertices: Vertices = { p: [], v: [], c: [] }; // cells vertices: p = vertex coordinates, v = neighboring vertices, c = adjacent cells

  constructor(delaunay: Delaunator<Float64Array<ArrayBufferLike>>, points: Point[], pointsN: number) {
    this.delaunay = delaunay;
    this.points = points;
    this.pointsN = pointsN;
    this.vertices;

    // Half-edges are the indices into the delaunator outputs:
    // delaunay.triangles[e] gives the point ID where the half-edge starts
    // delaunay.halfedges[e] returns either the opposite half-edge in the adjacent triangle, or -1 if there's not an adjacent triangle.
    for (let e = 0; e < this.delaunay.triangles.length; e++) {
      const p = this.delaunay.triangles[this.nextHalfedge(e)];
      if (p < this.pointsN && !this.cells.c[p]) this.buildCell(p, e);

      const t = this.triangleOfEdge(e);
      if (!this.vertices.p[t]) {
        this.vertices.p[t] = this.triangleCenter(t); // vertex: coordinates
        this.vertices.v[t] = this.trianglesAdjacentToTriangle(t); // vertex: adjacent vertices
        this.vertices.c[t] = this.pointsOfTriangle(t); // vertex: adjacent cells
      }
    }
  }

  /**
   * Gets the IDs of the points comprising the given triangle. Taken from {@link https://mapbox.github.io/delaunator/#triangle-to-points| the Delaunator docs.}
   * @param {number} t The index of the triangle
   * @returns {[number, number, number]} The IDs of the points comprising the given triangle.
   */
  private pointsOfTriangle(triangleIndex: number): [number, number, number] {
    const edge = 3 * triangleIndex;
    const { triangles } = this.delaunay;
    return [triangles[edge], triangles[edge + 1], triangles[edge + 2]];
  }

  /**
   * Identifies what triangles are adjacent to the given triangle. Taken from {@link https://mapbox.github.io/delaunator/#triangle-to-triangles| the Delaunator docs.}
   * @param {number} triangleIndex The index of the triangle
   * @returns {number[]} The indices of the triangles that share half-edges with this triangle.
   */
  private trianglesAdjacentToTriangle(triangleIndex: number): number[] {
    const edge = 3 * triangleIndex;
    const { halfedges } = this.delaunay;
    return [
      this.triangleOfEdge(halfedges[edge]),
      this.triangleOfEdge(halfedges[edge + 1]),
      this.triangleOfEdge(halfedges[edge + 2])
    ];
  }

  /** Build both cell adjacency arrays in the original half-edge traversal order. */
  private buildCell(pointIndex: number, start: number): void {
    const vertices: number[] = [];
    const neighbors: number[] = [];
    const { triangles, halfedges } = this.delaunay;
    let incoming = start;
    do {
      vertices.push(this.triangleOfEdge(incoming));
      const neighbor = triangles[incoming];
      if (neighbor < this.pointsN) neighbors.push(neighbor);
      const outgoing = this.nextHalfedge(incoming);
      incoming = halfedges[outgoing];
    } while (incoming !== -1 && incoming !== start && vertices.length < 20);
    this.cells.v[pointIndex] = vertices;
    this.cells.c[pointIndex] = neighbors;
    this.cells.b[pointIndex] = vertices.length > neighbors.length ? 1 : 0;
  }

  /**
   * Returns the center of the triangle located at the given index.
   * @param {number} triangleIndex The index of the triangle
   * @returns {Point} The coordinates of the triangle's circumcenter.
   */
  private triangleCenter(triangleIndex: number): Point {
    const edge = 3 * triangleIndex;
    const { triangles } = this.delaunay;
    return this.circumcenter(
      this.points[triangles[edge]],
      this.points[triangles[edge + 1]],
      this.points[triangles[edge + 2]]
    );
  }

  /**
   * Enables lookup of a triangle, given one of the half-edges of that triangle. Taken from {@link https://mapbox.github.io/delaunator/#edge-and-triangle| the Delaunator docs.}
   * @param {number} e The index of the edge
   * @returns {number} The index of the triangle
   */
  private triangleOfEdge(e: number): number {
    return Math.floor(e / 3);
  }

  /**
   * Moves to the next half-edge of a triangle, given the current half-edge's index. Taken from {@link https://mapbox.github.io/delaunator/#edge-to-edges| the Delaunator docs.}
   * @param {number} e The index of the current half edge
   * @returns {number} The index of the next half edge
   */
  private nextHalfedge(e: number): number {
    return e % 3 === 2 ? e - 2 : e + 1;
  }

  /**
   * Moves to the previous half-edge of a triangle, given the current half-edge's index. Taken from {@link https://mapbox.github.io/delaunator/#edge-to-edges| the Delaunator docs.}
   * @param {number} e The index of the current half edge
   * @returns {number} The index of the previous half edge
   */
  // private prevHalfedge(e: number): number { return (e % 3 === 0) ? e + 2 : e - 1; }

  /**
   * Finds the circumcenter of the triangle identified by points a, b, and c. Taken from {@link https://en.wikipedia.org/wiki/Circumscribed_circle#Circumcenter_coordinates| Wikipedia}
   * @param {[number, number]} a The coordinates of the first point of the triangle
   * @param {[number, number]} b The coordinates of the second point of the triangle
   * @param {[number, number]} c The coordinates of the third point of the triangle
   * @return {[number, number]} The coordinates of the circumcenter of the triangle.
   */
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

/**
 * Builds the Voronoi diagram for the given points, using the boundary pseudo-points to clip the outer cells
 * @param points - cell points
 * @param boundary - pseudo-points along the map edge, they get no cells of their own
 */
export const calculateVoronoi = (points: Point[], boundary: Point[]): { cells: Cells; vertices: Vertices } => {
  TIME && console.time("calculateDelaunay");
  const allPoints = points.concat(boundary);
  const delaunay = Delaunator.from(allPoints);
  TIME && console.timeEnd("calculateDelaunay");

  TIME && console.time("calculateVoronoi");
  const { cells, vertices } = new Voronoi(delaunay, allPoints, points.length);
  cells.i = Uint32Array.from({ length: points.length }, (_, i) => i);
  TIME && console.timeEnd("calculateVoronoi");

  return { cells, vertices };
};
