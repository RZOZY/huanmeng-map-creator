/**
 * 贴图叠加层的铺法：把平面图里的贴图定义换算成 three 的 repeat/offset。
 *
 * 贴图叠加几何由 globe-vector 按陆/水分好（uv 是地图空间归一化的），所以这里只需要复刻
 * 平面图的铺法；实际的纹理加载与网格由渲染器负责（只有它拿得到 three 运行时）。
 *
 * - 海洋图案：patternUnits="userSpaceOnUse" 且 tile 为 100x100 地图像素 → repeat = 地图宽高 / 100
 * - 纸纹：SVG preserveAspectRatio="xMidYMid slice"，即铺满 (x, y)..(地图宽, 地图高) 再裁掉多余部分
 *
 * 全是纯计算，单测覆盖 slice 的换算。
 */
export type GlobeOverlaySpec = {
  href: string;
  repeatX: number;
  repeatY: number;
  offsetX: number;
  offsetY: number;
  opacity: number;
};

/** 平面图里海洋图案的 tile 尺寸（地图像素） */
export const PATTERN_TILE = 100;

/** 海洋图案：默认就压在海面上 */
export function waterOverlaySpec(mapWidth: number, mapHeight: number): GlobeOverlaySpec | null {
  const href = styles?.ocean?.groups?.pattern?.attrs?.href;
  if (typeof href !== "string" || !href) return null;

  const opacity = Number.parseFloat(String(styles?.ocean?.groups?.pattern?.attrs?.opacity ?? 1));
  return {
    href,
    repeatX: mapWidth / PATTERN_TILE,
    repeatY: mapHeight / PATTERN_TILE,
    offsetX: 0,
    offsetY: 0,
    opacity: Number.isFinite(opacity) ? opacity : 1
  };
}

/** 纸纹图层的元素：它是个可以关掉的图层，关掉时平面图也不画 */
function textureLayerElement(): SVGGElement | null {
  return document.querySelector<SVGGElement>('#map g[data-layer="texture"]');
}

/** 纸纹图层当前是否开着：渲染器靠它决定要不要去读贴图（懒加载） */
export function textureLayerVisible(): boolean {
  const element = textureLayerElement();
  return element !== null && getComputedStyle(element).display !== "none";
}

/** 纸纹：默认关闭的图层；开启后压在陆地上 */
export function landOverlaySpec(
  mapWidth: number,
  mapHeight: number,
  imageWidth: number,
  imageHeight: number
): GlobeOverlaySpec | null {
  const element = textureLayerElement();
  if (!element || getComputedStyle(element).display === "none") return null; // 图层关着就不画

  const href = styles?.texture?.options?.href;
  if (typeof href !== "string" || !href || imageWidth <= 0 || imageHeight <= 0) return null;

  const { x: offsetX = 0, y: offsetY = 0 } = styles?.texture?.options ?? {};
  const boxWidth = Math.max(mapWidth - offsetX, 0);
  const boxHeight = Math.max(mapHeight - offsetY, 0);

  // slice：按较大的缩放比铺满整块，再把超出部分裁掉（居中）
  const scale = Math.max(boxWidth / imageWidth, boxHeight / imageHeight) || 1;
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;

  const layerOpacity = Number.parseFloat(getComputedStyle(element).opacity);
  return {
    href,
    repeatX: mapWidth / drawWidth,
    repeatY: mapHeight / drawHeight,
    offsetX: -(offsetX + (boxWidth - drawWidth) / 2) / drawWidth,
    offsetY: -(offsetY + (boxHeight - drawHeight) / 2) / drawHeight,
    opacity: Number.isFinite(layerOpacity) ? layerOpacity : 1
  };
}
