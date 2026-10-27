# 幻梦地图生成器 · HuanMeng Map Creator

基于 [Azgaar's Fantasy Map Generator](https://github.com/Azgaar/Fantasy-Map-Generator) 的中文奇幻地图生成与编辑工具，面向小说作者、桌游主持人与世界观创作者。

[下载最新版](https://github.com/RZOZY/huanmeng-map-creator/releases/latest) · [反馈问题](https://github.com/RZOZY/huanmeng-map-creator/issues) · [上游说明](README-upstream.md)

## 可以做什么

- 生成并编辑地形、河湖、国家、省份、聚落、文化与宗教。
- 使用武侠、仙侠、玄幻、神话等中文语料生成名称。
- 调整图层、标签、标记与样式，添加地点笔记。
- 保存可继续编辑的 `.map` 地图，导出 SVG、PNG 等图像。
- 使用中文界面、命令搜索与 Electron 桌面窗口。

## 下载与运行

1. 在 [Releases](https://github.com/RZOZY/huanmeng-map-creator/releases) 下载 `HuanMengMap-<版本>-win-x64-portable.zip`。
2. 完整解压到可写目录，运行 `HuanMeng Map Creator.exe`，不要直接在压缩包内运行。
3. 更新前另存自己的 `.map`，将新版解压到新目录；不要覆盖唯一的地图备份。

目前发布 **Windows x64 便携 ZIP**，无需安装。其他平台与架构以发布页实际文件为准。
遇到安全提示时请核对来源与发布说明；无法确认来源或签名时不要运行。

## 基本使用

1. 新建地图并选择地形与生成参数，或加载已有 `.map`。
2. 显示所需图层，点击地图对象编辑名称、外观和设定。
3. 定期另存 `.map`；需要分享图片时再导出 SVG 或 PNG。

图片不能代替地图存档。跨浏览器或桌面端迁移时，请使用 `.map`，不要依赖暂存数据。

## 当前限制

- 中文化仍在完善，部分界面、外部网页和系统提示可能保留原文。
- 外部资源和联网功能需要网络，完整离线流程尚未验收。
- 便携版使用发布页手动更新，不承诺自动下载或安装更新。
- 世界／局部图集属于实验功能，不附带已验收的正式图集；精确未保存检测和未保存编辑的无损恢复尚未完成。
- 大型地图可能消耗较多内存和载入时间。重要修改前请备份。

## 开发

需要 **Node.js 24 或更新版本**：

```sh
npm ci
npm run dev                 # 浏览器开发
npm run electron            # 桌面开发
npm run electron build      # 桌面编译与类型检查
npm run test:all             # 普通、Electron mock 与脚本测试
npm run package:portable     # Windows x64 便携目录，不发布、不生成安装器
```

Web 构建使用 `npm run build`。发布步骤见 [便携版发布指南](docs/development/release-guide.md)。
改动前阅读 [项目约定](AGENTS.md)、[项目上下文](CONTEXT.md) 和 [架构说明](docs/architecture/architecture.md)。
已验范围与限制见 [开发记录](docs/development/localized-atlas-roadmap.md)，本次清理及新包验收见 [0.8.0 审计记录](docs/development/redundancy-audit-080.md)。Playwright 按需单独运行，不自动执行。

## 授权与来源

- **RZOZY** 二次开发；上游引擎与原版权声明遵循 [MIT License](LICENSE)。
- 中文语料、界面措辞与命名模板取材于 [幻艺地图](https://fantcraft.com/fmg/)，该部分仅供个人学习与研究，不因上游 MIT 自动获得其他用途授权。
- Watabou 等第三方素材保留各自署名和许可边界。SVG 中原有的 `<desc>` 署名应随修改和分发保留。
