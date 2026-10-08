# 幻梦地图生成器 · Humeng Map Generator

> 以上游 **Azgaar's Fantasy Map Generator v1.154.0** 的引擎为核心的中文奇幻地图生成器。
> 内置中文语料库，地图内容（国名 / 城名 / 河名 / 文化 / 宗教 / 标记 / 区域……）**由中文语料直接生成**，不经翻译。

[English upstream README](README-upstream.md)

---

## 这是什么

上游 FMG 是一套成熟的程序化地图引擎（地形生成、政治模拟、文化命名、贸易网络）。
本项目保留其引擎，把它**中文化成一台中文地图生成器**：

- **不是**在英文界面上贴一层翻译
- **而是**让引擎用中文语料去生成

## 中文化的三层

### 一、语料层（核心）

    public/i18n/wordbanks/<题材>/{state,province,burg,culture,religion,river,lake,marker,zone,mapName,era,engine,manifest}.json

9 种题材，合计 **18451 条**：

| 题材 | 条目 | 题材 | 条目 |
|---|---:|---|---:|
| 武侠 wuxia | 3945 | 神话 mythology | 1687 |
| 玄幻 xuanhuan | 3265 | 暗黑 dark-fantasy | 1687 |
| 共和 republic | 2000 | 高奇幻 high-fantasy | 1588 |
| 仙侠 xianxia | 1854 | 默认 default | 1302 |
| | | 现代都市 modern-urban | 1123 |

引擎按「读语料 → 提取词根 → 组合」生成，运行时由 `public/i18n/09-<题材>-engine.js` 调度。
生成词缀遵循中文习惯：朝廷用「朝/国」，行政区用「郡/州/道/路/省/府」，聚落用「城/县/镇/乡/关/堡/寨/驿」。

### 二、生成数据表

上游内嵌的英文词表：

| 文件 | 内容 |
|---|---|
| `src/data/markers.ts` | 标记语料整表：客栈 / 怪物 / 遗迹 / 洞穴 / 亡灵 / 遭遇战 |
| `src/generators/biomes-generator.ts` | 生物群系 13 项 |
| `src/generators/goods-generator.ts` | 物资 71 项 |
| `src/generators/religions-generator.ts` | 宗教命名 327 词条 + 中文语序组合规则 |
| `src/generators/zones-generator.ts` | 区域命名 47 类型词，去掉英文形容词形态学 |

> **注意**：`CULTURE_TYPES`、`religion.type`（Folk/Organized/Heresy）、`zone.type` 是
> **代码标识符**，不是显示名。改动会破坏逻辑与类型检查 —— 这类词只在显示层处理。

### 三、界面层

- `src/i18n/zh-CN.json` —— 905 条界面英→中对照，整串精确匹配
- `src/i18n/translator.ts` —— 精确匹配 + 拼接型文案模式层
- `src/i18n/layer-names.ts` —— 图层名按 `data-layer` 整块替换，保留 `<u>` 快捷键下划线
- `public/i18n/*.js` —— 补丁层（中文命名引擎 + 主题美化），作为经典脚本由 `src/index.html` 按时序加载

## 版本策略

**一次性本地化，不再跟随上游更新。**

    v1.154.0                354eeaa7   上游 Azgaar v1.154.0 原版
    v1.154.0-cn.1-baseline  aa9cf6b1   中文化基线（生成物已无英文）
    v1.154.0-cn.1           378293bc   当前版本

之所以不跟随：上游每次改动都可能引入新的英文语料，而本项目的目标恰恰是让生成物**完全贴合中文语料**。

## 开发

    npm.cmd install
    npm.cmd run electron build      # 类型检查 + vite build --mode electron
    npm.cmd run electron -- dist --win --x64 --dir --publish never

### ⚠️ 提交时的两个坑

**1. 必须加 `--no-verify`**
仓库的 pre-commit 钩子会跑 `biome check --write`，它会**重排整个源码树**的格式并阻断提交。

**2. 不要用 `git checkout -- .` 清理"已修改"**
仓库 `core.autocrlf=true`。biome 改写换行符后 `git status` 会显示数百个"已修改"，
但 `git diff` 为空（内容并未改变）。此时执行 `git checkout -- .` 会**连未提交的改动一起还原**。

## 发行

发布形态**只做便携 ZIP**。NSIS 安装包会被 Windows Defender 误报为
`Trojan:Script/Conteban.A!ml`，请勿使用。

    HumengMap-1.154.0-win-x64-portable.zip

## 授权

本项目基于上游 Azgaar's Fantasy Map Generator（MIT）二次开发。
中文语料与界面措辞取材自幻艺地图（fantcraft.com），仅供个人学习与研究使用。
