# 载图确认与最后同步采用门禁

状态：2026-10-26。当前单图 IO 的保守离图保护，不是世界／局部导航，也不是精确 dirty 检测。

接口见 [共同载入入口](<D:/fmg-cn/dreammap/src/services/io/load.ts>)、[采用协调器](<D:/fmg-cn/dreammap/src/services/io/load-operation.ts>)、[原生 HTML 对话框](<D:/fmg-cn/dreammap/src/services/io/load-confirmation.ts>) 与 [保存回执](<D:/fmg-cn/dreammap/docs/development/save-outcomes.md>)。

## 两阶段确认

1. 本地文件、URL、云端选择和浏览器暂存共用同一入口及 IO 租约；有当前模型时一律先询问，不再按最近打开时间跳过。没有当前模型的内部启动载入不询问，不提供公开 skip 参数。
2. 初次可选「取消，保留当前地图」「另存副本并停留」「准备读取目标」。取消不读取目标，不关闭当前编辑器，不使保存目标失效。
3. 另存分支同一点击内先关闭自己的对话框、同步释放本次载入租约，再直接调用静态 `Save.toMachine(true)`。不在 picker 前插入 await。所有保存回执均停留，包括快照成功、下载回退和取消；不会继续读取或切图。
4. 只有选择准备读取后，才调用 provider，进行解码、版本与 [结构／SVG 预检](<D:/fmg-cn/dreammap/docs/development/map-preflight.md>)，并预载迁移和样式模块。此时仍未采用目标；最终取消可能已经读过目标，但保留当前模型。
5. 最终必须明确选择「放弃当前修改并采用目标」。点击内禁用两按钮、保持原生 modal，然后直接同步调用 `controls.start()`；不缓存 boolean 许可后再 await。真实采用的首次修改前不再异步导入模块或走 lazy 样式调用。

初次与最终使用独立的原生 HTML dialog，不进入现有 jQuery 编辑器关闭集合。初次 Escape／原生 close 视为取消；开始采用后 Escape 不得取消、双击不得重复采用。采用期间保持 modal，完成后清理并释放租约。UI 初始化失败闭合；反馈或清理错误不能覆盖主结果。

## 一次性协调与隔离

- `start` 内同步重读本人租约、模型 epoch、稳定状态和当前编辑模式，先锁定 pending→adopting，再标记不稳定、发替换事件并调用实际采用。
- prepare 取消只能释放本人的租约，过期回调不能释放后续保存或载图的租约。最终 start/cancel 一次性；start 之后 cancel 不改结果。
- authorize 若在启动采用后抛错，不能提前返回或释放租约；真实采用 Promise 独占最终结果，直到 settle。cleanup 异常不盖掉原结果。
- 已隔离的混合模型可重新载入完整图恢复；取消或失败不能洗白。初次另存按钮在隔离时禁用。采用失败仍可能留下混合模型，继续隔离保存，不承诺恢复未另存编辑。

## 模型 epoch 的限域

[模型状态](<D:/fmg-cn/dreammap/src/services/io/model-status.ts>) 的 epoch 仅在开始模型替换时增加，不是编辑计数、dirty 位或地图永久身份。

[样式入口](<D:/fmg-cn/dreammap/src/controllers/style-preset.ts>) 在请求前采样 epoch、await 后且写入 options／持久化／样式前重检；旧样式确认及迟到提示也检查。覆盖已确认的跨图迟到样式写入，但不覆盖整个 lazy registry 中尚未进入方法的旧调用，也不是对全部异步编辑的隔离保证。

## 验证与未完成

- 定向 **139 项**通过：协调器 34、IO 租约 9、模型状态 3、原生对话框逻辑 14、共同入口 70、样式竞态 9。jsdom 的原生方法替身只验证逻辑，不代替真实 modal／activation 验收。
- [完整门禁](<D:/DSH工作区/小说世界搭建/_run/map-next-20261026/departure-complete.log>)：普通 **2480 通过、13 跳过**，独立 Electron mock **23**，脚本 **52**；TypeScript、552 个源文件 Biome、差异检查、桌面构建与静态资源标记检查通过。未自动运行 Playwright。
- [20 项真实候选验证](<D:/DSH工作区/小说世界搭建/_run/map-next-20261026/departure-desktop-smoke.json>)及[重跑脚本](<D:/DSH工作区/小说世界搭建/_run/map-next-20261026/departure-desktop-smoke.cjs>)通过：实际刷新到当前构建，真实 modal 与底层鼠标隔离、两阶段真实 Escape、四类来源取消零读取、同栈受控 picker、另存成功／取消都停留、最终编辑模式复核、实际 Grid 采用在点击返回前开始。图标选择器中文显示／混合检索／原始 ID 回调也通过。
- 同一候选顺序复跑既有 **27 项预检**及 **16 项保存／笔记**桌面检查，均通过；旧脚本仅在测试端明确点击两次确认，没有新增生产绕过入口。文件 picker／流使用受控替身，不证明 OS 窗口或真实落盘；原图及三个旧档 fixture 磁盘 SHA-256 不变。启动期既有 ServiceWorkerRegistration InvalidStateError 仍在，相关运行阶段无新增未捕获异常。
- 可靠编辑修订、地图与 manifest 快照核对、无损失败恢复、世界→局部→返回及视野还原仍未完成。保存旧快照、通过预检或用户初次选择准备，都不是自动丢弃当前图的许可。
