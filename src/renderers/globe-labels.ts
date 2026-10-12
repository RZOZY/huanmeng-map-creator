/**
 * 地球仪上的地名标签。
 *
 * 平面图的标签是「按当前视野虚拟化」绘制的（只画屏幕内那几条），所以没法从 DOM 里抄；
 * 这里改用底层数据 getLabelsData()，每条的锚点投到球面，字色/字体/字号取自它所属的标签分组
 * （分组元素 #labels-<group> 上就挂着样式），再由渲染器做成贴在球面上的贴片。
 */
import { getLabelsData } from "@/renderers/labels/label-data";
import type { Point } from "@/types/global";

/** 标签类型的重要性：国名最大，往下依次是省、城、河、路、村 */
const PRIORITY: Record<string, number> = { state: 0, province: 1, burg: 2, river: 3, route: 4, hamlet: 5 };
const MAX_LABELS = 150;

export type GlobeLabelData = {
  group: string;
  text: string;
  /** 曲线标签：文字沿这条地图像素路径排（与平面图的 pathPoints 同源） */
  pathPoints?: Point[];
  /** 曲线标签的起点百分比，与平面图的 startOffset 一致（默认 50 = 居中） */
  startOffset?: number;
  /** 避让用的宽度提示：曲线标签按路径长度算，而不是按字数估 */
  boxWidth?: number;
  mapX: number;
  mapY: number;
  fontPx: number; // 地图像素
  color: string;
  opacity: number;
  fontFamily: string;
};

/** 粗略估一条标签在地图上占的宽度：CJK 按一个字宽，拉丁按 0.55 字宽 */
/** 一个字的宽度（以字号的倍数计）：CJK 占一格，拉丁约半格 */
export function charUnits(char: string): number {
  return /[\u2e80-\u9fff\uff00-\uffef]/.test(char) ? 1 : 0.55;
}

export function estimateLabelWidth(text: string, fontPx: number): number {
  let units = 0;
  for (const char of text) units += charUnits(char);
  return units * fontPx;
}

export type GlyphPlacement = { char: string; x: number; y: number; angle: number };

/**
 * 把一行字沿折线铺开，返回每个字的位置与切线角度（地图空间）。
 * 与平面图的 <textPath startOffset="N%" text-anchor="middle"> 对齐：整行以 N% 处为中心。
 * 纯函数：宽度由调用方给（渲染器传画布实测值，单测传估算值）。
 */
export function placeTextAlongPath(
  points: Point[],
  text: string,
  widthOf: (char: string) => number,
  startOffset = 50
): GlyphPlacement[] {
  if (points.length < 2) return [];

  const cumulative: number[] = [0];
  for (let index = 1; index < points.length; index++) {
    const [x0, y0] = points[index - 1];
    const [x1, y1] = points[index];
    cumulative.push(cumulative[index - 1] + Math.hypot(x1 - x0, y1 - y0));
  }
  const total = cumulative[cumulative.length - 1];
  if (total <= 0) return [];

  const at = (distance: number): { point: Point; angle: number } => {
    const clamped = Math.max(0, Math.min(total, distance));
    let index = 1;
    while (index < cumulative.length - 1 && cumulative[index] < clamped) index++;
    const span = cumulative[index] - cumulative[index - 1] || 1;
    const ratio = (clamped - cumulative[index - 1]) / span;
    const [x0, y0] = points[index - 1];
    const [x1, y1] = points[index];
    return {
      point: [x0 + (x1 - x0) * ratio, y0 + (y1 - y0) * ratio],
      angle: Math.atan2(y1 - y0, x1 - x0)
    };
  };

  const chars = [...text];
  const widths = chars.map(char => widthOf(char));
  const textWidth = widths.reduce((sum, value) => sum + value, 0);

  // text-anchor: middle —— 整行以 startOffset% 处为中心
  let cursor = (startOffset / 100) * total - textWidth / 2;
  const placements: GlyphPlacement[] = [];
  for (let index = 0; index < chars.length; index++) {
    const center = cursor + widths[index] / 2;
    const { point, angle } = at(center);
    placements.push({ char: chars[index], x: point[0], y: point[1], angle });
    cursor += widths[index];
  }
  return placements;
}

const DEFAULT_FONT = "Almendra SC";
const DEFAULT_COLOR = "#3e3e4b";

type GroupStyle = { color: string; opacity: number; fontFamily: string; percent: number };

/**
 * 球面一次看全世界，标签必然互相压：先按重要性（国>省>城>河>路>村）、再按字号排序，
 * 然后做一遍贪心的矩形避让 —— 与已选中的标签相交的就丢掉。
 * 判定在地图空间做：球面与地图是同一套坐标，重叠关系一致。纯函数，便于单测。
 */
export function selectNonOverlappingLabels(
  labels: GlobeLabelData[],
  limit = MAX_LABELS
): GlobeLabelData[] {
  const priorityOf = (group: string) => PRIORITY[group] ?? 6;
  const sorted = [...labels].sort(
    (a, b) => priorityOf(a.group) - priorityOf(b.group) || b.fontPx - a.fontPx
  );

  const accepted: { left: number; right: number; top: number; bottom: number }[] = [];
  const kept: GlobeLabelData[] = [];
  for (const label of sorted) {
    const halfWidth = (label.boxWidth ?? estimateLabelWidth(label.text, label.fontPx)) / 2;
    const halfHeight = (label.fontPx * 1.25) / 2;
    const pad = label.fontPx * 0.2; // 留一点气口，别让字贴着字
    const box = {
      left: label.mapX - halfWidth - pad,
      right: label.mapX + halfWidth + pad,
      top: label.mapY - halfHeight - pad,
      bottom: label.mapY + halfHeight + pad
    };
    if (
      accepted.some(
        other => box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top
      )
    )
      continue;
    accepted.push(box);
    kept.push(label);
    if (kept.length >= limit) break;
  }
  return kept;
}

/** 整球视距下字号低于这个值（地图像素）的名字在球面上读不清，只留大名字（与平面图的 zoom bounds 一个道理） */
export const FAR_MIN_LABEL_FONT = 20;

export function buildGlobeLabelData(minFontPx = 0): GlobeLabelData[] {
  const mapHeight = options.map.graph.height;
  const styles = new Map<string, GroupStyle>();

  const styleOf = (group: string): GroupStyle => {
    const cached = styles.get(group);
    if (cached) return cached;
    const element = document.getElementById(`labels-${group}`);
    const style: GroupStyle = {
      color: element?.getAttribute("fill") ?? DEFAULT_COLOR,
      opacity: Number.parseFloat(element?.getAttribute("opacity") ?? "1"),
      fontFamily: element?.getAttribute("font-family") ?? DEFAULT_FONT,
      percent: Number.parseFloat(element?.getAttribute("font-size") ?? "1.5")
    };
    styles.set(group, style);
    return style;
  };

  const result: GlobeLabelData[] = [];
  for (const label of getLabelsData()) {
    if (label.hidden || !label.text?.trim()) continue;
    const style = styleOf(label.group);

    // 字号在地图里是「占视野高度的百分比」，换算成地图像素
    const percent = typeof label.fontSize === "number" && label.fontSize > 0 ? label.fontSize : style.percent;
    const fontPx = Math.min(60, Math.max(4, (percent / 100) * mapHeight));

    // 曲线标签：避让按路径长度算，锚点取路径中点（与平面图的文字排布一致）
    const pathPoints = label.pathPoints?.length ? label.pathPoints : undefined;
    const pathLength = pathPoints
      ? pathPoints.reduce(
          (sum, point, index) => (index ? sum + Math.hypot(point[0] - pathPoints[index - 1][0], point[1] - pathPoints[index - 1][1]) : 0),
          0
        )
      : 0;
    const straightWidth = estimateLabelWidth(label.text, fontPx);
    const pathMid = pathPoints ? pathPoints[Math.floor(pathPoints.length / 2)] : undefined;

    if (fontPx < minFontPx) continue; // 太小了，球面上只是一片糊

    result.push({
      group: label.group,
      text: label.text,
      pathPoints,
      startOffset: label.startOffset,
      boxWidth: pathPoints ? Math.max(straightWidth, Math.min(pathLength, straightWidth * 2.5)) : undefined,
      mapX: (pathMid ? pathMid[0] : label.anchor[0]) + (label.dx ?? 0),
      mapY: (pathMid ? pathMid[1] : label.anchor[1]) + (label.dy ?? 0),
      fontPx,
      color: style.color,
      opacity: Number.isFinite(style.opacity) ? style.opacity : 1,
      fontFamily: style.fontFamily
    });
  }
  return selectNonOverlappingLabels(result);
}
