/**
 * 地球仪上的地名标签。
 *
 * 平面图的标签是「按当前视野虚拟化」绘制的（只画屏幕内那几条），所以没法从 DOM 里抄；
 * 这里改用底层数据 getLabelsData()，每条的锚点投到球面，字色/字体/字号取自它所属的标签分组
 * （分组元素 #labels-<group> 上就挂着样式），再由渲染器做成贴在球面上的贴片。
 */
import { getLabelsData } from "@/renderers/labels/label-data";

/** 标签类型的重要性：国名最大，往下依次是省、城、河、路、村 */
const PRIORITY: Record<string, number> = { state: 0, province: 1, burg: 2, river: 3, route: 4, hamlet: 5 };
const MAX_LABELS = 150;

export type GlobeLabelData = {
  group: string;
  text: string;
  mapX: number;
  mapY: number;
  fontPx: number; // 地图像素
  color: string;
  opacity: number;
  fontFamily: string;
};

/** 粗略估一条标签在地图上占的宽度：CJK 按一个字宽，拉丁按 0.55 字宽 */
export function estimateLabelWidth(text: string, fontPx: number): number {
  let units = 0;
  for (const char of text) units += /[\u2e80-\u9fff\uff00-\uffef]/.test(char) ? 1 : 0.55;
  return units * fontPx;
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
    const halfWidth = estimateLabelWidth(label.text, label.fontPx) / 2;
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

export function buildGlobeLabelData(): GlobeLabelData[] {
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

    result.push({
      group: label.group,
      text: label.text,
      mapX: label.anchor[0] + (label.dx ?? 0),
      mapY: label.anchor[1] + (label.dy ?? 0),
      fontPx,
      color: style.color,
      opacity: Number.isFinite(style.opacity) ? style.opacity : 1,
      fontFamily: style.fontFamily
    });
  }
  return selectNonOverlappingLabels(result);
}
