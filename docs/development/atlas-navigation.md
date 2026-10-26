# 会话内图集导航与返回视野

状态：2026-10-27。已接项目面板、真实文件载入和视野端口，并完成本阶段串行真实回归；不是轻量世界图、dirty 计数、模型缓存或无损恢复。

实现：[规划](<D:/fmg-cn/dreammap/src/services/atlas/navigation-plan.ts>)、[会话](<D:/fmg-cn/dreammap/src/services/atlas/navigation-session.ts>)、[实际端口](<D:/fmg-cn/dreammap/src/components/atlas-navigation-ports.ts>)、[面板](<D:/fmg-cn/dreammap/src/components/atlas-project.ts>)、[专属载入回执](<D:/fmg-cn/dreammap/src/services/io/load.ts>)、[缩放归属](<D:/fmg-cn/dreammap/src/components/zoom.ts>)。前置合同：[目录能力](<D:/fmg-cn/dreammap/docs/development/atlas-project-files.md>)、[采用来源](<D:/fmg-cn/dreammap/docs/development/atlas-identity.md>)、[独立文件／活模型观测](<D:/fmg-cn/dreammap/docs/development/atlas-observation.md>)、[离图确认](<D:/fmg-cn/dreammap/docs/development/load-departure.md>)。

## 入口与持有范围

- 从「打开图集项目目录」选择实际 FileList。先「核验并打开」建立本会话采用来源，再按地点 UUID 选择「进入局部」「转到世界」或「返回上一视野」。同名地点显示经纬度与完整 UUID，用户文本仅作为 textContent。
- 纯规划只用经纬／声明选择世界或优先局部，并计算目标模型像素。它不证明文件存在、地理有效或载入成功；优先目标缺文件明确阻断，不降级为同名／低详情地图，不共用 cell 索引。
- 会话只持当前所选 File 能力、清单和最多 64 个 primitive 历史项：地图 UUID、原始文件 SHA、地理修订、模型空间视窗中心与缩放。没有图形／网格／SVG 快照缓存。
- 「收起并看地图」解除原生 modal，保留当前项目／历史以操作地图后重开；旧 close task 不释放迅速重开的面板。「关闭并释放」或更换目录丢弃能力与历史，不伪造清除实际采用来源。实际上传结算前整会话 busy，不能关闭／重选／收起／重复导航；不可中止的采用没有伪取消。

## 采用回执与两侧门禁

1. 起点须有匹配所选项目／地图 UUID、类型、SHA、地理修订和本次 epoch 的采用来源；源、目标都须有精确 asset.path 映射的 File。以当前真实 graph／坐标和 pack 对象重新独立观测源图，不能只信来源卡、旧事件或元数据徽标。
2. 真实载入继续使用同一 IO 租约与初／末确认。最终采用开始前同步执行 `canAdopt`：重验源模型，停止缩放动画并捕获模型空间中心，再次重验源模型。只有该调用仍授权、epoch／stable 仍匹配，才允许既有协调器标记 unstable 并推进替换 epoch。取消／前置失败／guard false 或 throw 不提交历史，也不预先破坏旧模型。
3. `uploadAtlasMapWithReceipt(file, manifestJSON, mapId, navigation?)` 返回外层冻结 `{outcome, replacementEpoch}`。token 只取本调用整个采用 fulfilled 后的 candidate epoch；非 loaded 为 null。不能 await 普通上传后采当前 epoch 充当本次 token。若 A 释放租约后 B 先采用，A 仍诚实返回 A 的旧 token，不改写 B 来源或谎报 A 未完成。
4. 只有专属导航选项存在时跳过旧 URL `focusOn`，防止旧 `?cell`／`?burg` 索引或 MFCG 副作用作用于另一图；普通／旧图集打开保留其既有语义。文件原始字节、detached SVG 与采用模型的核验仍执行，不能为导航绕开预检。
5. loaded 不等于导航成功。会话还要核对 call-bound token、当前来源／stable／epoch，随后在**无 await 的同一调用栈**依次重新观测目标、同步 `zoomTo(..., 0)`、再观测并核对目标。只有全通过才 push／pop 历史并返回 moved。
6. 视野处理前的 token／目标门禁失配返回 stale；已采用后的视野处理失败，含同步 apply 内发生替换，返回 view-failed，明确可能已经替换。不冒称回滚／仍在旧图，两类均不写返回记录。外部替换推进 epoch 后清空旧链。返回本身重读和核验历史地图，只有成功才消费该项，取消保留它。

## 缩放归属与视野限制

- `AtlasView` 是模型空间中心 `{x, y, scale}`，不是屏幕平移。捕获先停止动画／flush 待处理当前帧，按真实 viewport 宽高与平移反算中心。前往局部默认缩放 2、世界默认 1；返回使用已捕获视野，但仍受当前窗口大小和缩放界限约束，不承诺跨尺寸像素逐点相同。
- `map:replacing` 在旧根仍连接时独立 discard 缩放队列并 interrupt d3 未命名 transition。新根首帧强制同步；onZoom／end 和 RAF 都核对当前连接根及唯一 frame ticket。旧 A 回调不能写新 B 的共享 viewport／viewbox，也不能清掉 B 的新帧。
- 单纯设置新 B duration=0 或只在导航前比较 epoch 不够：真实 d3 反例曾在 A remove 后继续发 5 次 zoom，使共享 scale 从 B 的 2 漂到 8，而 B 节点仍是 2。本次修的是根归属与帧／动画生命周期，不是改变原有缩放算法或把全局旧 d3 与模块 d3 混用。

## 验证与未覆盖

- 纯规划 31、会话 62、实际端口 14；真实图集 IO 35、面板 35、真实 d3 缩放 20（含原 9）通过。六文件 166 项定向与 TypeScript 通过；唯一初次定向失败是测试用赋值覆盖只读但 configurable 的 dialog.close mock，改用 Object.defineProperty 后复验，不是产品关闭失败。
- [完整门禁](<D:/DSH工作区/小说世界搭建/_run/map-next-20261026/navigation-complete-review.txt>)：普通 **2791 通过、13 跳过**，Electron mock **23**、脚本 **52**；TypeScript、570 文件 Biome、差异检查、Electron build 与资源标记检查通过。未自动 Playwright；既有 classic-script 构建警告保留。
- [真实导航](<D:/DSH工作区/小说世界搭建/_run/map-next-20261026/navigation-desktop-smoke.json>) **23/23**：精确 File、双阶段、起点与末确认漂移、实际锚居中、收起后 Chromium wheel、重开及重读世界／恢复视野、优先目标缺失不降级、采用后漂移 view-failed 均通过。复制件同模型不同 SHA，仅证明行为，不是正式轻量资产。原始世界视野 k=2.25、x=-3754.5、y=-2112 返回一致，局部实际锚 105.43E/38.2N 居中 k=2。
- [真实 d3 动画／替换](<D:/DSH工作区/小说世界搭建/_run/map-next-20261026/zoom-desktop-smoke.json>)：未命名 A transition 确实运行中才确认整图替换；旧根尚连接时被 interrupt，B 同步 k=2，超过旧动画 2000ms 后 DOM 与 __zoom 仍一致。公开 Save 懒加载 facade 是 async，首次 helper 漏 await 的失败原样保留，修 helper 后才通过；不是产品保存失败。
- 实际输入候选使用独立 9334/profile 和三个禁后台遮挡测试 flag；只用于行为证据，不是默认生产启动或性能基线。旧候选 hidden、真实 RAF 不返、Input.dispatchMouseEvent 超时的回执保留，未改缩放代码绕过。已知 boot/pre-reload 回放的精确 SW InvalidStateError 单列，不豁免当前运行期同错或其他异常。所有原始地图磁盘 SHA 不变；完整重载恢复不等于未存编辑回滚。
- 合并坐标预览、六项字典及SVG／Quill用户源保护后，[最终完整门禁](<D:/DSH工作区/小说世界搭建/_run/map-next-20261026/phase11-final-complete.log>) **2817 通过、13 跳过**，Electron **23**、脚本 **52**，TypeScript、572源文件Biome、diff、Electron build及资源标记通过。[十二组当前构建回归](<D:/DSH工作区/小说世界搭建/_run/map-next-20261026/phase11-native-final-summary.json>)逐组通过；最后缩放组初次被前组故意坏档的pre-reload console回放拒绝，失败保留，原样续跑28/28通过，不修改生产代码或放宽异常断言。当前入口为`index-IrvWBKBq.js`。部分helper的启动flag元数据为历史预设，本次以[实际候选进程命令](<D:/DSH工作区/小说世界搭建/_run/map-next-20261026/phase11-candidate-command.json>)为准；这些flag只用于行为复验。
- 仍不保证精确 dirty、未存编辑恢复、磁盘最新文件、物理 OS picker、外部资源／离线、冷暖态／内存性能、全球跨日界线的原生导入。跨日界线数学规划支持不扩大现行文件观测端点限制。
- 正式项目尚无经过内容验收的轻量世界／局部图清单。私有测试复制件只验证 IO 与导航，不是国家地缘图／正式地图交付；原图只读，稳定前不推送、不替换用户便携版。
