// 幻梦地图生成器 —— 中文运行时（本项目二次开发，不改动上游源码）
//
// 上游 FMG 的界面文案是英文硬编码在编译产物里的，没有语言包机制。
// 这里在运行时遍历 DOM，用整串精确匹配把英文换成中文；匹配不到就保持原样。
// 中文措辞来自幻艺地图（fantcraft.com/fmg/），通过对齐 v1.1530 英/中两个构建逐元素提取。

import { LAYER_NAMES } from "./layer-names";
import dictionary from "./zh-CN.json";

type Dict = Record<string, string>;
const entries: Dict = dictionary as Dict;

/**
 * 拼接型文案：上游把动态值插进句子里（如 `${名称}. Click to edit the label`），
 * 整串精确匹配必然落空。这里按「固定片段 + 捕获动态部分」的模式处理。
 * 中文模板取自幻艺地图的编译产物（同一批模板）。
 * 顺序有讲究：更具体的放前面。
 */
const PATTERNS: [RegExp, string][] = [
  // 地图提示
  [/^(.*)\. Click to edit the label$/, "$1<br>点击编辑标签"],
  [/^(.*)\. Click to edit the Route$/, "$1<br>点击编辑道路"],
  [/^Click to edit the Route$/, "点击编辑道路"],
  [/^(.*?)\s?lake\. Click to edit$/, "$1湖<br>点击编辑"],
  [
    /^(.*) (\S+) emblem\. Click to edit\. Hold Shift to show associated area or place$/,
    "$1 $2纹章<br>点击编辑<br>按住 Shift 显示关联区域或地点"
  ],
  [/^(.*)\. Population: (.*)\. Click to edit$/, "$1<br>人口：$2<br>点击编辑"],
  [/^Cell population: (.*); Rural: (.*); Urban: (.*)$/, "单元格人口<br>总计：$1<br>乡村：$2<br>城市：$3"],
  [
    /^Cell rural production: (.*)\. Click to select displayed goods in Goods Editor$/,
    "单元格乡村产出：$1<br>点击在商品编辑器中选择显示的商品"
  ],
  [/^(.*) urban production: (.*)\. Click to view$/, "$1 城市产出：$2<br>点击查看"],
  [/^(.*) market\. Click to view$/, "$1 市场<br>点击查看"],
  [/^(.*)\. Click to view$/, "$1<br>点击查看"],
  [/^(.*)\. Click to edit$/, "$1<br>点击编辑"],
  [/^(.*)\. Shortcut: (.*)$/, "$1<br>快捷键：$2"],
  // 动态数值类提示（每种商品/市场各不同，只能按模式处理）
  [
    /^Good daily production: (.*)\. Cells: (.*)\. Burgs: (.*)\. Click to see burgs producing this good$/,
    "日产量：$1<br>单元格：$2<br>城镇：$3<br>点击查看生产该商品的城镇"
  ],
  [
    /^Current treasury: (.*)\. Sales Tax: (.*)\. Poll Tax: (.*)\. Click to view and edit taxes$/,
    "国库：$1<br>销售税：$2<br>人头税：$3<br>点击查看并编辑税收"
  ],
  [
    /^Total stock in all markets and burg inventories: (.*) units\. Click to see breakdown by location$/,
    "各市场与城镇库存总量：$1 单位<br>点击查看按地点的明细"
  ],
  [
    /^Total population: (.*)\. Rural population: (.*)\. Urban population: (.*)$/,
    "总人口：$1<br>乡村人口：$2<br>城市人口：$3"
  ],
  [/^Total population: (.*); Rural population: (.*); Urban population: (.*)$/, "总人口：$1<br>乡村人口：$2<br>城市人口：$3"],
  [/^State: (.*) Culture: (.*) Total population: (.*)$/, "国家：$1<br>文化：$2<br>总人口：$3"],
  [/^Relief: (.*)\. Density (.*)$/, "地形：$1<br>密度 $2"],
  [/^(.*) points · (.*)x complexity · (.*)% rough$/, "$1 点 · 复杂度 $2x · 崎岖度 $3%"],
  [/^Estimated area: the feature goes beyond the map border, its area on the map is (.*)$/, "估算面积：该地物超出了地图边界，其在地图上的面积约为 $1"],
  [/^(.*) is a NOT state capital$/i, "$1 不是国都"],
  [/^Zoom to (.*)$/, "缩放到$1"],
  [/^Journey name: (.*)$/, "旅程名称：$1"],
  [/^Marker icon size (.*)$/, "标记图标大小 $1"],
    [/^No relief(<br>.*)?$/, "无地形$1"],
  [/\. Click to change$/, "<br>点击更改"],
  [/\. Click to view details$/, "<br>点击查看详情"],
  [/\. Click to select$/, "<br>点击选择"],
  [/^Total time: (.*)\. Travel time: (.*)$/, "总耗时：$1<br>行程时间：$2"],
  [/^Hours spent moving or waiting: (.*), the sum of the segment times\. Rest between travel days is not counted\.$/, "行进与等待的耗时合计：$1<br>不计算行军日之间的休整。"],
  [/^Time from start to finish: (.*)\. A day of travel fills a whole day<br>however many hours the transport sustains\.$/, "从起点到终点的耗时：$1<br>行军日按整天计，不论该运输方式实际能行进多少小时。"],
  [/^List below shows relations to (.*)$/, "下表列出与$1的关系"],
    // 窗口标题：本版不带版本号；上游的老标题也一并收敛到产品名
  [/^HuanMeng Map Creator v(\S+)$/, "HuanMeng Map Creator"],
  [/^Azgaar's Fantasy Map Generator v(\S+)$/, "HuanMeng Map Creator"],
  [/^Azgaar's Fantasy Map Generator$/, "HuanMeng Map Creator"],
  // 省份/国家提示：`${名称} ${形式名}, ${所属国家}`
  [/^(.*?) ([A-Z][A-Za-z ]+), (.*)$/, "$1 \u0000FORM\u0000$2<br>$3"],
  // 编辑器的实体提示
  [/^(.*) culture\. (.*)\. (.*)$/, "$1 文化<br>$2<br>$3"]
];

function applyPatterns(key: string): string | null {
  for (const [re, to] of PATTERNS) {
    if (!re.test(key)) continue;
    const out = key.replace(re, to);
    // 形式名占位符：拿字典再翻一次
    if (out.includes("\u0000FORM\u0000")) {
      return out.replace(/\u0000FORM\u0000([^,]*)/, (_m, form: string) => entries[form.trim()] ?? form);
    }
    return out;
  }
  return null;
}

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "CODE", "PRE", "TEXTAREA", "NOSCRIPT"]);
const SKIP_IDS = new Set(["map"]);
const ATTRS = ["data-tip", "placeholder", "aria-label", "title", "alt", "label"];

/** 归一化：压缩空白，但保留 &nbsp; */
function normalize(text: string): string {
  return text.replace(/[ \t\r\n]+/g, " ").trim();
}

/** 整串精确匹配；命中返回中文，否则返回 null */
export function translate(value: string): string | null {
  if (!value) return null;
  const key = normalize(value);
  if (!key) return null;
  const hit = entries[key];
  if (hit && hit !== key) return hit;
  return applyPatterns(key);
}

function translateTextNode(node: Text): void {
  const raw = node.nodeValue;
  if (!raw) return;
  if (!/[A-Za-z]{2}/.test(raw)) return;
  const hit = translate(raw);
  if (!hit) return;

  // 译文里带 <br> 时（提示与对话框的多行排版）必须以 HTML 节点写入：
  // 写成文本节点的话，浏览器会把 "<br>" 当普通字符原样显示出来。
  // 这里只替换当前这个文本节点，不碰它的兄弟节点（对话框里常有 <i>/<p>/<span>）
  if (hit.includes("<br>") && node.parentNode) {
    const template = node.ownerDocument.createElement("template");
    template.innerHTML = hit;
    node.replaceWith(...Array.from(template.content.childNodes));
    return;
  }

  // 保留原有的前后空白，避免影响布局
  const lead = raw.match(/^\s*/)?.[0] ?? "";
  const tail = raw.match(/\s*$/)?.[0] ?? "";
  node.nodeValue = lead + hit + tail;
}

function translateAttributes(element: Element): void {
  for (const name of ATTRS) {
    const value = element.getAttribute(name);
    if (!value || !/[A-Za-z]{2}/.test(value)) continue;
    const hit = translate(value);
    if (hit) element.setAttribute(name, hit);
  }
}

/** 图层按钮：按 data-layer 整块替换，保留 <u> 快捷键高亮 */
function translateLayerButtons(): void {
  const list = document.getElementById("mapLayers");
  if (!list) return;
  for (const item of Array.from(list.children)) {
    const id = item instanceof HTMLElement ? item.dataset.layer : undefined;
    if (!id) continue;
    const name = LAYER_NAMES[id];
    if (name && item.innerHTML !== name) item.innerHTML = name;
    const tip = item.getAttribute("data-tip");
    if (tip) {
      const head = name ? name.replace(/<\/?u>/g, "") : null;
      if (head) {
        const translated = tip.replace(/^[^:]+/, head);
        if (translated !== tip) item.setAttribute("data-tip", translated);
      }
    }
  }
}

function walk(root: Node): void {
  if (root.nodeType === 3) {
    translateTextNode(root as Text);
    return;
  }
  if (root.nodeType !== 1) return;
  const element = root as Element;
  if (SKIP_TAGS.has(element.tagName)) return;
  if (element.id && SKIP_IDS.has(element.id)) return;
  if (element.closest("#map")) return;

  translateAttributes(element);
  for (const child of Array.from(element.childNodes)) walk(child);
}

let scheduled = false;
export function rescan(): void {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    walk(document.body);
    translateLayerButtons();
    translateDocumentTitle();
  });
}

/** 窗口标题在 <head> 的 <title> 里，不在 body 内，需要单独处理 */
function translateDocumentTitle(): void {
  const hit = translate(document.title);
  if (hit) document.title = hit;
}

function install(): void {
  walk(document.body);
  translateLayerButtons();
  translateDocumentTitle();
  new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type === "characterData") {
        rescan();
        return;
      }
      if (mutation.addedNodes.length) {
        rescan();
        return;
      }
      if (mutation.type === "attributes") {
        rescan();
        return;
      }
    }
  }).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ATTRS
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
else install();

(window as unknown as Record<string, unknown>).__FMG_I18N__ = {
  entries: Object.keys(entries).length,
  translate,
  rescan
};

// 本版已关闭全局快捷键，<u> 原先只用于标示快捷键字母，去掉下划线避免误导
(function () {
  const style = document.createElement("style");
  style.textContent = "u { text-decoration: none !important; }";
  document.head.append(style);
})();
