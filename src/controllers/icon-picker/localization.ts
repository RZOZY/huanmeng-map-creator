import type { IconUseKind } from "@/components/icons";
import { capitalize } from "@/utils/stringUtils";

// Picker-only labels; keys and the shared icon catalog remain unchanged.
const LABELS: Readonly<Record<string, string>> = {
  Emoji: "表情",
  Settlements: "聚落",
  Goods: "商品",
  Relief: "地形",
  Heraldry: "纹章",
  Ports: "港口",
  Atlas: "地图符号",
  Simple: "简约",
  Colored: "彩色",
  Gray: "灰度",
  Illustrated: "手绘",
  Stickers: "贴纸",
  "War & power": "战争与权力",
  "Magic & myth": "魔法与神话",
  People: "人物",
  "Faith & signs": "信仰与符号",
  "Shapes & colors": "形状与颜色",
  "Places & travel": "地点与旅行",
  "Crafts & tools": "工艺与工具",
  "Trade & treasure": "贸易与宝藏",
  "Arts & leisure": "艺术与休闲",
  Nature: "自然",
  "Sky & weather": "天空与天气",
  Beasts: "兽类",
  Birds: "鸟类",
  "Reptiles & bugs": "爬行类与虫类",
  "Sea life": "海洋生物",
  Plants: "植物",
  "Food & drink": "食物与饮料",
  Conventional: "常见图案",
  Crosses: "十字",
  "Beast Heads": "兽首",
  Reptiles: "爬行类",
  Bugs: "虫类",
  Fishes: "鱼类",
  Molluscs: "软体动物",
  Fantastic: "奇幻生物",
  Agriculture: "农业",
  Arms: "武器",
  Bodyparts: "身体部位",
  Architecture: "建筑",
  Seafaring: "航海",
  Tools: "工具",
  Miscellaneous: "杂项",
  Ornaments: "装饰"
};

const GOODS_NAMES: Readonly<Record<string, string>> = {
  amber: "琥珀",
  arms: "武器",
  artillery: "火炮",
  barrels: "木桶",
  beer: "啤酒",
  books: "书籍",
  boots: "靴子",
  bronze: "青铜",
  camels: "骆驼",
  candles: "蜡烛",
  cattle: "牛",
  ceramics: "陶瓷",
  cheese: "奶酪",
  clay: "黏土",
  cloth: "布料",
  coal: "煤炭",
  coins: "钱币",
  copper: "铜",
  dates: "椰枣",
  dyes: "染料",
  elephants: "大象",
  fish: "鱼",
  furs: "毛皮",
  game: "猎物",
  garments: "服装",
  gemstones: "宝石",
  glass: "玻璃",
  gold: "黄金",
  grain: "粮食",
  gunpowder: "火药",
  harnesses: "马具",
  hemp: "麻",
  honey: "蜂蜜",
  horses: "马匹",
  incense: "熏香",
  ink: "墨水",
  iron: "铁",
  jewelry: "珠宝",
  leather: "皮革",
  liquor: "烈酒",
  marble: "大理石",
  oil: "油",
  olives: "橄榄",
  paper: "纸张",
  pearls: "珍珠",
  perfume: "香水",
  ropes: "绳索",
  sails: "船帆",
  salt: "盐",
  "salted-fish": "咸鱼",
  saltpeter: "硝石",
  sand: "沙子",
  sheep: "绵羊",
  ships: "船舶",
  silk: "丝绸",
  silver: "白银",
  slaves: "奴隶",
  soap: "肥皂",
  spices: "香料",
  stone: "石材",
  sugar: "糖",
  tar: "焦油",
  tea: "茶叶",
  tin: "锡",
  tobacco: "烟草",
  tools: "工具",
  tropicalTimber: "热带木材",
  unknown: "未知商品",
  vinegar: "醋",
  whales: "鲸",
  wine: "葡萄酒",
  wood: "木材"
};

const USE_LABELS: Record<IconUseKind, string> = {
  good: "商品",
  marker: "标记",
  regiment: "军团",
  unit: "兵种",
  burgGroup: "聚落分组样式",
  market: "市场标记样式",
  emblem: "纹章",
  relief: "地形图标",
  biome: "生物群系地形池",
  reliefRule: "地形规则"
};

export function pickerUseSummary(uses: Partial<Record<IconUseKind, number>>): string {
  return Object.entries(uses)
    .map(([kind, count]) => `${USE_LABELS[kind as IconUseKind]}：${count}`)
    .join("、");
}

interface ReliefName {
  type: string;
  label: string;
  variants: number;
}

export function pickerLabel(label: string): string {
  return Object.hasOwn(LABELS, label) ? LABELS[label] : label;
}

/** Translate only known built-in families, never inferred third-party artwork or typed glyph text. */
export function pickerIconName(
  id: string,
  original: string,
  glyphText: string | null,
  reliefTypes: readonly ReliefName[]
): string {
  if (!id) return "无";
  if (glyphText !== null) return original === glyphText ? glyphText : capitalize(original);
  if (id.startsWith("custom-")) return "自定义图标";
  if (id.startsWith("goods-")) {
    const name = id.slice(6);
    return Object.hasOwn(GOODS_NAMES, name) ? GOODS_NAMES[name] : capitalize(original);
  }
  if (id === "ports-anchor") return "锚";
  if (id === "ports-harbor") return "港湾";
  const relief = id.match(/^relief-(?:simple|colored|gray|illustrated|stickers)-([a-zA-Z]+)-(\d+)$/);
  if (relief) {
    const type = reliefTypes.find(({ type }) => type === relief[1]);
    const variant = Number(relief[2]);
    if (type && variant >= 1 && variant <= type.variants) return type.label + (variant > 1 ? ` ${variant}` : "");
  }
  return capitalize(original);
}

/** Each token may match either language, including adjacent Chinese and Latin text. */
export function matchesIconQuery(query: string, terms: readonly string[]): boolean {
  const normalize = (text: string) => text.normalize("NFKC").toLowerCase();
  const tokens = normalize(query)
    .trim()
    .split(/\s+|(?<=\p{Script=Han})(?=[a-z0-9])|(?<=[a-z0-9])(?=\p{Script=Han})/u);
  const text = normalize(terms.join("\n"));
  return tokens.every(token => text.includes(token));
}
