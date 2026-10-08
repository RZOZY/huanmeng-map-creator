# 幻梦地图生成器（Humeng Map Generator）

以上游 Azgaar's Fantasy Map Generator **v1.154.0** 的引擎为核心的中文地图生成器。
**一次性本地化，不再跟随上游更新** —— 目的是让生成物完全贴合中文语料，不出现半英半中的乱语。

## 基线

- 上游提交：`354eeaa7 v1.154.0 (#1900)`
- 本仓库在此基线上做本地化，不合并上游后续提交
- 版本标签：`v1.154.0-cn.1`

## 本地化的三层

### 1. 语料层（核心）

生成内容的**唯一来源**，不走翻译。

    public/i18n/wordbanks/<题材>/{state,province,burg,culture,religion,river,lake,marker,zone,mapName,era,engine,manifest}.json

9 种题材（武侠 / 玄幻 / 共和 / 仙侠 / 神话 / 暗黑 / 高奇幻 / 默认 / 现代都市），合计 **18451 条**。
引擎按「读语料 → 提取词根 → 组合」生成，运行时由 `public/i18n/09-<题材>-engine.js` 调度。

### 2. 生成数据表

上游内嵌的英文词表，已在中文化：

| 文件 | 内容 |
|---|---|
| `src/data/markers.ts` | 标记语料整表：客栈 / 怪物 / 遗迹 / 遭遇战 / 洞穴 / 亡灵等 |
| `src/generators/biomes-generator.ts` | 生物群系 13 项 |
| `src/generators/goods-generator.ts` | 物资 71 项 |
| `src/generators/religions-generator.ts` | 宗教命名 327 词条 + 中文语序组合规则 |
| `src/generators/zones-generator.ts` | 区域命名 47 类型词，去掉英文形容词形态学 |

> **注意**：`CULTURE_TYPES`、`religion.type`（Folk/Organized/Heresy）、`zone` 的 `type` 字段是
> **代码标识符**，不是显示名，改动会破坏逻辑与类型检查。这类词只在显示层处理。

### 3. 界面层

- `src/i18n/zh-CN.json` —— 905 条界面英→中对照，整串精确匹配
- `src/i18n/translator.ts` —— 精确匹配 + 拼接型文案模式层
- `src/i18n/layer-names.ts` —— 图层名按 `data-layer` 整块替换（保留 `<u>` 快捷键下划线）
- `public/i18n/*.js` —— 补丁层，作为经典脚本在 `src/index.html` 按时序加载

## 建立版本回溯时的注意事项

- **提交务必加 `--no-verify`**：仓库的 pre-commit 钩子会跑 `biome check --write`，
  它会重排**整个源码树**的格式并阻断提交。
- 仓库 `core.autocrlf=true`：biome 改写换行符后 `git status` 会显示数百个"已修改"，
  但 `git diff` 为空（内容未变）。**不要用 `git checkout -- .` 清理**，会把未提交的改动一并还原。
- `release/`、`node_modules/`、`dist-electron/` 已在 `.gitignore` 中。

## 构建与发布

    npm.cmd run electron build      # 构建（tsc 类型检查 + vite build --mode electron）
    npm.cmd run electron -- dist --win --x64 --dir --publish never   # 打包便携版

发布形态**只做便携 ZIP**；NSIS 安装包会被 Windows Defender 误报为 `Trojan:Script/Conteban.A!ml`。
