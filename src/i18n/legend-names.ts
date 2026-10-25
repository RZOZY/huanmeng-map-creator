// Built-in legend keys stay stable in saved maps; only their visible titles are localized.
const TITLES = new Map([
  ["States", "国家"],
  ["Cultures", "文化"],
  ["Biomes", "生物群系"],
  ["Religions", "宗教"],
  ["Zones", "区域"]
]);

export const getLegendTitle = (key: string): string => TITLES.get(key) ?? key;
