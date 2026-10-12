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

const DEFAULT_FONT = "Almendra SC";
const DEFAULT_COLOR = "#3e3e4b";

type GroupStyle = { color: string; opacity: number; fontFamily: string; percent: number };

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
  // 球面一次看全世界，全画会糊成一片：先按重要性、再按字号取前若干条
  const priorityOf = (group: string) => PRIORITY[group] ?? 6;
  result.sort((a, b) => priorityOf(a.group) - priorityOf(b.group) || b.fontPx - a.fontPx);
  return result.slice(0, MAX_LABELS);
}
