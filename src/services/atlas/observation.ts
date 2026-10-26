import { type CanvasSize, type GeographicFrame, validateGeographicFrame } from "./coordinates";
import { type AtlasManifest, type AtlasObjectKind, verifyMapSnapshot } from "./manifest";

export interface AtlasMapSnapshot {
  readonly sha256: string;
  readonly projection: "equirectangular";
  readonly frame: GeographicFrame;
  readonly size: CanvasSize;
  readonly objects: readonly {
    readonly kind: AtlasObjectKind;
    readonly objectId: number;
    readonly position: { readonly x: number; readonly y: number };
  }[];
}

export interface AtlasModelSource {
  readonly graph: unknown;
  readonly coordinates: unknown;
  readonly burgs: unknown;
  readonly markers: unknown;
  readonly addedLabels: unknown;
}

function invalid(message: string): never {
  throw new Error(`图集目标观测失败：${message}`);
}
function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(`${field} 缺少对象数据`);
  return value as Record<string, unknown>;
}
function finite(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) invalid(`${field} 不是有限数字`);
  return value;
}
function json(value: string | undefined, field: string): unknown {
  try {
    return JSON.parse(value ?? "");
  } catch {
    return invalid(`${field} 不是有效 JSON`);
  }
}
function readSize(value: unknown): CanvasSize {
  const data = record(value, "模型画布");
  const width = finite(data.width, "模型宽度");
  const height = finite(data.height, "模型高度");
  if (width <= 0 || height <= 0) invalid("模型画布尺寸必须为正");
  return Object.freeze({ width, height });
}
function readFrame(value: unknown): GeographicFrame {
  const data = record(value, "地理坐标");
  const coordinateKeys = ["lonW", "lonE", "lonT", "latN", "latS", "latT"];
  if (Object.keys(data).some(key => !coordinateKeys.includes(key))) invalid("坐标含有会触发原生重算的额外字段");
  const lonW = finite(data.lonW, "lonW");
  const lonE = finite(data.lonE, "lonE");
  const lonT = finite(data.lonT, "lonT");
  const latN = finite(data.latN, "latN");
  const latS = finite(data.latS, "latS");
  const latT = finite(data.latT, "latT");
  if (Math.abs(lonE) > 180 || Math.abs(latS) > 90 || lonT <= 0 || lonT > 360 || latT <= 0 || latT > 180) {
    invalid("原生坐标超出当前地图格式可保留的范围");
  }
  const frame = { west: lonW, east: lonW + lonT, north: latN, south: latN - latT };
  validateGeographicFrame(frame);
  // Only redundant endpoints tolerate arithmetic noise; the observed frame is never rounded.
  const equalEndpoint = (actual: number, stored: number, a: number, b: number) =>
    Math.abs(actual - stored) <=
    Number.EPSILON * 8 * Math.max(1, Math.abs(actual), Math.abs(stored), Math.abs(a), Math.abs(b));
  if (!equalEndpoint(frame.east, lonE, lonW, lonT) || !equalEndpoint(frame.south, latS, latN, latT)) {
    invalid("地理坐标的跨度与端点相互矛盾");
  }
  return Object.freeze(frame);
}
function readObjects(source: AtlasModelSource): AtlasMapSnapshot["objects"] {
  const objects: AtlasMapSnapshot["objects"][number][] = [];
  const collect = (value: unknown, kind: AtlasObjectKind) => {
    if (!Array.isArray(value)) invalid(`${kind} 缺少模型集合`);
    value.forEach((entry: unknown, index) => {
      if (kind === "burg" && index === 0 && entry === 0) return;
      const data = record(entry, kind);
      if (kind === "burg" && (data.i === 0 || data.removed)) return;
      const objectId = finite(data.i, `${kind}.i`);
      if (!Number.isSafeInteger(objectId) || objectId < (kind === "burg" ? 1 : 0)) invalid(`${kind} 的自身编号无效`);
      if (kind === "burg" && objectId !== index) invalid("聚落编号与原生索引集合不一致");
      const x = finite(data.x, `${kind}.x`);
      const y = finite(data.y, `${kind}.y`);
      objects.push(Object.freeze({ kind, objectId, position: Object.freeze({ x, y }) }));
    });
  };
  collect(source.burgs, "burg");
  collect(source.markers, "marker");
  collect(source.addedLabels, "addedLabel");
  return Object.freeze(objects);
}

/** Digests the original, possibly compressed bytes, never normalized or decoded text. */
export async function sha256MapBytes(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
}

/** FMG's native longitude/latitude formulas identify the projection; no expected manifest is read here. */
export function observeAtlasModel(source: AtlasModelSource, sha256: string): AtlasMapSnapshot {
  if (!/^[0-9a-f]{64}$/i.test(sha256)) invalid("原始文件摘要无效");
  return Object.freeze({
    sha256: sha256.toLowerCase(),
    projection: "equirectangular",
    frame: readFrame(source.coordinates),
    size: readSize(source.graph),
    objects: readObjects(source)
  });
}

function svgNumber(value: string | null): number {
  if (value === null || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) {
    invalid("SVG 画布尺寸必须是无单位的有限数字");
  }
  return finite(Number(value), "SVG 画布尺寸");
}

export function observeAtlasFile(data: readonly string[], sha256: string, scene: SVGSVGElement): AtlasMapSnapshot {
  const header = data[0]?.split("|") ?? [];
  if (header[0] !== "1.154.0") invalid("图集专用核验仅支持 1.154.0 格式；请先普通载入并另存，再重新核验关联");
  const settings = record(json(data[1], "地图设置"), "地图设置");
  const geography = record(settings.geography, "地理设置");
  const snapshot = observeAtlasModel(
    {
      graph: settings.graph,
      coordinates: geography.coordinates,
      burgs: json(data[15], "聚落"),
      markers: json(data[35], "标记"),
      addedLabels: json(data[47], "自由标签")
    },
    sha256
  );
  const { width, height } = snapshot.size;
  if (Number(header[4]) !== width || Number(header[5]) !== height) invalid("文件头与模型画布尺寸不一致");
  if (svgNumber(scene.getAttribute("width")) !== width || svgNumber(scene.getAttribute("height")) !== height) {
    invalid("SVG 与模型画布尺寸不一致");
  }
  if (scene.hasAttribute("viewBox")) invalid("图集仅接受不含根 viewBox 的原生画布，避免采用后的双重缩放");
  if (scene.getAttribute("transform")?.trim() || scene.querySelector("#viewbox")?.getAttribute("transform")?.trim()) {
    invalid("保存的原生画布带有未归一的变换");
  }
  return snapshot;
}

export function assertAtlasSnapshot(
  manifest: AtlasManifest,
  mapId: string,
  snapshot: AtlasMapSnapshot,
  phase: "file" | "model"
): void {
  const issues = verifyMapSnapshot(manifest, mapId, snapshot);
  if (issues.length) {
    const summary = issues
      .slice(0, 8)
      .map(issue => `${issue.code}: ${issue.message}`)
      .join("；");
    throw new Error(`图集${phase === "file" ? "采用前" : "采用后"}核验不符（${issues.length} 项）：${summary}`);
  }
}
