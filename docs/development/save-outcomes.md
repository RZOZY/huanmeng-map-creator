# 保存回执与离图边界

接口见 [保存命令](<D:/fmg-cn/dreammap/src/services/io/save.ts>)、[文件写入](<D:/fmg-cn/dreammap/src/services/io/save-to-file.ts>) 和 [纯离图决策](<D:/fmg-cn/dreammap/src/services/atlas/departure.ts>)。

## 保存命令

`Save.toMachine(saveAs?)`、`Save.toStorage()`、`Save.toDropbox()` 均返回 `Promise<MapSaveOutcome>`；失败以结果返回，保留原始 `error` 引用。

| 结果 | 已确认的事实 | 不能据此推断 |
| --- | --- | --- |
| `saved` | 本次文件快照的 `write` 和 `close` 完成 | 关闭前后发生的普通编辑也已保存 |
| `stored(browser)` | 当前快照的 IndexedDB 事务提交完成 | 当前模型在等待期间没有变化 |
| `stored(dropbox)` | 云端上传调用成功返回 | 当前模型未晚改，或另一台机器已同步 |
| `downloaded-fallback` | 已发起下载 | 文件已写盘、用户已确认下载完成 |
| `cancelled` | 用户中止文件 picker | 一切非成功都属于用户取消 |
| `busy` | 另一项 IO 操作持有租约，本次未开始 | 可以排队后自动丢弃当前图 |
| `rejected` | 当前处于编辑模式或模型隔离状态 | 可以写入恢复副本绕过保护 |
| `invalidated` | 保存目标所属地图 epoch 已变化 | 已写出的较早快照不存在 |
| `failed` | 本次持久化步骤失败 | 可以吞掉错误或自动关闭当前图 |

文件 picker、权限、写入和关闭期间持有同一租约；浏览器暂存和云上传持有各自操作的租约直到适配器结果 settle。IndexedDB 成功等待事务提交；错误可在 request/transaction error 时提前拒绝，不能声称失败租约一直持有到后续 abort 事件。

序列化前再检查模型稳定性与编辑模式，防止等待 picker／权限时进入编辑模式仍写入载荷。普通编辑尚未统一纳入修订计数或编辑锁，因此回执只证明当时快照，不是“当前图已无未保存修改”的证明。

提示和重试属于独立副作用：提示异常不改变主结果；重试产生新的回执，不修改第一次错误及其引用。下载回退文案不再称“已保存”。

## 离图纯策略

`decideMapDeparture(intent, state)` 不访问 DOM、不保存、不载图。

- 取消、忙、模型不稳定、编辑模式均留在当前图。
- 所有保存回执都不会自动允许离图；成功回执也只得到 `stay / saved-snapshot-only`。
- 用户明确放弃只得到 `discard-requested`，它不是可缓存的替换许可。
- 尚未实现导航 UI、可靠 dirty／编辑修订、独立目标预检、采用前同步核验、失败无损恢复及视野返回。未来接入时必须重新审查这些边界，不得把该纯策略当成完整事务。

## 兼容与验证

- IndexedDB 保留数据库 `d2`、对象仓库 `s`、`{key,value}` 记录及全局 `ldb` 接口；假值不再被误转为 `null`。
- 图标持久化按 attempt 对象处理失败与重试；旧请求的迟到拒绝不能清除较新成功标记。快捷暂存读取失败会提示并保留当前图。
- [全量门禁](<D:/DSH工作区/小说世界搭建/_run/map-next-20261026/save-outcomes-complete.log>)：普通单测 2205 通过、13 跳过；独立 Electron mock 23；脚本 52；TypeScript、544 个源文件 Biome、经典脚本语法和桌面构建通过。
- [真实候选 16 项验证](<D:/DSH工作区/小说世界搭建/_run/map-next-20261026/save-desktop-smoke.json>) 及 [重跑脚本](<D:/DSH工作区/小说世界搭建/_run/map-next-20261026/save-desktop-smoke.cjs>)：实际局部图加载、保存取消／待决关闭／晚改快照／编辑模式拒绝／独立重试／下载未确认；真实 IndexedDB 成功、假值往返、受控真实事务中止与重试；笔记五种伪元素最终 CSS 级联中文、用户英文和 URL 不变。picker／文件流为受控替身，下载点击被截获，不能据此声称真实 OS picker／磁盘文件落盘已验收。
- 验证使用独立候选用户目录，仅暂存验证副本，不修改磁盘原图；原局部图 SHA-256 前后一致。启动期已知 `ServiceWorkerRegistration InvalidStateError` 仍存在，相关验证运行期无新增未捕获异常。
- 保存 E2E 断言已与中文快照文案同步，并通过严格静态类型检查；未自动运行 Playwright。笔记富文本其他工具栏、其他动态面域、离线帮助和原生更新仍需后续审计。
