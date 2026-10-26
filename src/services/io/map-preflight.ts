type JsonRecord = Record<string, unknown>;

function invalid(section: string): never {
  throw new Error(`地图采用前预检未通过：${section}`);
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function olderThan(version: string, minor: number): boolean {
  const [major, savedMinor] = version.split(".").map(Number);
  return major < 1 || (major === 1 && savedMinor < minor);
}

function readJson(data: readonly string[], index: number): unknown {
  if (!data[index]) invalid(`缺少记录 ${index}`);
  try {
    return JSON.parse(data[index]);
  } catch {
    return invalid(`记录 ${index} 不是有效 JSON`);
  }
}

function readArray(data: readonly string[], index: number): unknown[] {
  const value = readJson(data, index);
  if (!Array.isArray(value)) invalid(`记录 ${index} 应为数组`);
  return value;
}

function entityRecords(value: unknown[], section: string, sentinels: "none" | "zero-head" | "holes" = "none"): void {
  const allowed = (entry: unknown, index: number) =>
    isRecord(entry) ||
    (sentinels === "zero-head" && index === 0 && entry === 0) ||
    (sentinels === "holes" && (entry == null || entry === 0));
  if (!value.every(allowed)) invalid(section);
}

function finitePoint(value: unknown): boolean {
  return Array.isArray(value) && value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1]);
}

function pointList(value: unknown, section: string): asserts value is unknown[] {
  if (!Array.isArray(value) || !value.every(finitePoint)) invalid(section);
}

/** Counts without allocating a second large split/map array. Historical integer overflow is preserved. */
function vectorLength(
  data: readonly string[],
  index: number,
  expected?: number,
  visit?: (value: number, cell: number) => void
): number {
  const source = data[index];
  if (!source) invalid(`缺少数值向量 ${index}`);
  let count = 0;
  let start = 0;
  for (let end = 0; end <= source.length; end++) {
    if (end !== source.length && source.charCodeAt(end) !== 44) continue;
    const token = source.slice(start, end).trim();
    const value = Number(token);
    if (!token || !Number.isFinite(value)) invalid(`向量 ${index} 含空值或非有限数值`);
    visit?.(value, count);
    count++;
    start = end + 1;
  }
  if (expected !== undefined && count !== expected) invalid(`向量 ${index} 长度不一致`);
  return count;
}

/**
 * Checks known consumed structure before replacement, without world construction, migration or mutations.
 * Consistent packed vectors do not prove their size matches a later geometric rebuild.
 * Settings/styles keep their existing per-section repair; entity references keep their existing migration.
 */
export function preflightMapData(data: readonly string[], mapVersion: string): void {
  if (!olderThan(mapVersion, 152) || data[1]?.trimStart().startsWith("{")) {
    if (!isRecord(readJson(data, 1))) invalid("地图设置应为对象");
  }

  const grid = readJson(data, 6);
  if (!isRecord(grid)) invalid("基础格网应为对象");
  if (typeof grid.spacing !== "number" || !Number.isFinite(grid.spacing) || grid.spacing <= 0) {
    invalid("基础格网间距无效");
  }
  for (const key of ["cellsX", "cellsY"] as const) {
    const count = grid[key];
    if (typeof count !== "number" || !Number.isSafeInteger(count) || count <= 0) invalid("基础格网行列无效");
  }
  if (!Array.isArray(grid.features)) invalid("基础格网缺少地形特征列表");
  const features: unknown[] = grid.features;
  entityRecords(features, "基础格网地形特征条目无效", "holes");
  pointList(grid.points, "基础格网点坐标无效");
  pointList(grid.boundary, "基础格网边界坐标无效");
  if (!grid.points.length) invalid("基础格网为空");
  const missingFeatures = new Set<number>();
  for (let index = 7; index <= 11; index++) {
    const visit =
      index === 9
        ? (value: number, cell: number) => {
            if (!isRecord(features[value & 65535])) missingFeatures.add(cell);
          }
        : index === 10
          ? (value: number, cell: number) => {
              // Match the Uint16/Int8 conversion and short circuit actually used by Pack.generate.
              if ((value << 24) >> 24 === -2 && cell % 4 !== 0 && missingFeatures.has(cell))
                invalid("基础格网引用缺失的地形特征");
            }
          : undefined;
    vectorLength(data, index, grid.points.length, visit);
  }

  for (const index of [12, 13, 14, 15]) {
    const entries = readArray(data, index);
    entityRecords(entries, `记录 ${index} 含无效实体条目`, index === 12 ? "holes" : "zero-head");
    if (index === 12)
      for (const feature of entries) {
        if (isRecord(feature) && feature.vertices != null && !Array.isArray(feature.vertices))
          invalid("地形特征顶点列表无效");
      }
  }
  const packedCount = vectorLength(data, 25);
  for (const index of [16, 17, 18, 19, 20, 21, 22, 24]) vectorLength(data, index, packedCount);
  for (const index of [26, 27, 40, 44]) if (data[index]) vectorLength(data, index, packedCount);

  if (data[3]?.startsWith("[")) {
    for (const biome of readArray(data, 3)) if (!isRecord(biome)) invalid("生物群系条目应为对象");
  }
  for (const index of [29, 30, 32, 35, 38, 39, 41, 42, 43, 46, 49]) {
    if (!data[index]) continue;
    const entries = readArray(data, index);
    entityRecords(
      entries,
      `记录 ${index} 含无效实体条目`,
      index === 30 ? "zero-head" : index === 42 ? "holes" : "none"
    );
    for (const entry of entries) {
      if (!isRecord(entry)) continue;
      if (index === 38 && !Array.isArray(entry.cells)) invalid("区域缺少单元格列表");
      if (index === 39) pointList(entry.points, "冰层点坐标无效");
      if (index === 46) {
        if (!["Ruler", "Opisometer", "RouteOpisometer", "Planimeter"].includes(String(entry.type)))
          invalid("测量工具类型无效");
        pointList(entry.points, "测量工具点坐标无效");
        if (entry.type !== "Planimeter" && !entry.points.length) invalid("测量工具点列表为空");
      }
    }
  }
  if (data[36]) {
    const routes = readJson(data, 36);
    if (typeof routes !== "object" || routes === null) invalid("路线邻接应为对象或数组");
  }
  if (data[34]) {
    for (const font of readArray(data, 34)) {
      if (!isRecord(font) || typeof font.family !== "string") invalid("字体条目无效");
    }
  }
  if (data[37]) {
    if (olderThan(mapVersion, 99))
      readJson(data, 37); // old routes are rebuilt from the scene
    else {
      for (const route of readArray(data, 37)) {
        if (!isRecord(route)) invalid("路线条目应为对象");
        pointList(route.points, "路线点坐标无效"); // empty/short routes are repaired after adoption
      }
    }
  }
  if (data[47]) {
    for (const label of readArray(data, 47)) {
      if (!isRecord(label) || !isRecord(label.label)) invalid("自由标签缺少样式对象");
    }
  }
  if (data[50] && !olderThan(mapVersion, 144)) {
    const layers = readJson(data, 50);
    if (!isRecord(layers)) invalid("图层状态应为对象");
    for (const key of ["order", "active"]) {
      const ids = layers[key];
      if (!Array.isArray(ids) || !ids.every(id => typeof id === "string")) invalid("图层标识列表无效");
    }
  }
  if (data[51]) {
    const overrides = readJson(data, 51);
    if (!isRecord(overrides)) invalid("图形修订应为对象");
    const pack = overrides.pack;
    const vertices = isRecord(pack) ? pack.vertices : undefined;
    const points = isRecord(vertices) ? vertices.p : undefined;
    if (typeof points === "object" && points !== null) {
      for (const move of Object.values(points)) {
        if (!Array.isArray(move) || !finitePoint(move[0]) || !finitePoint(move[1])) invalid("图形顶点修订无效");
      }
    }
  }
  if (data[52]) {
    for (const journey of readArray(data, 52)) {
      if (!isRecord(journey) || !Array.isArray(journey.segments)) invalid("旅程缺少路段列表");
      for (const segment of journey.segments) {
        if (!isRecord(segment)) invalid("旅程路段应为对象");
        pointList(segment.points, "旅程路段点坐标无效");
      }
    }
  }
  if (data[31]) {
    for (const names of data[31].split("/")) {
      if (names.split("|").length < 6) invalid("命名库记录不完整");
    }
  }
}

/** HTML semantics match the old insertion path; only a detached core scene is checked, not sanitized. */
export function prepareDetachedMapSvg(source: string): SVGSVGElement {
  const template = document.createElement("template");
  template.innerHTML = source;
  const fragment = template.content;
  const root = fragment.firstElementChild;
  const namespace = "http://www.w3.org/2000/svg";
  if (
    fragment.children.length !== 1 ||
    !root ||
    root.localName !== "svg" ||
    root.namespaceURI !== namespace ||
    root.id !== "map"
  ) {
    invalid("缺少唯一的 SVG 地图根节点");
  }
  for (const node of fragment.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) invalid("地图根节点外含额外文本");
  }
  // Moving a prepared template must not activate scripts that the former HTML insertion kept inert.
  if (root.querySelector("script")) invalid("地图 SVG 不支持脚本节点");
  const viewboxes = root.querySelectorAll('[id="viewbox"]');
  const viewbox = viewboxes[0];
  if (
    root.querySelector('[id="map"]') ||
    viewboxes.length !== 1 ||
    viewbox.localName !== "g" ||
    viewbox.namespaceURI !== namespace
  ) {
    invalid("缺少唯一的地图视野节点");
  }
  return root as SVGSVGElement;
}
