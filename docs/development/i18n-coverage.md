# 本地汉化覆盖与用户数据边界

状态：2026-10-27，第11阶段。这里是逐面域台账，不是全应用完成率。源端文案、词典命中、单测、真实桌面、系统窗口、离线与导出分别验收；扫描不到英文不等于语义正确。

## 当前变更的验收

- [完整门禁](<D:/DSH工作区/小说世界搭建/_run/map-next-20261026/phase11-final-complete.log>)：普通测试2817通过、13跳过；独立Electron mock 23、脚本52；TypeScript、572个源文件Biome、差异、桌面构建与资源标记通过。没有自动运行Playwright。
- [当前构建十二组真实桌面回执](<D:/DSH工作区/小说世界搭建/_run/map-next-20261026/phase11-native-final-summary.json>)逐组通过：预览／URL／实际Quill保存源39、导航23、来源27、图片108、目录20、位置67、图集17、战斗224、离图20、预检27、保存16、缩放28。最后缩放组首轮仅因前组故意坏档诊断的pre-reload协议回放而拒绝；保留失败后原样复跑通过，未放宽断言或过滤当前异常。启动期既有ServiceWorkerRegistration InvalidStateError仍单列，不宣称零异常。候选有行为测试专用flag，不作为默认生产性能基线；实际命令见[现场记录](<D:/DSH工作区/小说世界搭建/_run/map-next-20261026/phase11-candidate-command.json>)。
- [实施纲领](<D:/fmg-cn/dreammap/docs/development/localized-atlas-roadmap.md>)保留各阶段数量、原始回执和未验边界。下面只归纳覆盖范围，不把mock与物理操作相加为“完成率”。

| 面域 | 已有覆盖 | 明确未通过／未验 |
|---|---|---|
| 原生菜单、退出、更新 | 中文模板、23项mock；Windows五个顶层菜单历史UIA观测 | 全部子菜单、OS退出／安装流程和其他平台；更新provider与发布链未启用 |
| 命令面板与检索 | 中文／英文／混合检索、真实Enter/Escape、稳定ID和动作 | 不代表全部编辑器文案审计 |
| 图例、删除／合并、特定国家／面积语境 | 自有模板与已有表单回归；用户条目不改 | 多种子／导出内容的完整矩阵 |
| 旅程与战斗 | 新默认内容、战果／阶段／增援UI；保留旧日志和机器键 | 动画、物理hover、像素与外链；其他动态商品提示待核 |
| 图标检索、位置与图片错误 | 228个已知标题、中英混合索引；位置Apply/Cancel；图片失败入口 | emoji／聚落／纹章单图名、实际上传／解码、跨域Fit、物理拖拽及持久化 |
| URL与分块导出入口 | 本轮6项exact词条及URL／值／属性保护；真实提示、标题、无效URL、分块按钮 | 实际下载、有效远程URL／CORS、剪贴板权限和web-only云入口 |
| 笔记UI与用户内容 | 链接提示／占位；实际Quill＋运行时translator组合回归；用户内容不回写 | 富文本其余工具栏的完整审计；不是任意HTML、全部编辑器全站保证 |
| SVG源与SVG界面 | 原图、图标定义／symbol及位置预览源保持；普通UI SVG仍翻译 | 不是SVG安全净化，也不验证外部资源 |
| 图集目录、来源与导航提示 | 原生modal中文、来源／缺失／漂移／取消／隔离反馈 | 精确dirty、无损恢复和持久注册并未实现 |
| 保存、帮助、导览、About、错误和离线 | 自有保存说明及部分错误已修 | 真实OS picker、导览／About完整流程、断网／离线、底层全部错误仍待验 |
| CSV与其他输出 | 机器字段和兼容格式保持 | 中文阅读导出方案及全部输出文案未完成 |

## 必须保护的数据源

[运行时遍历器](<D:/fmg-cn/dreammap/src/i18n/translator.ts>)先检查源边界，再处理属性和文本：

- 地图SVG、独立图标定义、symbol和位置预览的用户图形，不因恰好命中词典而改写。
- Quill编辑源（包括readonly）、笔记展示／实体名称／选择项、显式`data-i18n-skip`源和实际contenteditable编辑源，不触发翻译DOM mutation。普通`contenteditable="false"`界面和相邻工具栏不因此全面禁译。
- 输入值、URL、机器ID和动作不作为翻译目标。此处是已声明／已覆盖的源边界，不承诺自动识别任意用户HTML。

本轮B审查找到实际数据损坏反例：用户笔记`<p>Download</p>`被全局词条改为中文，Quill将DOM mutation视为USER输入，继而调用Notes.set回写地图。新增[真实Quill组合测试](<D:/fmg-cn/dreammap/src/controllers/notes-editor.test.ts>)先红后绿，等待两次RAF及MutationObserver，核对Notes.get、编辑DOM、getEditorHtml、展示与名称；[遍历边界测试](<D:/fmg-cn/dreammap/src/i18n/translator.test.ts>)同时验证相邻UI仍翻译。[定向91项回执](<D:/DSH工作区/小说世界搭建/_run/map-next-20261026/phase11-note-green.log>)已通过。

## 后续关闭条件

每个新发现先定位其拥有者和用户数据边界，再选源端文案或精确词条；需保留原ID、格式与用户原文。修复后运行相应真实模板／行为测试，并将桌面、输出、异常、离线及OS专属证据分别回填。当前不据此启用更新、发布、替换便携版或宣称100%汉化。
