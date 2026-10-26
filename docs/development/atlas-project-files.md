# 只读项目目录与 File 能力

状态：2026-10-26。本篇规定目录能力与打开面板；已接[会话内世界／局部导航及返回视野](<D:/fmg-cn/dreammap/docs/development/atlas-navigation.md>)。不改存档格式、不保存清单或地图，不承诺持久化身份。

实现：[目录适配](<D:/fmg-cn/dreammap/src/services/atlas/project-files.ts>)、[原生项目面板](<D:/fmg-cn/dreammap/src/components/atlas-project.ts>)；从 [载入窗](<D:/fmg-cn/dreammap/src/components/options/io-panes.ts>) 的「打开图集项目目录」进入。打开仍通过 [专用核验入口](<D:/fmg-cn/dreammap/docs/development/atlas-observation.md>) 与 [两阶段确认](<D:/fmg-cn/dreammap/docs/development/load-departure.md>)。

## 目录合同

- 只接受用户所选 FileList，先同步复制为 File 数组，再清 input；不读 `File.path`／fakepath，不用 Node fs、Electron IPC、fetch 或链接追踪补齐资产。
- 根清单固定为精确的 `atlas.json`。所有 `webkitRelativePath` 必须属于同一精确根，剥一段目录名后按完整相对路径匹配；`File.name` 必须等于路径叶名。不同目录同 basename 不混用，不按名称猜图。
- 全批 metadata 校验后，只读取根清单一次 ArrayBuffer，严格 UTF-8 解码并按 [清单合同](<D:/fmg-cn/dreammap/docs/development/atlas-manifest.md>) 解析、规范序列化、冻结会话快照。目录阶段不读取任何地图内容；每张地图保留原 File 引用，实际打开时再读同一能力。
- 最多 10000 个文件，清单最多 12000000 字节（清单解析另限 4000000 个 JS 字符），路径最多 4096 字符。拒畸形／多根／重复路径、危险段、控制／双向文本控制字符及不兼容 Windows 路径；case／NFC 碰撞仅用于拒绝歧义，不归一化后匹配、不 trim／decode／basename 回退。清单声明本身的歧义也拒绝。
- 缺少的文件仍列出但禁用；地理记录未核验也禁用。新的全缺失目录不借旧会话文件补齐。列出的「文件已选」不代表 SHA、地理或采用模型已核验。

这些是授权 File 集合内的精确匹配规则，不是 realpath／inode／symlink 沙箱、完整 Unicode casefold／视觉安全或实时磁盘保证。File 是本次能力快照；目录重选必须重新建立会话，不能假定旧对象等于磁盘最新内容。

## 会话、并发及反馈

- 每个原生 HTML dialog 独占 input。读清单期间允许重选或关闭；generation／closed 同时防迟到成功和失败，旧 input 撤销 handler、清值并移除。「收起并看地图」解除 modal 但保留当前能力／导航历史；「关闭并释放」或重选目录丢弃会话。旧 close task 不得清掉迅速重开的面板；释放引用不宣称物理中止 IO。
- 地图按钮按 UUID 找原 File 及冻结 manifest JSON。所有不可信名称／路径／错误使用 textContent，表格文本包在 bdi；不插入用户 HTML。
- 打开前同步 busy，锁目录选择、所有地图／导航、关闭／收起、Escape 和再次打开，直到真实 `Load.uploadAtlasMap` 或专属导航载入 settle。该 API 无外部 abort；不把忽略旧 Promise 伪装成取消采用。上层原生载图确认拥有取消／另存／最终放弃选择。
- 只有 `loaded` 显示「最近一次打开成功」，明确不代表后续编辑仍等于文件。busy／cancelled／rejected 分别反馈；failed 或调用异常提示当前模型可能混合并隔离，不能泛称原图未变或已回滚。必要时关闭面板查看底层详情、完整重载。
- 原生目录取消不一定发送空 change；单测的空 FileList 只证明该事件分支。未宣称已验证全部 OS 取消和键盘／像素布局行为。

## 第7轮验证与后续边界

- 纯目录 **30 项**与面板 **19 项**通过。面板测试保留真实目录解析，仅替换 Load 和 jsdom 原生 modal；覆盖慢 A／快 B、关闭再开／旧 input、所有载图回执、同步抛错／异步拒绝、同名 UUID、缺失未核验与不可信文本。
- [完整门禁](<D:/DSH工作区/小说世界搭建/_run/map-next-20261026/project-complete.log>)：普通 **2616 通过、13 跳过**，独立 Electron mock **23**，脚本 **52**；TypeScript、560 个源文件 Biome、差异检查、桌面构建及资源标记检查通过。未自动运行 Playwright。
- [真实候选目录与双层 modal](<D:/DSH工作区/小说世界搭建/_run/map-next-20261026/project-desktop-smoke.json>) **20 项通过**，刷新到 `index-noh6BmV4.js`。CDP 注入真实目录取得原生相对路径，选择只读一次清单／零地图读取；缺失和未核验禁用；同 basename 的局部文件具有不同 SHA，仍按 UUID 精确取原 File，经真实双阶段及发布前核验采用一次。初次／最终 Escape、另存取消、慢读取锁会话、迟到清单和关闭重开均通过。完整重载恢复，原图 SHA 不变；原生 OS 选择器／全部取消事件和自然慢磁盘性能未验证。
- 首次夹具误把 local.parent 写成 UUID 字符串，被清单解析正确拒绝；[首次失败](<D:/DSH工作区/小说世界搭建/_run/map-next-20261026/project-desktop-smoke-invalid-parent.json>) 原样保留。只改测试父引用为 `{mapId,geographicRevision}`，复跑才通过，未因此放宽产品验证。
- 目录和清单是私有测试复制件，不是正式世界／局部图交付，不向用户原项目伪造清单。已知 app 协议 boot ServiceWorkerRegistration InvalidStateError 仍在报告中单列，运行阶段无新增未捕获异常；不能写成零异常。
- 上述为第7轮历史检查点；后续会话采用来源与导航／返回视野已接，见[导航合同与最新验证](<D:/fmg-cn/dreammap/docs/development/atlas-navigation.md>)。持久身份、正式轻量世界、可靠 dirty／无损恢复仍未完成。原项目尚无正式清单，不能将流程底座或合成测试资产当成已完成的分层地图。
