/** Where a party travels. `stay` is a halt, not a way of moving, so it is not one of these */
export type TravelDomain = "land" | "water" | "air";

export interface JourneyArchetype {
  /** What kind of travel this is, shown as the journey's type: "Quest", "Raid" */
  type: string;
  /** How often this party turns up, relative to the others */
  weight: number;
  /**
   * How the party travels, weighted per domain — the shape of the whole journey.
   * The heaviest domain is what the party *is*: it steers where the journey starts and which
   * stops it heads for, and the lighter ones are the exception it falls back on. A domain left
   * out never happens. A leg still has to be possible: water needs a port at both ends and a
   * sailable path, land needs a land path, air is never refused.
   */
  domains: Partial<Record<TravelDomain, number>>;
  /**
   * Preferred transport by name, weighted, for each domain the party travels.
   * Names are matched against the configured transports, so a party falls back to what
   * the map actually has. Every domain in `domains` should appear here.
   */
  transports: Partial<Record<TravelDomain, Record<string, number>>>;
  /** Chance a land leg leaves the road network (and travels at the off-road penalty) */
  offRoad: number;
  /** Chance the party stops over at an intermediate burg */
  rest: number;
  /** Chance a long leg is broken by a camp in the wild */
  camp: number;
  /** Journey titles; tokens: {hero} {origin} {destination} {destinationAdjective} {wild} */
  title: string[];
  /** Names for a land leg, in the party's own voice; tokens: {to} {wild}. Falls back to the shared pool */
  leg?: string[];
  /** Names for a night spent in a burg; tokens: {place} */
  stopover: string[];
  /** Names for a night spent in the open; tokens: {wild} */
  bivouac: string[];
}

/** Journeys with no story behind them: a plain trip from A to B */
export const DEFAULT_JOURNEY_TYPE = "旅程";

export const COMPANY_ADJECTIVES = [
  "铁",
  "鎏金",
  "静默",
  "绯红",
  "游荡",
  "破碎",
  "灰",
  "漫长",
  "盐",
  "琥珀",
  "荆棘",
  "灰烬",
  "虚空",
  "凛冬",
  "最后",
  "坚忍",
  "青铜",
  "赤铜",
  "银",
  "金",
  "铅",
  "猩红",
  "玄",
  "赭",
  "苍白",
  "明亮",
  "苦涩",
  "寂静",
  "不眠",
  "疲惫",
  "褴褛",
  "忠信",
  "无畏",
  "倔强",
  "肃穆",
  "坚定",
  "警觉",
  "任性",
  "游侠",
  "扭曲",
  "无名",
  "迷失",
  "自由",
  "立誓",
  "勇毅",
  "骄傲",
  "寒冷",
  "霜",
  "风暴",
  "余烬",
  "炭",
  "燧石",
  "石",
  "琉璃",
  "荆棘蔓",
  "蔷薇",
  "无星",
  "无日",
  "隐秘",
  "蒙面",
  "神圣",
  "风霜"
];

export const BANNERS = [
  "雄鹿",
  "玫瑰",
  "圣杯",
  "塔",
  "蛇",
  "星",
  "灯",
  "猫头鹰",
  "狼",
  "隼",
  "橡树",
  "钥匙",
  "狮",
  "熊",
  "野猪",
  "牡鹿",
  "公羊",
  "公牛",
  "猎犬",
  "狐",
  "野兔",
  "蝰蛇",
  "渡鸦",
  "鹰",
  "鹰隼",
  "天鹅",
  "鹭",
  "喜鹊",
  "狗鱼",
  "鲑",
  "狮鹫",
  "双足飞龙",
  "龙",
  "凤凰",
  "独角兽",
  "蛇怪",
  "王冠",
  "新月",
  "日",
  "月",
  "彗星",
  "火焰",
  "锚",
  "舵",
  "护手",
  "剑",
  "枪",
  "箭",
  "盾",
  "锁链",
  "钟",
  "竖琴",
  "号角",
  "麦束",
  "车轮",
  "铁砧",
  "锤",
  "门",
  "蓟",
  "常春藤",
  "紫杉",
  "百合",
  "羽",
  "鹿角"
];

export const CARGO = [
  "盐",
  "琥珀",
  "丝绸",
  "香料",
  "羊毛",
  "铁",
  "葡萄酒",
  "毛皮",
  "象牙",
  "玻璃",
  "珍珠",
  "锡",
  "铜",
  "青铜",
  "钢",
  "银",
  "金",
  "铅",
  "燧石",
  "大理石",
  "黑曜石",
  "玉",
  "青金石",
  "明矾",
  "硝石",
  "水银",
  "亚麻",
  "细麻布",
  "棉",
  "天鹅绒",
  "染料",
  "靛蓝",
  "胡椒",
  "肉桂",
  "丁香",
  "藏红花",
  "香",
  "没药",
  "檀香",
  "谷物",
  "大麦",
  "橄榄",
  "蜂蜜",
  "奶酪",
  "麦酒",
  "蜜酒",
  "醋",
  "糖",
  "茶",
  "鱼",
  "木料",
  "木炭",
  "煤",
  "沥青",
  "焦油",
  "麻",
  "蜡",
  "油",
  "皮革",
  "兽皮",
  "马",
  "牛",
  "烟草",
  "羊皮纸",
  "墨"
];

export const RELICS = [
  "王冠",
  "圣杯",
  "古卷",
  "碎片",
  "印章",
  "刃",
  "戒指",
  "面具",
  "号角",
  "典籍",
  "权杖",
  "额环",
  "冠冕",
  "颈环",
  "护符",
  "辟邪符",
  "印记",
  "斗篷",
  "披风",
  "面纱",
  "护手",
  "宝球",
  "法杖",
  "短杖",
  "牧杖",
  "长枪",
  "匕首",
  "弓",
  "盾",
  "头盔",
  "战锤",
  "卷轴",
  "石板",
  "魔典",
  "编年史",
  "账册",
  "圣物匣",
  "宝匣",
  "宝箱",
  "骨灰瓮",
  "小瓶",
  "长颈瓶",
  "杯",
  "提灯",
  "明镜",
  "沙漏",
  "钟",
  "竖琴",
  "钥匙",
  "锁链",
  "钱币",
  "旗帜",
  "王座",
  "车轮",
  "灵石",
  "心",
  "眼",
  "泪",
  "羽",
  "獠牙",
  "卵",
  "荆棘"
];

export const BEASTS = [
  "龙",
  "巨龙",
  "蛇怪",
  "狮鹫",
  "蝎狮",
  "巨魔",
  "狼人",
  "海怪",
  "奇美拉",
  "巨蛇",
  "恐狼",
  "温迪戈",
  "双足飞龙",
  "龙兽",
  "九头蛇",
  "鸡蛇",
  "火蜥蜴",
  "利维坦",
  "鹰身女妖",
  "戈耳工",
  "牛头怪",
  "狮身人面",
  "大鹏",
  "食人魔",
  "巨人",
  "双头巨人",
  "雪人",
  "巨兽",
  "巨像",
  "魔像",
  "石像鬼",
  "人造人",
  "报丧女妖",
  "幽灵",
  "亡魂",
  "食尸鬼",
  "巫妖",
  "吸血鬼",
  "尸妖",
  "尸鬼",
  "阴影",
  "梦魇",
  "水马",
  "海妖",
  "地狱犬",
  "犬魔",
  "妖精",
  "剑齿虎"
];

export const RANKS = ["爵士", "女爵士", "队长", "修士", "修女", "大师", "女主", "老者"];

export const TAVERN_QUALIFIERS = [
  "金",
  "歪",
  "沉睡",
  "大笑",
  "沉没",
  "锈",
  "银",
  "饥饿",
  "彩绘",
  "老",
  "哭泣",
  "欢快",
  "破碎",
  "弯",
  "倾斜",
  "破损",
  "裂",
  "失色",
  "空心",
  "舞",
  "歌",
  "哨",
  "咧嘴",
  "快活",
  "咆哮",
  "腾跃",
  "奔驰",
  "口渴",
  "醉",
  "疲惫",
  "闲",
  "不眠",
  "跛",
  "盲",
  "无齿",
  "绿",
  "蓝",
  "黑",
  "白",
  "猩红",
  "铜",
  "黄铜",
  "鎏金",
  "幸运",
  "迷失",
  "任性",
  "游荡",
  "寂静",
  "狡黠",
  "肥",
  "勇毅",
  "骄傲",
  "隐秘",
  "狂野",
  "咸",
  "烟熏",
  "霜冻"
];

export const TAVERN_SUBJECTS = [
  "雄鹿",
  "锚",
  "野猪",
  "提灯",
  "水壶",
  "狮鹫",
  "美人鱼",
  "车轮",
  "乌鸦",
  "猎犬",
  "钟",
  "水獭",
  "朝圣者",
  "门",
  "木桶",
  "酒桶",
  "大杯",
  "酒壶",
  "高脚杯",
  "壶",
  "长柄勺",
  "炉膛",
  "铁匠",
  "磨坊主",
  "箍桶匠",
  "赶牛人",
  "水手",
  "寡妇",
  "少女",
  "修士",
  "托钵僧",
  "骑士",
  "侍从",
  "传令官",
  "吟游诗人",
  "吹笛人",
  "琴师",
  "弄臣",
  "锤",
  "铁砧",
  "犁",
  "板车",
  "货车",
  "马鞍",
  "马蹄铁",
  "罗盘",
  "烽火",
  "鹅",
  "天鹅",
  "喜鹊",
  "渡鸦",
  "山鸦",
  "鹪鹩",
  "猫",
  "狐",
  "獾",
  "野兔",
  "公羊",
  "公牛",
  "牛",
  "矮马",
  "母马",
  "山羊",
  "鲑",
  "鳟",
  "狗鱼",
  "鳝",
  "鲸",
  "蟹",
  "龙",
  "双足飞龙",
  "独角兽",
  "凤凰",
  "蛇",
  "狮",
  "熊",
  "狼",
  "星",
  "月",
  "日",
  "桥",
  "渡口",
  "磨坊",
  "井",
  "橡树",
  "柳",
  "紫杉",
  "荆棘",
  "玫瑰",
  "蓟",
  "王冠",
  "剑",
  "盾",
  "头盔",
  "箭",
  "钥匙",
  "锁链",
  "靴",
  "手套",
  "斗篷",
  "钱袋",
  "钱币"
];

export const NAMELESS = [
  "阿尔德里克", "马雷克", "伊索尔德", "科尔文", "娜迪亚", "哈尔瓦", "伊洛娜", "塔林", "塞布尔", "奥斯特里克",
  "墨白", "长歌", "青川", "无咎", "拾一", "听澜", "藏锋", "见微", "问渠", "观棋",
  "陆沉", "顾昭", "沈砚", "苏辞", "裴晏", "萧然", "温言", "秦淮", "程霜", "叶珩",
  "云舒", "南枝", "临江", "照野", "山亭", "渡川", "明渊", "素问", "知秋", "容与"
];

export const HIGHLAND_TERMS = ["群山", "山口"];
export const UPLAND_TERMS = ["丘陵", "高地"];
export const UNKNOWN_WILD = "荒野";

export const BIOME_TERMS: Record<string, string> = {
  海洋: "开阔水域",
  热带沙漠: "沙漠",
  寒漠: "寒漠",
  稀树草原: "稀树草原",
  草原: "草原",
  热带季雨林: "丛林",
  温带落叶林: "森林",
  热带雨林: "雨林",
  温带雨林: "雨林",
  针叶林: "松林",
  苔原: "苔原",
  冰川: "冰原",
  湿地: "沼泽"
};

export const LEG_NAMES = {
  air: {
    first: ["自{from}起飞", "掠过{wild}上空", "从{from}腾空而去"],
    second: ["降落于{to}", "下抵{to}", "接近{to}"],
    whole: ["飞往{to}", "越过{wild}飞向{to}", "自{from}飞往{to}", "通往{to}的航线"]
  },
  water: {
    first: ["驶出{from}港", "自{from}扬帆", "从{from}泛海而去"],
    second: ["靠泊于{to}", "驶入{to}港", "最后一段航程往{to}"],
    whole: ["航向{to}", "泛海往{to}", "横渡{water}到{to}", "自{from}泛海至{to}"]
  },
  land: {
    first: ["踏入{wild}", "自{from}走向{wild}", "自{from}往{wild}"],
    second: ["继续前往{to}", "出{wild}抵达{to}", "最后一段路往{to}"],
    offRoadLast: ["绕行至{to}", "出{wild}抵达{to}", "从小路潜入{to}"],
    offRoad: ["绕行至{to}", "穿越{wild}", "横穿{wild}至{to}", "绕开大道往{to}"],
    opening: ["自{from}出发", "自{from}至{to}", "自{from}启程的道路", "启程前往{to}"],
    closing: ["最后几里路往{to}", "通往{to}的道路", "下抵{to}"],
    whole: ["自{from}至{to}", "继续前往{to}", "通往{to}的道路", "{wild}之路"]
  }
};

/** Names for the stops no archetype speaks for */
export const HALT_NAMES = {
  muster: ["在{place}集结", "在{place}采办补给", "在{tavern}会合"],
  /** 搭他人船只的队伍 */
  harborWait: ["在{from}等候船只", "滞留于{from}港", "在{from}订下舱位"],
  /** 自有船只的队伍：等的是潮水与装卸，而非泊位 */
  castingOff: ["在{from}码头装货", "在{from}等潮候天", "在{from}港整备待发"],
  /** 可望见某处地标的海上一夜，以及望不见地标的一夜 */
  anchoredNear: ["{label}下锚", "在{label}下锚过夜", "停泊{label}"],
  anchored: ["夜里下锚", "在{water}上过夜", "下锚至天明"],
  /** 可望见某处地标的营地；队伍自己的宿营名会并入这一组 */
  campNear: ["{label}扎营", "在{label}过夜"]
};

export const JOURNEY_ARCHETYPES: Record<string, JourneyArchetype> = {
  heroes: {
    type: "远征",
    weight: 10,
    domains: { land: 7, water: 2 },
    transports: {
      land: { "步行（轻装）": 4, "骑马（无备用马）": 4, 马车: 1 },
      water: { "小帆船": 3, "大帆船": 2, 划艇: 1 }
    },
    offRoad: 0.4,
    rest: 0.7,
    camp: 0.7,
    title: ["{company}{banner}之团", "{rank}{hero}的远征", "{hero}之团", "{company}{banner}驰往{destination}", "{hero}与穿过{wild}的道路"],
    leg: ["通往{to}的道路", "穿越{wild}", "策马前往{to}"],
    stopover: ["在{tavern}过夜", "{place}的传闻", "在{place}补给"],
    bivouac: ["在{wild}扎营", "在{wild}轮值守望", "在{wild}生起篝火"]
  },

  wanderer: {
    type: "漫游",
    weight: 4,
    domains: { land: 8, water: 2 },
    transports: {
      land: { "步行（轻装）": 5, "步行（负重）": 2, "骑马（无备用马）": 1 },
      water: { 划艇: 3, "小帆船": 2, "大帆船": 1 }
    },
    offRoad: 0.5,
    rest: 0.6,
    camp: 0.7,
    title: ["{origin}的{rank}{hero}", "{hero}的漫漫长路", "{hero}走向{destination}", "{company}游子"],
    leg: ["走向{to}", "独自前往{to}", "通往{to}的道路"],
    stopover: ["在{tavern}借宿", "在{place}做工换饭", "在{place}过夜"],
    bivouac: ["在{wild}露宿", "在{wild}的寒夜", "独处于{wild}"]
  },

  caravan: {
    type: "商队",
    weight: 4,
    domains: { land: 6, water: 3 },
    transports: {
      land: { 马车: 3, "步行（负重）": 1 },
      water: { "大帆船": 4, "小帆船": 1 }
    },
    offRoad: 0.1,
    rest: 0.8,
    camp: 0.4,
    title: ["{company}商队", "通往{destination}的{cargo}之路", "{origin}商队", "自{origin}运出的{cargo}"],
    leg: ["运送至{to}", "通往{to}的道路", "通往{to}的税道"],
    stopover: ["{tavern}的车马院", "在{tavern}过夜", "{place}的集日"],
    bivouac: ["在{wild}围车结阵", "在{wild}夜宿", "在{wild}冷营"]
  },

  campaign: {
    type: "征战",
    weight: 4,
    domains: { land: 7, water: 3 },
    transports: {
      land: { "步行（负重）": 5, "骑马（无备用马）": 3, 马车: 1 },
      water: { "大帆船": 5, "小帆船": 1 }
    },
    offRoad: 0.25,
    rest: 0.5,
    camp: 0.8,
    title: ["进军{destination}", "{rank}{hero}的大军", "{destinationAdjective}战役", "{company}大军"],
    leg: ["进军{to}", "队伍穿越{wild}", "强行军至{to}"],
    stopover: ["在{place}驻扎", "在{place}征调补给", "{place}开城相迎"],
    bivouac: ["在{wild}设营", "在{wild}布哨", "在{wild}夜点名"]
  },

  embassy: {
    type: "使团",
    weight: 2,
    domains: { land: 6, water: 4 },
    transports: {
      land: { 马车: 4, 驿车: 3, "骑马（无备用马）": 3, "步行（轻装）": 1 },
      water: { "大帆船": 5, "小帆船": 1 }
    },
    offRoad: 0.05,
    rest: 0.9,
    camp: 0.25,
    title: ["出使{destination}", "{destinationAdjective}使命", "{rank}{hero}前往{destination}", "赴{destination}宫廷的差事"],
    stopover: ["在{tavern}受款待", "在{place}觐见", "在{place}留宿两夜"],
    bivouac: ["在{wild}护卫扎营", "在{wild}守夜"]
  },

  pilgrimage: {
    type: "朝圣",
    weight: 4,
    domains: { land: 8, water: 2 },
    transports: {
      land: { "步行（负重）": 4, "步行（轻装）": 3, "骑马（无备用马）": 1 },
      water: { "小帆船": 3, "大帆船": 2, 划艇: 1 }
    },
    offRoad: 0.35,
    rest: 0.7,
    camp: 0.6,
    title: ["朝圣至{destination}", "{company}朝圣者", "通往{destination}的漫长步行", "{rank}{hero}走向{destination}"],
    leg: ["赤足前往{to}", "继续前往{to}", "通往{to}的朝圣路"],
    stopover: ["在{tavern}受施歇息", "在{place}守夜", "在{place}投宿"],
    bivouac: ["在{wild}守夜", "在{wild}夜祷", "在{wild}露宿"]
  },

  mercenaries: {
    type: "雇佣",
    weight: 3,
    domains: { land: 7, water: 3 },
    transports: {
      land: { "骑马（无备用马）": 5, "步行（负重）": 3, "骑马（有备用马）": 1, 马车: 1 },
      water: { "大帆船": 4, "小帆船": 2 }
    },
    offRoad: 0.3,
    rest: 0.6,
    camp: 0.6,
    title: ["{company}刀客", "{hero}的自由团", "受雇前往{destination}", "{company}{banner}在{destination}受雇"],
    leg: ["策马前往{to}", "受雇之路至{to}", "继续前往{to}"],
    stopover: ["在{tavern}花预付", "在{place}募兵", "在{place}结清饷银"],
    bivouac: ["在{wild}扎营", "在{wild}冷营", "在{wild}掷骰与守望"]
  },

  courier: {
    type: "急递",
    weight: 3,
    domains: { land: 7, water: 3 },
    transports: {
      land: { "骑马（有备用马）": 3, 驿车: 1, "步行（轻装）": 1 },
      water: { "小帆船": 3, "大帆船": 3 }
    },
    offRoad: 0.15,
    rest: 0.5,
    camp: 0.3,
    title: ["驰往{destination}", "自{origin}传出的消息", "{hero}传信至{destination}", "{company}驿站"],
    leg: ["疾驰至{to}", "快路至{to}", "驿道至{to}"],
    stopover: ["在{place}换马", "在{tavern}歇三个时辰", "在{place}换新坐骑"],
    bivouac: ["在{wild}偷得片刻睡眠", "在{wild}让马歇息"]
  },

  expedition: {
    type: "考察",
    weight: 3,
    domains: { land: 7, water: 3 },
    transports: {
      land: { "步行（负重）": 5, "骑马（无备用马）": 2, "步行（轻装）": 1 },
      water: { "小帆船": 3, "大帆船": 2, 划艇: 1 }
    },
    offRoad: 0.7,
    rest: 0.5,
    camp: 0.8,
    title: ["考察{wild}", "{company}考察队", "{wild}测绘", "{rank}{hero}勘察通往{destination}的道路"],
    leg: ["测绘{wild}", "深入{wild}", "横越至{to}"],
    stopover: ["在{place}补给", "在{tavern}记录与修整", "在{place}雇向导"],
    bivouac: ["在{wild}设大本营", "在{wild}设测绘营", "在{wild}被天气困住"]
  },

  refugees: {
    type: "逃难",
    weight: 3,
    domains: { land: 6, water: 3 },
    transports: {
      land: { "步行（负重）": 7, 马车: 2, "步行（轻装）": 1 },
      water: { 划艇: 3, "小帆船": 2, "大帆船": 1 }
    },
    offRoad: 0.4,
    rest: 0.5,
    camp: 0.8,
    title: ["自{origin}逃出之路", "{origin}的迁徙", "{company}队伍", "往{destination}求庇护"],
    leg: ["跋涉至{to}", "通往{to}的长路", "继续前往{to}"],
    stopover: ["在{place}被拒", "在{place}得面包与草铺", "在{place}清点失散的人"],
    bivouac: ["在{wild}扎营", "在{wild}的饥饿之夜", "在{wild}埋葬死者"]
  },

  relicseekers: {
    type: "寻宝",
    weight: 3,
    domains: { land: 7, water: 3 },
    transports: {
      land: { "步行（轻装）": 4, "骑马（无备用马）": 3, "步行（负重）": 1 },
      water: { "小帆船": 3, "大帆船": 2 }
    },
    offRoad: 0.6,
    rest: 0.6,
    camp: 0.7,
    title: ["寻找{relic}", "{hero}与{relic}", "{relic}在{wild}之中", "为{relic}而掘"],
    leg: ["循图深入{wild}", "继续前往{to}", "通往{to}的旧路"],
    stopover: ["在{tavern}买消息", "在{place}贿赂书吏", "在{place}潜伏"],
    bivouac: ["在{wild}扎营", "在{wild}看图", "在{wild}的警醒之夜"]
  },

  monsterhunt: {
    type: "讨伐",
    weight: 3,
    domains: { land: 8, water: 2 },
    transports: {
      land: { "骑马（无备用马）": 4, "步行（轻装）": 4, "步行（负重）": 1 },
      water: { "小帆船": 3, 划艇: 2, "大帆船": 1 }
    },
    offRoad: 0.65,
    rest: 0.6,
    camp: 0.7,
    title: ["猎杀{wild}的{beast}", "{rank}{hero}猎{beast}", "{destination}的{beast}", "悬赏{beast}"],
    leg: ["循踪迹深入{wild}", "捕杀记录指向{to}", "追踪至{to}"],
    stopover: ["在{place}盘问当地人", "在{place}张贴悬赏", "在{tavern}过夜"],
    bivouac: ["在{wild}盲营", "在{wild}设饵", "今夜不举火——{wild}"]
  },

  exiles: {
    type: "流放",
    weight: 2,
    domains: { water: 6, land: 4 },
    transports: {
      land: { "步行（负重）": 5, 马车: 2, "步行（轻装）": 2, "骑马（无备用马）": 1 },
      water: { 划艇: 3, "小帆船": 2, "大帆船": 2 }
    },
    offRoad: 0.6,
    rest: 0.4,
    camp: 0.7,
    title: ["自{origin}逃亡", "{company}流亡者", "自{origin}出走", "{hero}被放逐至{destination}"],
    stopover: ["在{place}躲一夜", "在{place}乞食", "{tavern}的后屋"],
    bivouac: ["在{wild}不举火扎营", "藏身于{wild}", "在{wild}的寒夜"]
  },

  smugglers: {
    type: "走私",
    weight: 2,
    domains: { water: 6, land: 4 },
    transports: {
      land: { "步行（轻装）": 3, "骑马（无备用马）": 3, "步行（负重）": 1, 马车: 1 },
      water: { 划艇: 4, "小帆船": 3, "大帆船": 1 }
    },
    offRoad: 0.8,
    rest: 0.35,
    camp: 0.6,
    title: ["{company}的私运", "走私路至{destination}", "{cargo}私运", "未完税运往{destination}"],
    leg: ["悄路至{to}", "绕过税卡至{to}", "夜运至{to}"],
    stopover: ["在{tavern}潜伏", "在{place}悄悄卸货", "在{place}打点关系"],
    bivouac: ["在{wild}埋藏货物", "不留火、不留名——{wild}", "在{wild}等巡逻过去"]
  },

  raiders: {
    type: "劫掠",
    weight: 2,
    domains: { water: 8, land: 2 },
    transports: {
      land: { "步行（轻装）": 4, "骑马（有备用马）": 3, "骑马（无备用马）": 1 },
      water: { "大帆船": 4, "小帆船": 3, 划艇: 1 }
    },
    offRoad: 0.6,
    rest: 0.3,
    camp: 0.6,
    title: ["{company}劫掠者", "{hero}的劫掠", "劫掠{destination}", "{origin}的龙骨船"],
    leg: ["扑向{to}", "陆路至{to}", "驱赶畜群至{to}"],
    stopover: ["在{place}分赃", "在{place}销赃", "把{place}喝干"],
    bivouac: ["在{wild}滩头扎营", "在{wild}拖船上岸", "在{wild}的警醒之夜"]
  },

  progress: {
    type: "巡幸",
    weight: 2,
    domains: { land: 7, water: 3 },
    transports: {
      land: { 马车: 6, 驿车: 3, "骑马（无备用马）": 3, "步行（负重）": 1 },
      water: { "大帆船": 6, "小帆船": 1 }
    },
    offRoad: 0.02,
    rest: 0.95,
    camp: 0.1,
    title: ["{rank}{hero}的巡幸", "{destinationAdjective}巡幸", "王室自{origin}出行", "{company}巡幸"],
    leg: ["通往{to}的御道", "在{to}受迎", "仪仗前往{to}"],
    stopover: ["在{place}受宴", "在{place}设朝", "在{place}驻跸"],
    bivouac: ["在{wild}架起帐殿", "狩猎队驻于{wild}"]
  },

  skyfarers: {
    type: "飞艇航行",
    weight: 2,
    domains: { air: 12, land: 1, water: 1 },
    transports: {
      land: { "骑马（无备用马）": 3, "步行（轻装）": 2 },
      water: { "小帆船": 2, "大帆船": 2 },
      air: { 飞艇: 6, 传送: 1 }
    },
    offRoad: 0.1,
    rest: 0.2,
    camp: 0.1,
    title: ["{company}飞艇", "{hero}自{origin}凌空而过", "通往{destination}的天路", "{banner}升空"],
    leg: ["掠过{wild}飞往{to}", "在{wild}之上", "天路至{to}"],
    stopover: ["在{place}上空系泊", "在{place}补充燃气与压舱", "在{tavern}过夜"],
    bivouac: ["在{wild}着陆", "在{wild}修补", "在{wild}上空下锚"]
  },

  arcanists: {
    type: "秘术差遣",
    weight: 2,
    domains: { land: 4, air: 3, water: 1 },
    transports: {
      land: { "步行（轻装）": 3, "骑马（无备用马）": 2, 马车: 1 },
      water: { "小帆船": 2, "大帆船": 1 },
      air: { 传送: 4, 飞艇: 1 }
    },
    offRoad: 0.4,
    rest: 0.5,
    camp: 0.3,
    title: ["{company}法环", "{rank}{hero}携带{relic}", "{relic}必须送达{destination}", "{hero}自{origin}踏出", "通往{destination}的短途"],
    leg: ["为通往{to}的道路设符", "隐形穿过{wild}", "绕远路至{to}"],
    stopover: ["在{place}读兆", "在{tavern}的密室", "在{place}研读一夜"],
    bivouac: ["在{wild}画下法环", "在{wild}布下法障", "在{wild}的静默营地"]
  }
};
