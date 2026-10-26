# 会话内当前图采用来源

状态：2026-10-26。采用来源底座与只读来源卡，不是导航、dirty 计数、地理有效性或持久化身份。

实现：[来源记录](<D:/fmg-cn/dreammap/src/services/atlas/identity.ts>)、[共同载入入口](<D:/fmg-cn/dreammap/src/services/io/load.ts>)、[项目面板](<D:/fmg-cn/dreammap/src/components/atlas-project.ts>)。依赖 [文件与活模型独立核验](<D:/fmg-cn/dreammap/docs/development/atlas-observation.md>)、[两阶段载入](<D:/fmg-cn/dreammap/docs/development/load-departure.md>) 和 [只读目录能力](<D:/fmg-cn/dreammap/docs/development/atlas-project-files.md>)。

## 记录的含义

- 只记录本会话通过专用图集入口、文件及实际采用模型核验、整个采用流程 fulfilled 的最近来源。字段为规范项目／地图 UUID、显示名称、地图类型、地理修订、原始输入 SHA-256 与 replacement epoch，均为冻结的 primitive；不持有 File、完整 manifest 或目录能力。
- 原始输入 SHA 是读取同一 ArrayBuffer 后的文件摘要，不是规范化后的活模型摘要。载入可能迁移、修复、规范化；此记录不能证明当前模型与原文件逐字相同，不能证明文件仍是磁盘最新版本。
- 记录只在模块会话内存中，刷新应用后消失；不加入 options、旧 `.map`、manifest 或磁盘。保存／另存、名称相同或只选中目录都不建立来源身份。
- replacement epoch 是模型替换栅栏，不是持久 UUID、编辑修订、保存版本或 dirty 计数。普通编辑可不改变它；例如直接重算坐标的编辑仍须在将来导航前重新观测，不能因本记录存在而视为地理有效。

## 发布、并发和失效

1. 仍使用原有共同 `runMapLoad` API、同一 IO 租约和真实两阶段确认。预检或最终确认前失败／取消，没有开始替换，旧来源保留。
2. 协调器先标记模型 unstable 并推进 epoch，然后 `beforeAdopt` 捕获此轮 expected epoch，才发既有 `map:replacing`。prepared adopt 必须等待整个 `parseLoadedData` fulfilled 才产生候选；发布模型事件或文件预检通过还不够。
3. 共同入口 `await runMapLoad` 返回 loaded 后，在结果反馈／callback 的下一次 await 之前，同栈核对 stable 与捕获的 expected epoch。只有二者仍匹配才写来源。不能在此重采样较新 epoch 来给旧候选背书。
4. 因租约在协调器 finally 释放，新 B 可能在 A 的 caller continuation 前采用；A 此时拒绝发布，不覆盖 B，不清 B，也不把 A 已完成的 loaded 改为 failed 或隔离 B。A callback 较晚完成也不再次写来源。若 B 只在准备期、尚未 replacing，屏幕仍是 A，A 来源仍可正确发布。
5. getter 每次以 stable／epoch 检查记录；不稳定或 epoch 不同返回 null 并丢弃旧来源。走既有替换门禁的普通载入、生成、重采样据此失效；本轮未新增所有变换入口的端到端联跑。
6. `map:generated` 的 `detail.mapId` 是旧创建时间戳，不是图集 UUID，也早于整个采用末尾；它既不写来源，也不作为本卡成功通知。log／finally 等末尾抛错不发布来源。采用后失败仍保留不稳定模型隔离，不冒称无损回滚；完整普通重载可恢复模型，但来源未知。

保存回执、`Options.persist` 和 loaded 仍不能互相替代：persist 可吞配额失败，图标持久化还可能异步；来源记录不是写盘凭据。源端字段不扩大现有 IO 事务的资源／首帧或持久化保证。

## 来源卡

- 从「打开图集项目目录」进入，来源卡与当前选中目录／表格完全分离。同 UUID 的另一个清单、hash、地理修订或 File 不能据此标为“当前精确文件”。显示名通过 bdi／textContent，UUID、修订与原始 SHA 明示，且附文件／地理／保存／导航限制。
- 打开、真实调用结算和「刷新采用来源」只读 getter；刷新不读取地图或重做地理核验。`map:replacing` 即时重读失效。面板关闭解绑监听并丢弃目录能力，但不清模块来源。
- 从面板之外调用 API 后，不假造提前的成功事件；可手动刷新或重开来源卡。仍沿用真实 upload settle 前整会话 busy，不能伪装取消不可中止的采用。

## 验证与限制

- 来源纯模块 **13 项**，真实共同载入图集 **28 项**（含原有 14 项）和面板 **26 项**（含原有 19 项）通过。覆盖旧 generated、末尾失败、普通替换、取消、前后观测失败、晚 callback、真实协调器 lease release→caller continuation 间 B 完整采用，以及含 A-F 大写 UUID 的专用入口。
- [完整门禁](<D:/DSH工作区/小说世界搭建/_run/map-next-20261026/identity-complete-review.txt>)：普通 **2657 通过、13 跳过**，独立 Electron mock **23**，脚本 **52**；TypeScript、563 个源文件 Biome、差异检查、桌面构建和资源标记检查通过。原始日志保留，readable 副本只解码并将 NUL 显式为 `\\0`，未改测试结果。未自动运行 Playwright；构建既有 classic-script 警告仍保留。
- 一次定向命令的 PowerShell `ErrorActionPreference=Stop` 把测试预期 stderr 当成 NativeCommandError 提前结束，日志没有测试结尾，TypeScript 尚未执行；保留该不完整日志。改用 Continue 加显式退出码与完整 stderr 捕获，169 项定向及 TypeScript 通过；随后补两项竞态／UUID测试并再次通过完整门禁，不将截断日志称作产品失败或成功。
- [真实候选来源检查](<D:/DSH工作区/小说世界搭建/_run/map-next-20261026/identity-desktop-smoke.json>) **27 项通过**，实际构建 `index-BDiNNoeX.js`。真实目录／双确认／实际采用／来源卡验证初末取消、同 UUID 异 hash／修订不冒认、受控慢准备、replacing／generated 时来源未知、完整结算后来源、含 A-F 大写 UUID、A callback 等待中 B 完整采用、普通替换失效，以及 focus 后校验失败不发布并隔离保存。完整重载恢复，原图 SHA 不变，已知 boot SW 异常原文单列，运行期无新增异常。
- 首次脚本重选目录时只等到旧 tbody 仍有两行，过早读取尚未就绪的新按钮而失败。[首次回执](<D:/DSH工作区/小说世界搭建/_run/map-next-20261026/identity-desktop-smoke-first-selection.json>)保留；仅将测试等待改为新清单读取计数／精确 rootName／新状态及行数共同就绪，再完整复跑，未改产品或放宽断言。
- 同一构建另跑图片入口 **108** 项并顺序复跑目录 **20**、位置 **67**、图集 **17**、战斗 **224**、离图 **20**、预检 **27**、保存／笔记 **16**，见 [九组汇总](<D:/DSH工作区/小说世界搭建/_run/map-next-20261026/identity-native-summary.txt>)。位置组曾因上一组成功提示仍活动而按预检安全停止；首次回执保留，只读等待提示自然结束后完整续跑，不清提示、不改计时器。受控文件／picker／callback 与 DOM 合成事件不是物理 OS 输入、落盘或自然慢磁盘性能证明。
- 本卡不是项目目录的持久注册、导航／返回视野、轻量世界、精确 dirty 或无损恢复；正式项目尚无清单，不把私有测试复制件当作分层地图交付。采用来源之后如要导航，仍须重新持有正确文件能力、完成独立活模型观测和离图最终门禁。
