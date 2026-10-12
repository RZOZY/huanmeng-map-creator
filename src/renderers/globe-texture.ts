/**
 * 球面的贴图采样：把平面图用的那两张贴图缩成小图，按「地图像素坐标」取样，交给逐单元取色去合成。
 *
 * - 海洋图案（styles.ocean.groups.pattern，pattern1.png，0.2 透明）在平面图里默认就压在海面上
 * - 纸纹贴图（styles.texture，默认是大理石）落在陆地，而且是**默认关闭的图层**，开关跟着菜单走
 *
 * 平面图的贴图是等距圆柱铺法，与球面的经纬度参数化一一对应，所以取样坐标就是地图像素本身。
 * 缩到 256 再取样：一次盒式滤波，避免在地球仪尺度下逐像素取样变成噪点。
 */
import type { GlobeTextureSample, GlobeTextureSampler } from "./globe-vector";

const SAMPLE_SIZE = 256; // 贴图缩到这么大再取样
const PATTERN_TILE = 100; // 平面图里海洋图案的 patternUnits 是 100x100 地图像素

type SampledImage = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

let textureImage: SampledImage | null = null; // 纸纹（大理石等）
let patternImage: SampledImage | null = null; // 海洋图案
let loading: Promise<void> | null = null;

async function sampleImage(href: string): Promise<SampledImage | null> {
  return new Promise(resolve => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = SAMPLE_SIZE;
      canvas.height = SAMPLE_SIZE;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return resolve(null);
      context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
      const data = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
      resolve({ data, width: SAMPLE_SIZE, height: SAMPLE_SIZE });
    };
    image.onerror = () => resolve(null);
    image.src = href;
  });
}

/** 取一张缩略图上的像素（双线性太重，这里按最近邻，因为已经缩到 256 了） */
function pixelAt(image: SampledImage, u: number, v: number, out: GlobeTextureSample): GlobeTextureSample {
  const x = Math.max(0, Math.min(image.width - 1, Math.round(u * (image.width - 1))));
  const y = Math.max(0, Math.min(image.height - 1, Math.round(v * (image.height - 1))));
  const index = (y * image.width + x) * 4;
  out.r = image.data[index] / 255;
  out.g = image.data[index + 1] / 255;
  out.b = image.data[index + 2] / 255;
  out.a = image.data[index + 3] / 255;
  return out;
}

/** 把两张贴图读进内存；重复调用只加载一次 */
export function loadGlobeTextures(): Promise<void> {
  if (loading) return loading;
  const textureHref = styles?.texture?.options?.href;
  const patternHref = styles?.ocean?.groups?.pattern?.attrs?.href;

  loading = (async () => {
    const [texture, pattern] = await Promise.all([
      textureHref ? sampleImage(textureHref) : Promise.resolve(null),
      patternHref ? sampleImage(patternHref) : Promise.resolve(null)
    ]);
    textureImage = texture;
    patternImage = pattern;
  })();

  return loading;
}

const scratch: GlobeTextureSample = { r: 0, g: 0, b: 0, a: 0 };

/** 纸纹当前是否该画：它是个可以关掉的图层，关掉时平面图也不画 */
function textureLayerVisible(): boolean {
  const element = document.querySelector<SVGGElement>('#map g[data-layer="texture"]');
  return element !== null && getComputedStyle(element).display !== "none";
}

/**
 * 在某个地图像素位置上取一次贴图。
 * 陆地取纸纹（跟着 texture 图层开关），水面取海洋图案；没有贴图可用时返回 null。
 */
export const globeTextureAt: GlobeTextureSampler = (x, y, isLand) => {
  if (isLand) {
    if (!textureImage || !textureLayerVisible()) return null;

    const { x: offsetX = 0, y: offsetY = 0 } = styles?.texture?.options ?? {};
    const opacity = Number.parseFloat(getComputedStyle(document.querySelector('#map g[data-layer="texture"]')!).opacity);
    // SVG：preserveAspectRatio="xMidYMid slice"，图片铺满 (x, y)..(宽, 高) 并裁掉多余部分
    const mapWidth = options.map.graph.width;
    const mapHeight = options.map.graph.height;
    const boxWidth = Math.max(mapWidth - offsetX, 0);
    const boxHeight = Math.max(mapHeight - offsetY, 0);
    const scale = Math.max(boxWidth / textureImage.width, boxHeight / textureImage.height);
    const drawWidth = textureImage.width * scale;
    const drawHeight = textureImage.height * scale;
    const u = (x - (offsetX + (boxWidth - drawWidth) / 2)) / drawWidth;
    const v = (y - (offsetY + (boxHeight - drawHeight) / 2)) / drawHeight;
    if (!Number.isFinite(u) || !Number.isFinite(v)) return null;

    const sample = pixelAt(textureImage, u, v, scratch);
    const alpha = sample.a * (Number.isFinite(opacity) ? opacity : 1);
    return alpha > 0.01 ? { ...sample, a: alpha } : null;
  }

  if (!patternImage) return null;
  const patternOpacity = Number.parseFloat(String(styles?.ocean?.groups?.pattern?.attrs?.opacity ?? 1));
  const u = (x % PATTERN_TILE) / PATTERN_TILE;
  const v = (y % PATTERN_TILE) / PATTERN_TILE;
  const sample = pixelAt(patternImage, u, v, scratch);
  const alpha = sample.a * (Number.isFinite(patternOpacity) ? patternOpacity : 1);
  return alpha > 0.01 ? { ...sample, a: alpha } : null;
};
