# 世界／局部图关联清单 v1

状态：纯模型已实现，尚未接入文件选择、地图切换或存档写入。它不是新的 `.map` 格式，也不是已交付的多图导航界面。

## 1. 数据真值与身份

- 清单在地图目录外置保存，每张 `.map` 仍能独立打开。现有地图不被改写，不向严格的 options 对象塞入自定义字段。
- 项目、地图、地点使用版本化 UUID，解析后统一小写。身份不依赖名字、文件名、seed、数组顺序或 cell 下标；改名不换身份。
- 地点只有一份完整精度的权威经纬度，允许多圈经度表示，解析不归一化或四舍五入。地点 `revision` 与地图 `geographicRevision` 分开记录。
- v1 是一个世界根图＋零到多张直接关联根图的局部图，不支持任意嵌套图树。世界不必覆盖全球。
- 绑定键为 `(mapId, kind, objectId)`；同图同类同号只能归属一个地点。不同图／不同类可重号，同地点可绑定多个对象。marker 与 addedLabel 的 0 有效；burg 的 0 是占位项。

实现和回归分别在 `src/services/atlas/manifest.ts`、`src/services/atlas/manifest.test.ts`；精确坐标合同在相邻的 `coordinates.ts`。

## 2. 字段合同

所有字段均明确验证，不接受未知字段、隐式数字转换或未知版本。

| 层级 | 字段 |
|---|---|
| 根 | `schemaVersion: 1`、`project: {id,name}`、`worldMapId`、`maps`、`places` |
| 地图 | `id`、`name`、`kind: world/local`、`asset: {path,sha256}`、`projection: equirectangular`、`provenance`、`frame`、`size`、`geographicRevision`、`detailLevel`、`parent`、`georeference` |
| frame | `west`、`east`、`south`、`north`；西界在 [-180,180)，东界展开且大于西界，跨度不超过 360°；纬度在 [-90,90] 内且南北界不相等 |
| size | 正数 `width`、`height`，取原生模型画布，不是窗口或 SVG 当前视口 |
| parent | 世界为 `null`；局部为 `{mapId,geographicRevision}`，必须引用本项目世界及其当前地理修订 |
| georeference | `{verified:boolean,evidence:string}`；已核验须有非空依据，未核验可记录待核原因 |
| 地点 | `id`、`name`、`kind`、`coordinate:{longitude,latitude}`、`provenance`、`revision`、`bindings` |
| 绑定 | `mapId`、`kind: burg/marker/addedLabel`、非负安全整数 `objectId`、`geographicRevision` |

地名和来源文本仅为数据，不解释为 HTML、命令或可解引用 URL。修订号和细节级别必须为非负安全整数；世界细节级别为 0，局部大于 0。SHA-256 是对应文件字节的完整 64 位十六进制摘要，不是从 seed 或文件名计算的替代值。

当前输入合同限制原始及规范化 JSON 文本均不超过 400 万字符、地图 512 张、地点 100000 个、每地点绑定 2048 个；导入时也核对规范化输出大小，避免接受一个之后无法重新保存的清单。这是防止无界输入的校验上限，不是已完成的容量／性能保证。

### 最小演示数据

以下仅展示字段结构，不是用户地图的真实元数据。路径和摘要均为占位，故 `verified` 为 false；不得将示例变为“已核验”项目。

```json
{
  "schemaVersion": 1,
  "project": {
    "id": "10000000-0000-4000-8000-000000000001",
    "name": "演示项目"
  },
  "worldMapId": "20000000-0000-4000-8000-000000000001",
  "maps": [
    {
      "id": "20000000-0000-4000-8000-000000000001",
      "name": "世界总览",
      "kind": "world",
      "asset": {
        "path": "maps/world.map",
        "sha256": "0000000000000000000000000000000000000000000000000000000000000000"
      },
      "projection": "equirectangular",
      "provenance": "演示占位，不对应实际地图文件",
      "frame": { "west": -180, "east": 180, "south": -90, "north": 90 },
      "size": { "width": 4096, "height": 2048 },
      "geographicRevision": 1,
      "detailLevel": 0,
      "parent": null,
      "georeference": { "verified": false, "evidence": "尚未导入和核验资产" }
    }
  ],
  "places": []
}
```

## 3. 地理包含与候选选择

- 跨日界线局部写成 `west:170,east:190`，不能写成 `170,-170` 后让解析器猜测。
- 非全球世界必须包含局部的整个连续经度弧，不能只验证两个端点。例如世界 -170..170 必须拒绝局部 160..200。
- 覆盖 360° 的世界采用接缝特判：世界 20..380 可以容纳局部 10..30。地点 -175／185／905 选到同一覆盖图，但保存的原权威经度不被改写。
- `selectLocalMap` 仅选出候选，不加载或切换地图。世界或候选未核验地理基准时不自动选取；没有候选返回 `null`。
- 重叠顺序：细节级别降序 → 球面覆盖面积升序 → 规范 UUID 的 ASCII 字典序。不是网格数、画布像素数、加载顺序或本地化字符串排序。
- 面积仅需相对大小，使用球面矩形面积的对数形式，省略公共半径因子；极薄范围避免乘积下溢，靠极点使用极距避免中点舍入。仍遵守 JavaScript 浮点精度，不承诺任意精度计算。

## 4. 独立快照核对，不制造“已对齐”证明

```ts
parseAtlasManifest(json: string): AtlasManifest
serializeAtlasManifest(manifest: AtlasManifest): string
selectLocalMap(manifest: AtlasManifest, point: GeographicPoint): AtlasMap | null
verifyMapSnapshot(manifest: AtlasManifest, mapId: string, observation: unknown): readonly AtlasMapIssue[]
```

解析／序列化返回独立数据，解析结果深冻结；选择不改数组顺序；核对不冻结或修改调用者提供的快照。

核对器要求真正独立观测的 `sha256`、`projection`、`frame`、`size`、`objects`。缺测、文件摘要变化、画布／投影／范围变化、绑定对象缺失／重复／移位均给出诊断，不重定位对象、不吸附陆地、不修地形。

每个观测对象只含 `{kind,objectId,position:{x,y}}`。位置是模型锚点，不是排版后的文本边界或当前屏幕坐标；burg 占位项／已删除对象应由未来适配器排除。排版偏移的文字不能冒充地点锚点：v1 应保持此类标签无锚点绑定，或在后续适配层明确拆分地理锚点与显示偏移。

对象位置容差为百万分之一像素，仅容纳算术噪声，不代表地图分辨率或测绘不确定度。

未来运行态适配器应从真实模型计算：`west=lonW`、`east=lonW+lonT`、`north=latN`、`south=latN-latT`，并检查冗余端点是否一致；画布尺寸取模型而非 DOM。资产摘要必须从实际读取字节计算，不能复制 expected 值制造 actual。

**无诊断只表示这些声明与所供独立观测相容。** 清单自身的 `verified/evidence` 是显式核验记录，不是程序重新测绘的结果；摘要不证明海岸线、地形或历史坐标本来就正确。`.map` 没有的项目 UUID／地理修订字段不能伪装成运行态已经观察到的字段。

## 5. 路径与未来加载边界

资产采用 POSIX 风格目录内相对 `.map` 路径，允许中文和内部空格；拒绝绝对／UNC／盘符路径、反斜杠、冒号、编码 `%`、查询／片段、控制字符、空分段、`.`／`..`、保留设备名和末尾空格／点。重复资产按大小写无关方式拒绝，避免 Windows 下明显别名。

**这只是词法合同，不是文件沙箱。** 未来加载器仍须按实际项目根校验真实路径、符号链接、平台别名及文件内容；不能把字符串通过验证当作任意文件可读权限。v1 不访问文件、不联网、不创建目录、不启动生成器、不更改 DOM 或全局地图。

## 6. 下一阶段的事务约束

P3 接入界面前必须另做：

1. 清单与当前地图各自的未保存状态；检查活模型而非仅磁盘头。
2. 旧模型卸载前的取消／保存／放弃确认；取消、保存失败或目标加载失败不得静默丢修改。
3. 候选资产预检、独立快照适配、实际载入完成与返回视野恢复。
4. 文件保存后的摘要和核验流程；不能自动把文件变化当作地理仍正确。
5. 一次仅常驻一张正式模型；失败恢复、旧档兼容与端到端内存／加载测量。

本模块不代表这些事务已经实现，也不代表既有世界／详图已天然同源对齐。
