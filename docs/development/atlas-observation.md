# 图集文件与实际采用模型的独立核验

状态：2026-10-26。本阶段将 [关联清单](<D:/fmg-cn/dreammap/docs/development/atlas-manifest.md>) 接入专用载图 API；不是项目目录浏览器、世界／局部导航或测绘证明。

## 入口与读取链

```ts
Load.uploadAtlasMap(
  file: Blob,
  manifestJSON: string,
  mapId: string,
  callback?: () => void | Promise<void>
): Promise<MapLoadOutcome>
```

[共同入口](<D:/fmg-cn/dreammap/src/services/io/load.ts>) 仍执行同一 IO 租约、[两阶段确认](<D:/fmg-cn/dreammap/docs/development/load-departure.md>)、旧 callback 清理和结构／SVG 预检，没有公开 skip。普通 `uploadMap` 不启用图集核验，继续兼容旧档。

初次允许准备后，解析并冻结清单，provider 仅取一次、FileReader 仅读一次。**同一原始 ArrayBuffer** 分别用于解码与 SHA-256；压缩或 base64 文件计算的是原文件字节，不是解码后文本，不复读文件，也不抄清单摘要。预检得到的同一个 detached SVG 随后用于真实采用。

## 实际观测来源

[独立观测适配器](<D:/fmg-cn/dreammap/src/services/atlas/observation.ts>) 不读取清单生成 actual，不访问 DOM 文字、标签边框或当前窗口宽高。

| 观测 | 采用前文件 | 采用后模型 |
|---|---|---|
| 摘要 | 实际原字节的 WebCrypto SHA-256 | 同一读入资产摘要；不是重新序列化的模型摘要 |
| 范围 | 设置内原生六数坐标 | 当前 `options.map.geography.coordinates` |
| 画布 | 设置内 `graph.width/height`，另核对文件头与 SVG 根尺寸 | 当前 `options.map.graph.width/height`，不取已随窗口缩放的 SVG 尺寸 |
| 对象 | 聚落／标记／自由标签集合的自身 `i/x/y` | 当前 `pack.burgs/markers/addedLabels`，不复用预备数据 |

范围保持完整浮点精度：`west=lonW`、`east=lonW+lonT`、`north=latN`、`south=latN-latT`。只有冗余端点比较容许操作数尺度上的 8 倍机器 epsilon，不舍入实际 frame，也不放宽清单 frame 比较。拒绝会让原生 strict schema 重算的额外坐标键。

聚落的占位 0／已删除项排除，其存活自身 ID 须匹配原生数组索引；marker 与 addedLabel 的 0 有效，hidden／排版偏移不作删除依据。不按名称猜替代对象、不去重掩盖重复、不移动或吸附坐标。快照嵌套冻结；对象位置仍按清单百万分之一像素容差核对。

## 当前原生格式限域

图集专用入口仅接受原始版本字段 **1.154.0**，要求文件头、无单位 SVG 根宽高与模型画布一致，根和 `g#viewbox` 的 `transform` 属性非空则拒绝。**任意显式根 viewBox 均拒绝**，即使看似匹配，以免窗口 fit 后造成二次缩放。这不是任意 CSS／子树变换的归一化或最终像素效果证明；普通上传不增加这些图集限制。

清单纯坐标可表示跨日界线展开经度，但当前原生 coordinates schema 无法原样保留超出其端点域的数据；专用适配器拒绝这种输入，不静默归一或伪称已支持。旧档先普通载入并另存，再重新建立摘要和关联；本阶段不改变 `.map` 格式。

## 发布与失败边界

- 文件核验在最终确认／替换前执行。摘要、范围、尺寸、绑定缺失／重复／移位或未核验基准不符时，保留原模型引用与保存目标，不发替换或成功事件。
- 实际采用可能迁移、修复或由 `focusOn` 修改聚落，故最后检查必须在 `focusOn/invokeActiveZooming` **之后**、`Options.persist/registerMap` **之前**。重新读取实际 options/pack，通过才发布成功并由协调器解除不稳定状态。
- 采用后不符返回 failed，不持久化或发布成功，保存仍受隔离；可能已经留下混合模型。只能重新完整载入恢复，不保证取回未另存编辑，不能把此机制写成无损回滚。
- 没有诊断只证明观测与清单声明相容。`verified/evidence` 仍是人工记录；摘要不证明海岸线、地形和正式地点本来正确，项目 UUID／地理修订也不是从原生模型观察到的字段。
- `asset.path` 仍仅词法相对路径合同。本 API 消费调用方给的 Blob，不据它开放任意文件读取。[目录面板](<D:/fmg-cn/dreammap/docs/development/atlas-project-files.md>) 已能精确匹配用户所选 File；物理项目根／符号链接隔离、平台别名的全面证明仍未实现。

## 验收

- 观测 **44 项**、保留真实 `parseLoadedData/runMapLoad` 的专用入口 **14 项**、原共同入口 **70 项**定向通过。14 项仅替代外围几何／渲染／Options／迁移，不冒充完整原生采用；覆盖 plain/base64/gzip 的单次字节链、采用前保旧引用、focusOn 后漂移及实际修复删除聚落后的发布阻断。
- [完整门禁](<D:/DSH工作区/小说世界搭建/_run/map-next-20261026/atlas-complete-review.txt>)：普通 **2558 通过、13 跳过**，独立 Electron mock **23**，脚本 **52**；TypeScript、555 个源文件 Biome、桌面构建、差异与资源标记通过。未自动运行 Playwright。
- [真实候选图集验收](<D:/DSH工作区/小说世界搭建/_run/map-next-20261026/atlas-upload-desktop-smoke.json>) **17 项通过**：当前构建 `index-DofyAJOE.js`、7 类不符保旧模型／保存目标、实际采用只发布一次、focusOn 后漂移不发布且隔离保存、完整重载恢复。原局部格网／压实格 **100014／79568**、自由标签 **42**，原图 SHA-256 不变。此清单只是本地测试根图，不是轻量世界交付或测绘证据。
- 首次脚本在连接前错误地把 SVG 裸 LF 当记录分隔，第二次在异步预备完成前查询最终 dialog；两次失败日志保留，改按生产 CRLF 规则并明确等待后，独立完整复验才通过。没有以失败用例回执充当成功。
- 已知 app 协议启动期 `InvalidStateError: Failed to get ServiceWorkerRegistration objects: The document is in an invalid state.` 仍在报告中；不宣称零异常。
