# gzip 地图字节收集

状态：2026-10-27，字节收集替换、完整门禁、限定渲染器方法比较及独立实际采用验证通过。不是整图载入、内存或离线完成声明。

## 改动与不变量

- [字节收集](<D:/fmg-cn/dreammap/src/services/io/stream-bytes.ts>)用平台原生 `Response(stream).arrayBuffer()` 完整消费流后返回 `Uint8Array`，不再把每个解压块变为 boxed `number[]` 并反复 `concat` 已有前缀。没有网络请求、文本解码或第二次 Content-Encoding 处理。
- [拥有者](<D:/fmg-cn/dreammap/src/services/io/load.ts>)仍创建原 `Blob`／`DecompressionStream("gzip")`，且必须在原 `try` 内 **await** 收集完成。迟到流错误仍进入既有 ERROR 日志／`null`，不能让 rejected promise 越过原 catch 改变载入回执。
- 原始字节 SHA、plain／base64、版本预检、递归 gzip、准备／采用确认、IO 租约、旧模型／来源身份保护不变。输入 view 仍交给 `Blob([view])`，不错误使用包含边界外数据的 backing buffer。
- 这是取消重复 JS 前缀复制，不是硬性资源上限。仍完整保留输出，已有递归层数／解压后体积无上限及压缩炸弹风险未解决；不新增静默大小阈值或改变旧格式能力。

## 回归与证据

- [10项字节／原生流回归](<D:/fmg-cn/dreammap/src/services/io/stream-bytes.test.ts>)覆盖所有字节值、带哨兵的非零 offset 分块、字节级切分 UTF-8、空流／有效空 gzip、7字节输入分块的 gzip、错误／截断／CRC、部分输出后失败及 Response 原拒绝。
- [真实拥有者回归](<D:/fmg-cn/dreammap/src/services/io/load-atlas.test.ts>)补坏 gzip／有效空内容／非法地图／Response 失败的 rejected 回执与旧 map／grid／pack／SVG／epoch／identity／stable／租约；首末取消分别核对未读取与已准备但未替换。plain／base64／gzip／双层 gzip 成功均保 Unicode 和原始资产 SHA，双层消费两次。
- [完整门禁](<D:/DSH工作区/小说世界搭建/_run/map-next-20261027/phase17/complete.log>)：普通2941通过／13跳过、Electron23、脚本52、TypeScript、579源Biome、diff、桌面构建和5资源戳通过；无自动 Playwright。首次定向52例已通过但测试 fixture 的 ArrayBuffer 泛型未通过类型检查，之后保持真实类型修正；53例通过后再按格式器只拆一行，未用 `any` 或类型断言绕过。
- 父暂移除拥有者的 `await`，Response拒绝用例实际[先红](<D:/DSH工作区/小说世界搭建/_run/map-next-20261027/phase17/await-red.log>)：回执由预期 `rejected` 变成 `failed`；恢复同一行后[1项通过／42跳过](<D:/DSH工作区/小说世界搭建/_run/map-next-20261027/phase17/await-green.log>)。未改生产catch或过滤ERROR来绕测。
- [完整成功渲染器回执](<D:/DSH工作区/小说世界搭建/_run/map-next-20261027/phase17/gzip-renderer-v2.json>)为8项总检查：2项环境／micro、5项实际raw采用／gzip采用／声明字段一致性／首取消／末取消、1项无异常及error console。完整私有v9的grid100014／pack79568、graph／frame／seed、声明typed向量和labels／markers SHA一致；不是所有模型或无损恢复的穷尽证明。两取消保声明快照且无replacing。
- 独立fresh profile／默认引擎参数，首启公告真实关闭后显式前置，实际 `entry=index-CPlsOKq0.js`、Electron43.5.0／Chrome150.0.7871.250／Node24.19.0；原图、helper源及renderer目录内全部JS／CSS SHA前后一致，受监测异常／error console／cleanup为空，私有进程SIGTERM已退出，9333不动。原生构造器与方法的值及完整own descriptor前后检查通过；没有修改它们或强制GC。
- [首轮整体失败](<D:/DSH工作区/小说世界搭建/_run/map-next-20261027/phase17/gzip-renderer.json>)前7项通过但捕获 `Electron sandboxed_renderer.bundle.js script failed to run`／`Cannot destructure property 'preloadScripts' of 'binding.startupData' as it is null.`，严格失败并保留，整轮timings未用于结果。仅换新profile／output／私有副本路径完整重跑一次；断言和错误门禁不变。不能由同型历史错误或成功重跑断定无关、已修复或发生率已定位。

## 性能限义

同一实际 Electron renderer 内，最终3行helper使用TypeScript5.9.3纯转译为CommonJS／ES2022，一次创建exports工厂，旧算法为原concat拷贝；不是旧构建或实际bundle方法A/B。工厂／载荷／Blob在计时外，新的gzip pipeline在t0前紧邻构造且无await。计时覆盖异步解压完成与收集，包括其间自然GC，不含之后的长度／逐字节／独立Node SHA校验。64KiB与2MiB的原v9前缀派生载荷不是完整可加载地图。

每种载荷2对暖身、8对平衡AB／BA，之后4对old／old（AA）及4对new／new（NN），不强制GC；每次前后可见且有焦点。完整成功run内全部样本保留；同一renderer／单次完整run，不是跨进程重复。AA／NN是局部噪声对照，不是严格排除跨时间漂移。

[配对聚合及所有样本](<D:/DSH工作区/小说世界搭建/_run/map-next-20261027/phase17/gzip-summary.json>)以线性插值分位数计算，配对节省为每对 `100 × (old−new) / old` 的分布，不等于两独立中位数之比；IQR不是置信区间：

| 解压后载荷（压缩字节） | old／new中位数 | 配对节省中位数（IQR） | 方向 |
| --- | --- | --- | --- |
| 64KiB（20067） | 1.95／0.50ms | 74.34%（53.24–76.05%） | 6／8更快、2／8更慢，无平局 |
| 2MiB（828736） | 92.25／13.10ms | 86.15%（85.42–87.68%） | 8／8更快 |

2MiB配对差中位数80.30ms（IQR77.02–84.08）；AA差中位数8.10ms（IQR2.45–13.43），NN为−3.20ms（IQR−5.97–−1.25）。64KiB的两负值和小样本抖动不删除，不用事后阈值改成平局；本次2MiB方向明显，不当普适或生产保证。

jsdom／Node的Response／Stream不等于实际Electron；上述源码转译方法比较与独立真实应用采用分别成立。没有整图加载／首帧、OS RSS／峰值内存／硬件复制次数、未压缩地图收益或完整离线证明。原图与用户窗口不动，不替换用户便携版。
