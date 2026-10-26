# 双图技术候选：资产与验收边界

2026-10-27，第12阶段。**已验证实际文件、清单与双图导航，未通过正式国家地缘、河湖内容、完整注记或核心性能验收。** 原地图、Vault与用户便携版不覆盖；本阶段仅本地提交、不推送。

## 实际产物

项目目录为[双图技术候选](<D:/DSH工作区/小说世界搭建/_run/map-next-20261026/phase12/atlas-candidate-v2/README.md>)；[清单](<D:/DSH工作区/小说世界搭建/_run/map-next-20261026/phase12/atlas-candidate-v2/atlas.json>)包含一次性初始化的项目、两地图和65地点UUID。后续沿用身份，改图后更新资产SHA与必要修订，不从名称、hash或cell重新造身份。

| 资产 | 字节 | grid / pack | 地点层级 |
|---|---:|---:|---|
| [世界总览](<D:/DSH工作区/小说世界搭建/_run/map-next-20261026/phase12/atlas-candidate-v2/maps/world.map>) | 17,405,956 | 250278 / 107615 | 6广域名称，15个既有缩放显示addedLabel；无burg/marker |
| [东境详图](<D:/DSH工作区/小说世界搭建/_run/map-next-20261026/phase12/atlas-candidate-v2/maps/east.map>) | 10,867,109 | 100014 / 79568 | 原6 burg / 16 marker / 42 addedLabel |

世界SHA为`28ab910d51113b4e66d04cb7ed6c2e09ba77d1b3a02cde351283d68276d3bc26`，局部为`67a80eb1c0ad50583f78397ab0f6937f05f8ae97eecda7dc59e8b04374f84ebe`。相对只读原件分别减少45.35%与34.26%**文件体积**，不是耗时、内存或内核提速实测。

## 构建与内容限制

- 世界从既有v10同格删除细地点、旧政治经济断言、冰对象和细群系SVG；不是另造低格网地形。海陆共享featurePaths、格网、高程与地理向量保留。冰和细群系省略不表示世界无冰或无群系。
- 世界仍保留977条未编目河流模型且默认启用河流层，绝非“只有6个对象”或河流内容完成。现有未知国界不画，不等于世界没有国家；未虚构国家、首都或新地缘。
- 局部从v9清洗生成的政区、文化宗教、人口、城墙纹章、道路经济等，无据内容不沿用。人口0是未知占位，不是无人。六burg尚无自包含注记和已验具体类型，该含义仅由外置说明/清单提供。
- 65个登记名称都有权威经纬度；世界15、局部64个真实绑定全部核到自身i/x/y。**长庚河唯一空bindings**，可按坐标导航，但未造河道或假称已有原生绑定。
- 世界frame为−180..180／−90..90，局部为78..148／20..59.3。数字锚点一致不证明两图海岸接边或符合世界观地理。硫泉、黑水泊、南泽、无底洼、四河、长庚河与暖水湾关系仍待核定，不挪点/吸附/抬海掩盖。
- 局部地理控件60/0/0与手工frame仍不相容。打开配置预览不覆写frame；显式编辑或预设会重算，不能宣称任意编辑不漂移。
- 入口在项目面板；地图标记自身不自动跨文件。目录能力/历史仅本会话，不是持久项目、精确dirty或未存编辑无损恢复。原便携程序未安装更新，地图包本身不包含启动器。

## 分开成立的证据

1. [原生保存42项](<D:/DSH工作区/小说世界搭建/_run/map-next-20261026/phase12/native-finalize.json>)：普通加载、真实图层重绘、原生53记录保存、格网/地理向量不变及无政治经济有效内容；两空path为无d无href的不绘制骨架，不豁免任何有效图形。此回执本身不代表专用图集采用。
2. [独立B复核44项](<D:/DSH工作区/小说世界搭建/_run/map-next-20261026/phase12/reviewer-b-final.md>)：35项文件/清单检查加9项历史SHA交叉检查，全无不符。B没有重跑桌面；局部其余向量归因父原生回执，不冒称B再次读原图逐格核对。
3. [真实项目18项](<D:/DSH工作区/小说世界搭建/_run/map-next-20261026/phase12/atlas-native.json>)：当前构建、实际目录与65地点、世界专用采用、灰角村跨不同frame居中、收起后Chromium wheel、精确世界File与D3视野返回、长庚河纯坐标导航；坏SHA、错frame、缺原生绑定在采用前拒绝并保旧root/model。运行后原图模型恢复、原图及两候选SHA不变；不是OS物理输入或无损回滚证明。
4. [完整门禁](<D:/DSH工作区/小说世界搭建/_run/map-next-20261026/phase12/complete.log>)：普通2823通过/13跳过、Electron mock 23、脚本52、TypeScript、573源文件Biome、diff、桌面build与资源标记通过；无自动Playwright。About帮助文案已源端中文，原URL/target/rel保留，实际窗口验证通过。既有boot ServiceWorkerRegistration InvalidStateError仍精确单列，不宣称零异常。

[候选压缩包](<D:/DSH工作区/小说世界搭建/_run/map-next-20261026/phase12/双图技术候选.zip>)为7,364,533字节，SHA为`231dd64f936ad748108049e1bd29cf10ebecb2cb37e8316214d0cca1fc1d9523`；[解压核对](<D:/DSH工作区/小说世界搭建/_run/map-next-20261026/phase12/package-proof.json>)确认两地图、清单与两说明逐文件字节相同。[三原图终检](<D:/DSH工作区/小说世界搭建/_run/map-next-20261026/phase12/originals-final.json>)SHA均未变。9334独立测试实例已关闭，未动9333；[实际测试命令](<D:/DSH工作区/小说世界搭建/_run/map-next-20261026/phase12/candidate-command.json>)含禁后台测试flag，不作默认生产性能基线。

采用前预检、采用后观测及导航/视野合同分别见[观测合同](<D:/fmg-cn/dreammap/docs/development/atlas-observation.md>)、[导航合同](<D:/fmg-cn/dreammap/docs/development/atlas-navigation.md>)。后续正式内容修订必须另存、更新相应hash并重验，勿静默修改上述已验字节。
