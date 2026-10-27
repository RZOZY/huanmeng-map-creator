# 本地汉化覆盖与用户数据边界

状态：2026-10-27，桌面下载提示拥有者源端中文及有限回归完成；首启／版本公告等按各阶段记录。这里是逐面域台账，不是全应用完成率。源端文案、词典命中、单测、真实桌面、系统窗口、离线与导出分别验收；扫描不到英文不等于语义正确。

## 当前变更的验收

- [下载提示阶段完整门禁](<D:/DSH工作区/小说世界搭建/_run/map-next-20261027/phase18/complete.log>)：普通2985通过／13跳过、Electron23、脚本52、TypeScript、580源Biome、diff、构建及5资源戳绿。[44项真实模块](<D:/fmg-cn/dreammap/src/services/app-offer.test.ts>)覆盖owned中文、推荐启发式与原六格式／URL／版本／大小／真实this关闭；[开发态实际renderer12项](<D:/DSH工作区/小说世界搭建/_run/map-next-20261027/phase18/app-offer-native-v2.json>)仅受控fetch／UA及实际服务／按钮。首轮11场景过而严格整体失败仍保留，同断言只完整复跑一次，不是稳定性／真实发布／资产下载／签名／安装／更新／离线或实际机型保证；详见[范围合同](<D:/fmg-cn/dreammap/docs/development/desktop-offer.md>)。
- [版本公告阶段完整门禁](<D:/DSH工作区/小说世界搭建/_run/map-next-20261027/phase16/complete-final.log>)：普通2923通过／13跳过、Electron23、脚本52，TypeScript、577源Biome、diff、Electron构建和5资源戳绿。[21项模块回归](<D:/fmg-cn/dreammap/src/services/versioning.ui.test.ts>)保留原版本比较／6000ms／存储与清理顺序；源码／反馈链接仅修为已核对origin。首启准确说明当前版本，Electron“重新载入”与Web“清理缓存并重新载入”区分原有后端，关闭不添加永久禁用键。
- [版本公告阶段构建16项实际桌面](<D:/DSH工作区/小说世界搭建/_run/map-next-20261027/phase16/version-ui-native-v2.json>)核对`index-CG2BbG5g.js`的真实首启／旧minor／patch、DOM关闭及实际鼠标重载、声明用户源／抽样引用／受监测reload0枚举；没有实际Web清缓存、精确时长、连续可见性、OS或完整无损声明。[首轮失败](<D:/DSH工作区/小说世界搭建/_run/map-next-20261027/phase16/version-ui-native.json>)和既有Electron内部启动错误仍保留，不由重跑通过声称已修；完整边界见[公告合同](<D:/fmg-cn/dreammap/docs/development/version-announcement.md>)。
- [About阶段历史完整门禁](<D:/DSH工作区/小说世界搭建/_run/map-next-20261027/phase13/complete.log>)：普通2888通过／13跳过、Electron23、脚本52，TypeScript、575源Biome、diff、桌面构建及5个资源标记绿。About自有正文／资源标签／确认的[23项模块用例](<D:/fmg-cn/dreammap/src/components/app-info.test.ts>)保14个原URL／target／rel、品牌、用户源和实际关闭回调；不是运行时全文替换。
- [About阶段历史实际24项](<D:/DSH工作区/小说世界搭建/_run/map-next-20261027/phase13/app-info-native-v2.json>)在新`entry=index-BkGDhIp8.js`走真实中文Omnibar命令、确认关闭／重开、14链接／声明用户源／抽样模型保持，最终异常及error console数组为空；未访问外链，不冒称OS、任意用户DOM或完整模型无损。[首轮失败](<D:/DSH工作区/小说世界搭建/_run/map-next-20261027/phase13/app-info-native.json>)的helper全局seed假定和Electron内部preload startupData错误仍保留，后者尚未定位，不能由重跑通过声称修好。默认参数[性能基线](<D:/fmg-cn/dreammap/docs/development/default-performance-baseline.md>)另属先前构建，非本次汉化收益。
- [8.12历史推送后修复完整门禁](<D:/DSH工作区/小说世界搭建/_run/map-next-20261027/push-followup/complete-river-final.log>)：普通测试2871通过、13跳过；独立Electron mock 23、脚本52；TypeScript、575个源文件Biome、classic脚本语法、差异、桌面构建与5个资源标记通过。没有自动运行Playwright。
- [8.12历史构建19项实际桌面](<D:/DSH工作区/小说世界搭建/_run/map-next-20261027/push-followup/native-river-smoke.json>)验证高度图窗口标题／三个按钮／破坏性提示和实际取消、机器tool ID保留；另验标签跨图迟到写入、取消重开、Shift，以及手工建河接管退休旧回调且新handler仍能选格／绘polygon。`index-MmxAo0xy.js`的独立app页面受监测reload及其初始化期间未捕获异常／error console均为空，SW与CacheStorage枚举计数均0；bootstrap按`0e54a6ba`内容戳实际加载。只是该构建该场景，不把历史已知异常记录抹掉，也不代表完整浏览器PWA／离线或其他面域均已复验。
- [第11阶段历史构建十二组真实桌面回执](<D:/DSH工作区/小说世界搭建/_run/map-next-20261026/phase11-native-final-summary.json>)逐组通过：预览／URL／实际Quill保存源39、导航23、来源27、图片108、目录20、位置67、图集17、战斗224、离图20、预检27、保存16、缩放28。最后缩放组首轮仅因前组故意坏档诊断的pre-reload协议回放而拒绝；保留失败后原样复跑通过，未放宽断言或过滤当前异常。启动期既有ServiceWorkerRegistration InvalidStateError仍单列，不宣称零异常。候选有行为测试专用flag，不作为默认生产性能基线；实际命令见[现场记录](<D:/DSH工作区/小说世界搭建/_run/map-next-20261026/phase11-candidate-command.json>)。
- 第12阶段仅新增About帮助段及三链接源端中文：[6项真实模板测试](<D:/fmg-cn/dreammap/src/components/app-info.test.ts>)和[实际窗口](<D:/DSH工作区/小说世界搭建/_run/map-next-20261026/phase12/native-finalize.json>)验证URL／target／rel保留，未将其余完整About正文或外部网页判完成；[实际双图18项](<D:/DSH工作区/小说世界搭建/_run/map-next-20261026/phase12/atlas-native.json>)另验当前资产，不冒充上述十二面域在新构建全重跑。
- [实施纲领](<D:/fmg-cn/dreammap/docs/development/localized-atlas-roadmap.md>)保留各阶段数量、原始回执和未验边界。下面只归纳覆盖范围，不把mock与物理操作相加为“完成率”。

| 面域 | 已有覆盖 | 明确未通过／未验 |
|---|---|---|
| 原生菜单、退出、更新 | 中文模板、23项mock；Windows五个顶层菜单历史UIA观测 | 全部子菜单、OS退出／安装流程和其他平台；更新provider与发布链未启用 |
| 命令面板与检索 | 中文／英文／混合检索、真实Enter/Escape、稳定ID和动作 | 不代表全部编辑器文案审计 |
| 图例、删除／合并、特定国家／面积语境 | 自有模板与已有表单回归；用户条目不改 | 多种子／导出内容的完整矩阵 |
| 旅程与战斗 | 新默认内容、战果／阶段／增援UI；保留旧日志和机器键 | 动画、物理hover、像素与外链；其他动态商品提示待核 |
| 图标检索、位置与图片错误 | 228个已知标题、中英混合索引；位置Apply/Cancel；图片失败入口 | emoji／聚落／纹章单图名、实际上传／解码、跨域Fit、物理拖拽及持久化 |
| URL与分块导出入口 | 既有6项exact词条及URL／值／属性保护；真实提示、标题、无效URL、分块按钮 | 实际下载、有效远程URL／CORS、剪贴板权限和web-only云入口 |
| 笔记UI与用户内容 | 链接提示／占位；实际Quill＋运行时translator组合回归；用户内容不回写 | 富文本其余工具栏的完整审计；不是任意HTML、全部编辑器全站保证 |
| SVG源与SVG界面 | 原图、图标定义／symbol及位置预览源保持；普通UI SVG仍翻译 | 不是SVG安全净化，也不验证外部资源 |
| 图集目录、来源与导航提示 | 原生modal中文、来源／缺失／漂移／取消／隔离反馈 | 精确dirty、无损恢复和持久注册并未实现 |
| 保存、帮助、导览、About、错误和离线 | 自有保存说明及部分错误；About弹窗自有正文／资源标签／确认源端中文，23项模块及历史24项实际窗口保14个URL／target／rel | 真实OS picker、AboutTab／导览／外部网页、断网／离线、底层全部错误仍待验；既有Electron内部preload错误尚未定位 |
| 首启／版本公告 | 拥有者标题／正文／按钮／patch提示中文，限定修origin；21项真实模块、该阶段构建16项实际Electron检查；版本／6000ms／onclick／用户源保留 | 两平台清理后端主要为mock；实际Web清理／离页／恢复、AppOffer真实发布／下载／安装链未验；无保存确认，原清理拒绝仍阻止reload |
| 桌面版下载提示 | 拥有者标题／loading／手持／推荐／失败／迁移／安全说明中文、核对origin，44模块及12项受控fetch／UA实际renderer；保六URL／target／版本／大小及实际关闭 | 首轮内部启动错误未定位；真实发布／下载／签名／安装／更新、机型和离线未验，shared-alert晚结果与远端HTML净化未审 |
| 高度图选择器 | 自有标题／三按钮／选项／提示和确认源端中文；11项真实模块测试及当前实际窗口取消；用户模板名／配色值／机器ID保留 | 实际擦除确认后的完整编辑、OS焦点／Escape与其余高度图编辑器未据此验收 |
| 启动缓存清理 | 自有异步诊断中文；22项真实classic脚本VM用例、内容戳与历史app受监测reload的0枚举／0未捕获异常 | 浏览器正常路径／拒绝路径主要为VM；真实浏览器reload抢占、完整离线／PWA升级未验 |
| CSV与其他输出 | 机器字段和兼容格式保持 | 中文阅读导出方案及全部输出文案未完成 |

## 必须保护的数据源

[运行时遍历器](<D:/fmg-cn/dreammap/src/i18n/translator.ts>)先检查源边界，再处理属性和文本：

- 地图SVG、独立图标定义、symbol和位置预览的用户图形，不因恰好命中词典而改写。
- Quill编辑源（包括readonly）、笔记展示／实体名称／选择项、显式`data-i18n-skip`源和实际contenteditable编辑源，不触发翻译DOM mutation。普通`contenteditable="false"`界面和相邻工具栏不因此全面禁译。
- 输入值、URL、机器ID和动作不作为翻译目标。此处是已声明／已覆盖的源边界，不承诺自动识别任意用户HTML。

第11阶段B审查找到实际数据损坏反例：用户笔记`<p>Download</p>`被全局词条改为中文，Quill将DOM mutation视为USER输入，继而调用Notes.set回写地图。新增[真实Quill组合测试](<D:/fmg-cn/dreammap/src/controllers/notes-editor.test.ts>)先红后绿，等待两次RAF及MutationObserver，核对Notes.get、编辑DOM、getEditorHtml、展示与名称；[遍历边界测试](<D:/fmg-cn/dreammap/src/i18n/translator.test.ts>)同时验证相邻UI仍翻译。[定向91项回执](<D:/DSH工作区/小说世界搭建/_run/map-next-20261026/phase11-note-green.log>)已通过。

## 后续关闭条件

每个新发现先定位其拥有者和用户数据边界，再选源端文案或精确词条；需保留原ID、格式与用户原文。修复后运行相应真实模板／行为测试，并将桌面、输出、异常、离线及OS专属证据分别回填。当前不据此启用更新、发布、替换便携版或宣称100%汉化。
