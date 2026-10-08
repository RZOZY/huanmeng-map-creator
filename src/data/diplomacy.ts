// 外交关系表，键为某国在 `diplomacy` 中为另一国存的值
//
// 中文语序是「甲 对 乙：中立」，与英文的「A is neutral to B」不同，
// 所以这里存的是关系名（zh），拼接时按中文语序来，另附 tipText 供提示使用。

export interface Relation {
  /** 中文关系名，用于表格与提示 */
  zh: string;
  color: string;
  tip: string;
  /** 某国对另一国确立该关系的大事记；未设时用通用变更记录 */
  event?: { title: string; text: (subject: string, object: string) => string };
}

export const RELATIONS: Record<string, Relation> = {
  Ally: {
    zh: "同盟",
    color: "#00b300",
    tip: "同盟两国订立防御协定，在第三方入侵时互相保护",
    event: { title: "订立防御协定", text: (subject, object) => `${subject}与${object}订立了防御协定` }
  },
  Friendly: {
    zh: "友好",
    color: "#d4f8aa",
    tip: "两国存在共同利益时即为友好关系"
  },
  Neutral: {
    zh: "中立",
    color: "#edeee8",
    tip: "中立表示两国关系既非正面也非负面"
  },
  Suspicion: {
    zh: "猜疑",
    color: "#eeafaa",
    tip: "猜疑表示一国对另一国抱有谨慎的不信任"
  },
  Enemy: {
    zh: "交战",
    color: "#e64b40",
    tip: "敌对表示两国正处于战争状态",
    event: { title: "宣战", text: (subject, object) => `${subject}向敌国${object}宣战` }
  },
  Unknown: {
    zh: "未知",
    color: "#a9a9a9",
    tip: "两国互相了解不足时关系为未知",
    event: {
      title: "断绝往来",
      text: (subject, object) => `${subject}召回了使节，并抹去了关于${object}的一切记录`
    }
  },
  Rival: {
    zh: "竞争",
    color: "#ad5a1f",
    tip: "竞争表示两国争夺本地区的主导权",
    event: { title: "结为竞争", text: (subject, object) => `${subject}与${object}成为竞争对手` }
  },
  Vassal: {
    zh: "附庸",
    color: "#87CEFA",
    tip: "附庸国对宗主国（当前选中的国家）负有义务",
    event: { title: "成为附庸", text: (subject, object) => `${subject}成为${object}的附庸` }
  },
  Suzerain: {
    zh: "宗主",
    color: "#00008B",
    tip: "宗主国对附庸国（当前选中的国家）拥有一定控制权",
    event: { title: "确立宗主权", text: (subject, object) => `${subject}使${object}成为附庸` }
  }
};

export const INVALID_RELATION = "无效关系";

/** 「甲 对 乙：关系」的中文拼接 */
export function relationText(subject: string, object: string, relation: string): string {
  const zh = RELATIONS[relation]?.zh ?? INVALID_RELATION;
  return `${subject} 对 ${object}：${zh}`;
}

export const isRelation = (value: string): boolean => Object.hasOwn(RELATIONS, value);

/** the relation the other state holds back */
export const getInverseRelation = (relation: string): string =>
  relation === "Vassal" ? "Suzerain" : relation === "Suzerain" ? "Vassal" : relation;

export const NO_RELATION_COLOR = "#4682b4";
