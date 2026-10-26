import {
  type CanvasSize,
  containsCoordinate,
  type GeographicFrame,
  type GeographicPoint,
  geographicToPixel,
  type PixelPoint,
  validateGeographicFrame
} from "./coordinates";

export type AtlasObjectKind = "burg" | "marker" | "addedLabel";

export interface AtlasMap {
  readonly id: string;
  readonly name: string;
  readonly kind: "world" | "local";
  readonly asset: { readonly path: string; readonly sha256: string };
  readonly projection: "equirectangular";
  readonly provenance: string;
  readonly frame: GeographicFrame;
  readonly size: CanvasSize;
  readonly geographicRevision: number;
  readonly detailLevel: number;
  readonly parent: { readonly mapId: string; readonly geographicRevision: number } | null;
  readonly georeference: { readonly verified: boolean; readonly evidence: string };
}

export interface AtlasBinding {
  readonly mapId: string;
  readonly kind: AtlasObjectKind;
  readonly objectId: number;
  readonly geographicRevision: number;
}

export interface AtlasPlace {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly coordinate: GeographicPoint;
  readonly provenance: string;
  readonly revision: number;
  readonly bindings: readonly AtlasBinding[];
}

export interface AtlasManifest {
  readonly schemaVersion: 1;
  readonly project: { readonly id: string; readonly name: string };
  readonly worldMapId: string;
  readonly maps: readonly AtlasMap[];
  readonly places: readonly AtlasPlace[];
}

export type AtlasManifestErrorCode =
  | "INVALID_JSON"
  | "UNSUPPORTED_VERSION"
  | "INVALID_FIELD"
  | "INVALID_ASSET_PATH"
  | "DUPLICATE_ID"
  | "DUPLICATE_ASSET"
  | "INVALID_REFERENCE"
  | "STALE_REFERENCE"
  | "FRAME_OUTSIDE_PARENT"
  | "DUPLICATE_BINDING"
  | "BINDING_OUTSIDE_MAP";

export class AtlasManifestError extends Error {
  constructor(
    readonly code: AtlasManifestErrorCode,
    readonly path: string,
    message: string
  ) {
    super(`${path}: ${message}`);
    this.name = "AtlasManifestError";
  }
}

export interface AtlasMapIssue {
  readonly code:
    | "MISSING_OBSERVATION"
    | "INVALID_SNAPSHOT"
    | "UNVERIFIED_GEOGRAPHY"
    | "ASSET_CHANGED"
    | "PROJECTION_MISMATCH"
    | "FRAME_MISMATCH"
    | "SIZE_MISMATCH"
    | "INVALID_OBJECT"
    | "DUPLICATE_OBJECT"
    | "MISSING_OBJECT"
    | "POSITION_MISMATCH";
  readonly path: string;
  readonly message: string;
}

const MAX_JSON_LENGTH = 4_000_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const OBJECT_KINDS = ["burg", "marker", "addedLabel"] as const;

/** External sidecar only: no globals, file access, terrain edits or .map format changes. */
export function parseAtlasManifest(json: string): AtlasManifest {
  if (typeof json !== "string" || json.length > MAX_JSON_LENGTH) {
    fail("INVALID_JSON", "$", "关联清单必须是长度不超过 400 万字符的 JSON 文本");
  }
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    fail("INVALID_JSON", "$", "关联清单不是有效的 JSON");
  }
  const manifest = readManifest(data);
  encodeManifest(manifest);
  return manifest;
}

export function serializeAtlasManifest(manifest: AtlasManifest): string {
  return encodeManifest(readManifest(manifest));
}

/** Candidate selection is not a load operation. Unverified geographic claims are never auto-selected. */
export function selectLocalMap(manifest: AtlasManifest, point: GeographicPoint): AtlasMap | null {
  const world = findMap(manifest, manifest.worldMapId);
  if (!containsCoordinate(point, world.frame) || !world.georeference.verified) return null;
  const candidates = manifest.maps.filter(
    map => map.kind === "local" && map.georeference.verified && containsCoordinate(point, map.frame)
  );
  candidates.sort((a, b) => {
    if (a.detailLevel !== b.detailLevel) return b.detailLevel - a.detailLevel;
    const areaDifference = logSphericalCoverage(a.frame) - logSphericalCoverage(b.frame);
    return areaDifference || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
  return candidates[0] ?? null;
}

/** Checks separately observed file/model data; a matching declaration does not prove real-world terrain alignment. */
export function verifyMapSnapshot(
  manifest: AtlasManifest,
  mapId: string,
  observation: unknown
): readonly AtlasMapIssue[] {
  const expected = findMap(manifest, mapId);
  const issues: AtlasMapIssue[] = [];
  const issue = (code: AtlasMapIssue["code"], path: string, message: string) => issues.push({ code, path, message });
  if (!expected.georeference.verified) {
    issue("UNVERIFIED_GEOGRAPHY", "georeference", "此图地理基准尚未核验，不允许自动对齐");
  }
  if (observation === null || observation === undefined) {
    issue("MISSING_OBSERVATION", "$", "缺少从实际文件和活模型取得的观测快照");
    return freeze(issues);
  }
  let data: Record<string, unknown>;
  try {
    data = record(observation, ["sha256", "projection", "frame", "size", "objects"], "$snapshot");
    if (hash(data.sha256, "$snapshot.sha256") !== expected.asset.sha256) {
      issue("ASSET_CHANGED", "sha256", "地图文件摘要已变化，需要重新核验关联");
    }
    if (text(data.projection, "$snapshot.projection") !== expected.projection) {
      issue("PROJECTION_MISMATCH", "projection", "实际投影与清单不一致");
    }
    const frame = readFrame(data.frame, "$snapshot.frame");
    if (
      Object.keys(expected.frame).some(
        key => frame[key as keyof GeographicFrame] !== expected.frame[key as keyof GeographicFrame]
      )
    ) {
      issue("FRAME_MISMATCH", "frame", "实际地理范围与清单不一致，未进行吸附或重定位");
    }
    const size = readSize(data.size, "$snapshot.size");
    if (size.width !== expected.size.width || size.height !== expected.size.height) {
      issue("SIZE_MISMATCH", "size", "实际模型画布尺寸与清单不一致");
    }
    list(data.objects, "$snapshot.objects", 200_000);
  } catch (error) {
    if (!(error instanceof AtlasManifestError)) throw error;
    issue("INVALID_SNAPSHOT", error.path, error.message);
    return freeze(issues);
  }
  if (issues.length) return freeze(issues);

  const positions = new Map<string, PixelPoint>();
  const ambiguous = new Set<string>();
  const objects = data.objects as unknown[];
  objects.forEach((value, index) => {
    const path = `$snapshot.objects[${index}]`;
    try {
      const object = record(value, ["kind", "objectId", "position"], path);
      const kind = oneOf(object.kind, OBJECT_KINDS, `${path}.kind`);
      const objectId = readObjectId(object.objectId, kind, `${path}.objectId`);
      const position = record(object.position, ["x", "y"], `${path}.position`);
      const pixel = { x: finite(position.x, `${path}.position.x`), y: finite(position.y, `${path}.position.y`) };
      if (pixel.x < 0 || pixel.y < 0 || pixel.x > expected.size.width || pixel.y > expected.size.height) {
        fail("INVALID_FIELD", path, "对象锚点不在模型画布内");
      }
      const key = `${kind}:${objectId}`;
      if (positions.has(key)) {
        ambiguous.add(key);
        issue("DUPLICATE_OBJECT", path, "实际快照包含同类同号的多个对象");
      } else positions.set(key, pixel);
    } catch (error) {
      if (!(error instanceof AtlasManifestError)) throw error;
      issue("INVALID_OBJECT", path, error.message);
    }
  });
  for (const place of manifest.places) {
    for (const binding of place.bindings) {
      if (binding.mapId !== expected.id) continue;
      const key = `${binding.kind}:${binding.objectId}`;
      const path = `places[${place.id}].bindings[${expected.id}/${key}]`;
      if (ambiguous.has(key)) continue;
      const actual = positions.get(key);
      if (!actual) {
        issue("MISSING_OBJECT", path, "绑定对象不存在；不能按名称或数组位置猜测替代");
        continue;
      }
      const pixel = geographicToPixel(place.coordinate, expected.frame, expected.size);
      // One millionth of a pixel covers arithmetic noise, not map resolution or positional uncertainty.
      if (Math.hypot(pixel.x - actual.x, pixel.y - actual.y) > 1e-6) {
        issue("POSITION_MISMATCH", path, "对象锚点偏离权威坐标；未修改对象、地形或权威记录");
      }
    }
  }
  return freeze(issues);
}

function encodeManifest(manifest: AtlasManifest): string {
  const json = JSON.stringify(manifest, null, 2);
  if (json.length > MAX_JSON_LENGTH) {
    fail("INVALID_JSON", "$", "规范化后的关联清单过大，无法按当前容量限制读写");
  }
  return json;
}

function readManifest(input: unknown): AtlasManifest {
  const data = record(input, ["schemaVersion", "project", "worldMapId", "maps", "places"], "$");
  if (data.schemaVersion !== 1) fail("UNSUPPORTED_VERSION", "$.schemaVersion", "不支持此关联清单版本");
  const project = record(data.project, ["id", "name"], "$.project");
  const manifest: AtlasManifest = {
    schemaVersion: 1,
    project: { id: uuid(project.id, "$.project.id"), name: text(project.name, "$.project.name", 512) },
    worldMapId: uuid(data.worldMapId, "$.worldMapId"),
    maps: list(data.maps, "$.maps", 512).map((map, index) => readMap(map, `$.maps[${index}]`)),
    places: list(data.places, "$.places", 100_000).map((place, index) => readPlace(place, `$.places[${index}]`))
  };
  validateReferences(manifest);
  return freeze(manifest);
}

function readMap(input: unknown, path: string): AtlasMap {
  const data = record(
    input,
    [
      "id",
      "name",
      "kind",
      "asset",
      "projection",
      "provenance",
      "frame",
      "size",
      "geographicRevision",
      "detailLevel",
      "parent",
      "georeference"
    ],
    path
  );
  const kind = oneOf(data.kind, ["world", "local"] as const, `${path}.kind`);
  const asset = record(data.asset, ["path", "sha256"], `${path}.asset`);
  const reference = record(data.georeference, ["verified", "evidence"], `${path}.georeference`);
  if (typeof reference.verified !== "boolean")
    fail("INVALID_FIELD", `${path}.georeference.verified`, "必须明确是否核验过地理基准");
  const evidence = text(reference.evidence, `${path}.georeference.evidence`, 4096, reference.verified);
  let parent: AtlasMap["parent"] = null;
  if (data.parent !== null) {
    const value = record(data.parent, ["mapId", "geographicRevision"], `${path}.parent`);
    parent = {
      mapId: uuid(value.mapId, `${path}.parent.mapId`),
      geographicRevision: integer(value.geographicRevision, `${path}.parent.geographicRevision`)
    };
  }
  const detailLevel = integer(data.detailLevel, `${path}.detailLevel`);
  if (
    (kind === "world" && (detailLevel !== 0 || parent !== null)) ||
    (kind === "local" && (detailLevel === 0 || !parent))
  ) {
    fail("INVALID_FIELD", path, "世界图必须为零级且无父图，局部图必须有父图且细节级别大于零");
  }
  return {
    id: uuid(data.id, `${path}.id`),
    name: text(data.name, `${path}.name`, 512),
    kind,
    asset: { path: assetPath(asset.path, `${path}.asset.path`), sha256: hash(asset.sha256, `${path}.asset.sha256`) },
    projection: oneOf(data.projection, ["equirectangular"] as const, `${path}.projection`),
    provenance: text(data.provenance, `${path}.provenance`, 4096),
    frame: readFrame(data.frame, `${path}.frame`),
    size: readSize(data.size, `${path}.size`),
    geographicRevision: integer(data.geographicRevision, `${path}.geographicRevision`),
    detailLevel,
    parent,
    georeference: { verified: reference.verified, evidence }
  };
}

function readPlace(input: unknown, path: string): AtlasPlace {
  const data = record(input, ["id", "name", "kind", "coordinate", "provenance", "revision", "bindings"], path);
  const point = record(data.coordinate, ["longitude", "latitude"], `${path}.coordinate`);
  const coordinate = {
    longitude: finite(point.longitude, `${path}.coordinate.longitude`),
    latitude: finite(point.latitude, `${path}.coordinate.latitude`)
  };
  if (coordinate.latitude < -90 || coordinate.latitude > 90) {
    fail("INVALID_FIELD", `${path}.coordinate`, "地点纬度超出地理范围");
  }
  return {
    id: uuid(data.id, `${path}.id`),
    name: text(data.name, `${path}.name`, 512),
    kind: text(data.kind, `${path}.kind`, 128),
    coordinate,
    provenance: text(data.provenance, `${path}.provenance`, 4096),
    revision: integer(data.revision, `${path}.revision`),
    bindings: list(data.bindings, `${path}.bindings`, 2048).map((input, index) => {
      const bindingPath = `${path}.bindings[${index}]`;
      const binding = record(input, ["mapId", "kind", "objectId", "geographicRevision"], bindingPath);
      const kind = oneOf(binding.kind, OBJECT_KINDS, `${bindingPath}.kind`);
      return {
        mapId: uuid(binding.mapId, `${bindingPath}.mapId`),
        kind,
        objectId: readObjectId(binding.objectId, kind, `${bindingPath}.objectId`),
        geographicRevision: integer(binding.geographicRevision, `${bindingPath}.geographicRevision`)
      };
    })
  };
}

function validateReferences(manifest: AtlasManifest): void {
  const ids = new Set([manifest.project.id]);
  const assets = new Set<string>();
  const maps = new Map<string, AtlasMap>();
  const uniqueId = (id: string, path: string) => {
    if (ids.has(id)) fail("DUPLICATE_ID", path, "项目、地图或地点的稳定身份重复");
    ids.add(id);
  };
  for (const [index, map] of manifest.maps.entries()) {
    uniqueId(map.id, `$.maps[${index}].id`);
    const path = map.asset.path.toLowerCase();
    if (assets.has(path)) fail("DUPLICATE_ASSET", `$.maps[${index}].asset.path`, "多个地图身份引用同一资产路径");
    assets.add(path);
    maps.set(map.id, map);
  }
  const world = maps.get(manifest.worldMapId);
  if (world?.kind !== "world" || manifest.maps.filter(map => map.kind === "world").length !== 1) {
    fail("INVALID_REFERENCE", "$.worldMapId", "必须且只能指定一张世界根图");
  }
  for (const [index, map] of manifest.maps.entries()) {
    if (map.kind === "world") continue;
    const path = `$.maps[${index}]`;
    if (!map.parent || map.parent.mapId !== world.id)
      fail("INVALID_REFERENCE", `${path}.parent`, "局部图必须关联本项目世界根图");
    if (map.parent.geographicRevision !== world.geographicRevision)
      fail("STALE_REFERENCE", `${path}.parent`, "局部图采用的世界地理修订已过期");
    if (!frameContainsFrame(world.frame, map.frame))
      fail("FRAME_OUTSIDE_PARENT", `${path}.frame`, "局部图覆盖超出世界图，或穿越世界图未覆盖的经度弧");
  }
  const owners = new Set<string>();
  for (const [index, place] of manifest.places.entries()) {
    const path = `$.places[${index}]`;
    uniqueId(place.id, `${path}.id`);
    if (!containsCoordinate(place.coordinate, world.frame))
      fail("BINDING_OUTSIDE_MAP", `${path}.coordinate`, "权威地点不在世界根图范围内");
    for (const [bindingIndex, binding] of place.bindings.entries()) {
      const bindingPath = `${path}.bindings[${bindingIndex}]`;
      const map = maps.get(binding.mapId);
      if (!map) fail("INVALID_REFERENCE", bindingPath, "绑定引用不存在的地图");
      if (binding.geographicRevision !== map.geographicRevision)
        fail("STALE_REFERENCE", bindingPath, "绑定采用的地图地理修订已过期");
      if (!containsCoordinate(place.coordinate, map.frame))
        fail("BINDING_OUTSIDE_MAP", bindingPath, "绑定地图未覆盖此权威地点");
      const key = `${map.id}:${binding.kind}:${binding.objectId}`;
      if (owners.has(key)) fail("DUPLICATE_BINDING", bindingPath, "同图同类同号对象被重复绑定");
      owners.add(key);
    }
  }
}

function frameContainsFrame(parent: GeographicFrame, child: GeographicFrame): boolean {
  if (child.south < parent.south || child.north > parent.north) return false;
  if (parent.east - parent.west === 360) return true;
  const shift = child.west < parent.west ? 360 : 0;
  return child.west >= parent.west - shift && child.east <= parent.east - shift;
}

function logSphericalCoverage(frame: GeographicFrame): number {
  const latitudeSpan = frame.north - frame.south;
  const poleDistance = Math.min(90 - frame.north, 90 + frame.south) + latitudeSpan / 2;
  return (
    Math.log(frame.east - frame.west) + logSine(latitudeSpan, Math.PI / 360) + logSine(poleDistance, Math.PI / 180)
  );
}

function logSine(degrees: number, scale: number): number {
  const radians = degrees * scale;
  return radians === 0 ? Math.log(degrees) + Math.log(scale) : Math.log(Math.sin(radians));
}

function findMap(manifest: AtlasManifest, id: string): AtlasMap {
  const normalized = uuid(id, "mapId");
  const map = manifest.maps.find(map => map.id === normalized);
  if (!map) fail("INVALID_REFERENCE", "mapId", "地图身份不在此关联清单中");
  return map;
}

function record(value: unknown, keys: readonly string[], path: string): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
  ) {
    fail("INVALID_FIELD", path, "必须是普通对象");
  }
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) fail("INVALID_FIELD", `${path}.${key}`, "未知字段；未静默丢弃数据");
  }
  return value as Record<string, unknown>;
}

function list(value: unknown, path: string, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) fail("INVALID_FIELD", path, "必须是长度受限的数组");
  return value;
}

function text(value: unknown, path: string, maximum = 128, nonblank = true): string {
  if (typeof value !== "string" || value.length > maximum || (nonblank && !value.trim()))
    fail("INVALID_FIELD", path, "必须是长度受限的文本");
  return value;
}

function uuid(value: unknown, path: string): string {
  if (typeof value !== "string" || !UUID.test(value)) fail("INVALID_FIELD", path, "必须是有效的版本化 UUID");
  return value.toLowerCase();
}

function hash(value: unknown, path: string): string {
  if (typeof value !== "string" || !SHA256.test(value)) fail("INVALID_FIELD", path, "必须是完整的 SHA-256 文件摘要");
  return value.toLowerCase();
}

function finite(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    fail("INVALID_FIELD", path, "必须是有限数字，不能隐式转换文本");
  return value;
}

function integer(value: unknown, path: string): number {
  const result = finite(value, path);
  if (!Number.isSafeInteger(result) || result < 0) fail("INVALID_FIELD", path, "必须是非负安全整数");
  return result;
}

function oneOf<T extends string>(value: unknown, choices: readonly T[], path: string): T {
  const result = choices.find(choice => choice === value);
  if (result === undefined) fail("INVALID_FIELD", path, "不支持此字段取值");
  return result;
}

function readObjectId(value: unknown, kind: AtlasObjectKind, path: string): number {
  const id = integer(value, path);
  if (kind === "burg" && id === 0) fail("INVALID_FIELD", path, "城镇编号零是占位项，不是可绑定对象");
  return id;
}

function readFrame(value: unknown, path: string): GeographicFrame {
  const data = record(value, ["west", "east", "south", "north"], path);
  const frame = {
    west: finite(data.west, `${path}.west`),
    east: finite(data.east, `${path}.east`),
    south: finite(data.south, `${path}.south`),
    north: finite(data.north, `${path}.north`)
  };
  try {
    validateGeographicFrame(frame);
  } catch {
    fail("INVALID_FIELD", path, "无效地理范围；跨日界线须使用展开经度");
  }
  return frame;
}

function readSize(value: unknown, path: string): CanvasSize {
  const data = record(value, ["width", "height"], path);
  const size = { width: finite(data.width, `${path}.width`), height: finite(data.height, `${path}.height`) };
  if (size.width <= 0 || size.height <= 0) fail("INVALID_FIELD", path, "模型画布宽高必须为正数");
  return size;
}

function assetPath(value: unknown, path: string): string {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 2048 ||
    /[\\:%?#<>"|*]/.test(value) ||
    hasControlCharacters(value) ||
    !/\.map$/i.test(value)
  ) {
    fail("INVALID_ASSET_PATH", path, "资产须为目录内相对 .map 路径，不接受 URL、编码或系统特殊字符");
  }
  const segments = value.split("/");
  if (
    segments.some(
      segment =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        segment.trim() !== segment ||
        segment.endsWith(".") ||
        /^(con|prn|aux|nul|conin\$|conout\$|clock\$|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(segment)
    )
  ) {
    fail("INVALID_ASSET_PATH", path, "资产路径不能越出目录或使用保留文件名");
  }
  return value;
}

function hasControlCharacters(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function fail(code: AtlasManifestErrorCode, path: string, message: string): never {
  throw new AtlasManifestError(code, path, message);
}
