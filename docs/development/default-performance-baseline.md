# 默认引擎参数：首启公告确认后的文件载入基线

状态：2026-10-27。**本次性能取样产物的基线，不是优化收益、Atlas导航性能或进程冷启动总体验。**

## 样本与产物

- [完整原始回执](<D:/DSH工作区/小说世界搭建/_run/map-next-20261027/phase13/default-performance-v4.json>)、[汇总](<D:/DSH工作区/小说世界搭建/_run/map-next-20261027/phase13/default-performance-v4-summary.json>)、[执行脚本](<D:/DSH工作区/小说世界搭建/_run/map-next-20261027/phase13/default-performance-v4.cjs>)和[汇总代码](<D:/DSH工作区/小说世界搭建/_run/map-next-20261027/phase13/summarize-default-v4.cjs>)共同定义本次证据。
- 六个独立Electron进程／全新私有profile，世界与局部交替，各三组；每组两次载入。每个样本前显式`Page.bringToFront`，但不加禁遮挡、禁后台或禁节流的引擎flag；只增加调试端口9334／本地地址。原9333不动，无并发构建、测试或CPU profiler。
- 全新profile会在6000ms后显示[真实首启公告](<D:/fmg-cn/dreammap/src/services/versioning.ts#L108-L156>)。每组先等待唯一标题对应的实际窗口，记录正文／版本／按钮，只点“不再显示”，确认关闭后才计时；未预写version或清缓存。实测确认发生在renderer的6292.6–6342.5ms，因此这段等待会预热资源／JIT；不能称公告前最早可载入时点或操作系统／磁盘缓存冷态。
- 基线`entry=index-MmxAo0xy.js`；230项构建JS／CSS在完整成功run整体前后逐项SHA相同，列表SHA-256为`ad80112af6110f698dc353fbad748373669452e429e01bfbd6d5204a70c7af59`。这是构建字节同一证明，不是源码commit可重现构建证明；**不是随后重建的About中文产物**。
- [世界原始实验图](<E:/Map/本纪元禁止私自觉醒/坤舆-世界统一图-v10.map>)：31,851,278字节，grid250278／pack107615，SHA-256 `584d44bcea0f66bc51ab6cc7ef019483b2d1fe9e8c5a763c23f138462a4bafcc`。
- [局部原图](<E:/Map/本纪元禁止私自觉醒/坤舆-东境详图-v9.map>)：16,530,330字节，grid100014／pack79568，SHA-256 `c06113c9215748c354860f43733782b63182a0a43283c8c9c18bef47833df2f1`。两份原图只读、前后SHA相同；不是17.4／10.9MB图集技术候选资产，也没有降低原模型计数。

## 结果

每格为三个独立进程样本的中位数，单位ms；完整单值、长任务、可见层、SVG／DOM计数与viewport均保留在原始回执。

| 原图 | 前置状态 | API调用至fulfilled／loaded | API调用至注册后第2次RAF |
|---|---|---:|---:|
| 世界 | 公告确认后的首次地图载入 | 2144.3 | 2281.1 |
| 世界 | 同进程自然重复 | 2020.5 | 2098.9 |
| 局部 | 公告确认后的首次地图载入 | 1277.8 | 1321.1 |
| 局部 | 同进程自然重复 | 970.7 | 994.2 |

- 两列均以调用公开Load API为计时起点，第二列直到注册事件后的第2次RAF，不是注册后的额外耗时。CDP先将真实文件赋给专用FileInput，再由脚本调用公开Load API；总时间包含两层真实离图确认的自动点击等待，但不包含原生OS picker或生产文件输入onchange。注册事件、Promise完成和连续两RAF分别记录，不混为同一完成条件。
- 十二样本均`loaded`，各一次replacing／generated，模型计数相符、连续两RAF期间visible、真实wheel前后D3缩放发生变化。输入前实时检查落点位于可见地图；本次focus观察值全部true，但脚本不把focus设为强制门禁。
- 同进程第二次之前没有强制GC，但首次载入后做过一次wheel；旧模型也由启动生成图变成同一原图。因此不是“只改变缓存”的因果对照，不将两行差额归因纯缓存或宣称提速。wheel耗时包含CDP往返／轮询／两RAF，不能当物理输入到显示延迟；两RAF不是所有字体、图标、外部资源或合成像素完成证明。
- 每个进程两次载入和wheel都结束后才强制GC一次。renderer保留JS heap诊断：世界196.9–198.2MiB、局部109.7–110.1MiB；全renderer DOM约26620／7740–7764节点。不是峰值、总进程内存、稳定idle、泄漏结论或默认无GC内存基线。
- 本次订阅的renderer未捕获异常／console.error为空；不覆盖订阅前启动、主进程stderr、网络失败、外链或全应用。

## 失败与边界

- [v1失败](<D:/DSH工作区/小说世界搭建/_run/map-next-20261027/phase13/default-performance.json>)、[v2失败](<D:/DSH工作区/小说世界搭建/_run/map-next-20261027/phase13/default-performance-v2.json>)、[v3失败](<D:/DSH工作区/小说世界搭建/_run/map-next-20261027/phase13/default-performance-v3.json>)完整保留，分别包含wheel未变／可见落点被挡等未完成矩阵。v3观察到LI命中，只说明当次不是地图；源码存在延迟公告不能唯一证明旧失败归因。
- v4重新完整运行六组，未拼接旧成功样本，没有放宽异常、模型、事件、wheel变化或RAF门禁。唯一新增前置处理是实际公告确认；命中历史同时记录target／ID／visibility／focus／onMap的变化。
- 独立B只读核对源、原始结果与汇总，未确认阻断；不冒称第二次独立执行。旧带测试flag或profiler的历史数字不能与本表直接比较。
- 后续优化必须使用同图、同层、同前置协议与两版本配对；正式Atlas往返、公告前冷启动、OS缓存冷态、默认内存／离线及外部资源完整性仍未验。
