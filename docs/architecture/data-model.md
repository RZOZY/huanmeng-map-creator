**FMG 数据模型**定义不清、前后不一致且缺乏文档。本页试图对其加以记录。一旦全部记录完毕，便可据此构建一个新的、一致的模型。请注意，本文档反映的是对象模型的**现状**，包含它的所有怪异之处。我们期望得到的模型见 [future-data-model.md](future-data-model.md) 页面。

FMG 将其大部分数据暴露在全局命名空间中。

# Basic objects ｜ 基础对象

FMG 用两个元对象存储大部分地图数据：

- `grid` 包含*重新打包*之前的地图数据（[`GridGraph`](../../src/types/GridGraph.ts)，由 [`Grid` 模块](../../src/generators/grid-generator.ts) 构建并生成）
- `pack` 包含*重新打包*之后的地图数据（[`PackedGraph`](../../src/types/PackedGraph.ts)，由 `Pack.generate()` 从网格派生）

重新打包是将一个基于抖动方形点阵的初始 [voronoi 图](https://en.wikipedia.org/wiki/Voronoi_diagram)修正为针对当前陆块优化的 voronoi 图的过程（细节见[我的旧博客文章](https://azgaar.wordpress.com/2017/10/05/templates)）。因此大部分数据都使用 `pack` 对象，但针对方形网格优化的数据只能通过 `grid` 对象获取。

## Voronoi data ｜ Voronoi 数据

`grid` 和 `pack` 都包含 Voronoi 几何与连接关系。加载地图时会根据其点重建生成的几何。用户的编辑单独保存为图覆盖（graph override），并在重建之后应用。

Wrap 工具将被移动的打包图顶点记录在 `GraphOverride.state.pack.vertices.p` 中，以 `[originalPoint, editedPoint]` 对的形式按顶点 id 索引。该状态保存在地图记录 `51` 中。加载时，只有当重建后的顶点仍具备所记录的原始坐标时，编辑才会被恢复；不再符合图的编辑会被丢弃。移动或恢复顶点还会刷新单元格与地物的面积。见 [`graph-override.ts`](../../src/generators/graph-override.ts)。

### Grid object ｜ Grid 对象

- `grid.cellsDesired`: `number` - 创建地图时请求的初始单元格/点数。用于定义 `spacing` 并在抖动方形网格上放置点，对象名即由此而来。实际单元格数由能够放置在方形网格上的点数决定。`cellsDesired` 默认为 10 000，最大 100 000，最小 1 000
- `grid.spacing`: `number` - 抖动前各点之间的间距
- `grid.cellsY`: `number` - 列方向上的单元格数
- `grid.cellsX`: `number` - 行方向上的单元格数
- `grid.points`: `number[][]` - 基于抖动方形网格的 `[x, y]` 坐标。数值保留 2 位小数
- `grid.boundary`: `number[][]` - 画布外的点坐标，用于大致按画布边缘裁剪图。整数
- `grid.cells`: `{}` - 单元格数据对象，包含 voronoi 数据：
- - `grid.cells.i`: `number[]` - 单元格索引，`Uint16Array` 或 `Uint32Array`（取决于单元格数量）
- - `grid.cells.c`: `number[][]` - 与每个单元格相邻的单元格索引（相邻单元格）
- - `grid.cells.v`: `number[][]` - 每个单元格的顶点索引
- - `grid.cells.b`: `number[]` - 指示单元格是否与地图边缘相邻，`true` 为 1，`false` 为 0。整数，而非布尔值

- `grid.vertices`: `{}` - 顶点数据对象，仅包含 voronoi 数据：
- - `grid.vertices.p`: `number[][]` - 顶点坐标 `[x, y]`，整数
- - `grid.vertices.c`: `number[][]` - 与每个顶点相邻的单元格索引，每个顶点有 3 个相邻单元格
- - `grid.vertices.v`: `number[][]` - 与每个顶点相邻的顶点索引。大多数顶点有 3 个相邻顶点，边缘顶点只有 2 个，第三个仍以 `-1` 加入数据

### Pack object ｜ 打包图对象

- `pack.cells`: `{}` - 单元格数据对象，包含 voronoi 数据：
- - `pack.cells.i`: `number[]` - 单元格索引，`Uint16Array` 或 `Uint32Array`（取决于单元格数量）
- - `pack.cells.p`: `number[][]` - 重新打包后单元格的 `[x, y]` 坐标。数值保留 2 位小数
- - `pack.cells.c`: `number[][]` - 与每个单元格相邻的单元格索引（相邻单元格）
- - `pack.cells.v`: `number[][]` - 每个单元格的顶点索引
- - `pack.cells.b`: `number[]` - 指示单元格是否与地图边缘相邻，`true` 为 1，`false` 为 0。整数，而非布尔值
- - `pack.cells.g`: `number[]` - `grid` 中源单元格的索引。`Uint16Array` 或 `Uint32Array`。这是为 `pack` 单元格找到正确 `grid` 父单元格的唯一途径

- `pack.vertices`: `{}` - 顶点数据对象，仅包含 voronoi 数据：
- - `pack.vertices.p`: `number[][]` - 顶点坐标 `[x, y]`，整数
- - `pack.vertices.c`: `number[][]` - 与每个顶点相邻的单元格索引，每个顶点有 3 个相邻单元格
- - `pack.vertices.v`: `number[][]` - 与每个顶点相邻的顶点索引。大多数顶点有 3 个相邻顶点，边缘顶点只有 2 个，第三个仍以 `-1` 加入数据

## Features data ｜ 地物数据

地物表示相互独立的锁定区域，如岛屿、湖泊和海洋。

### Grid object ｜ Grid 对象

- `grid.features`: `object[]` - 包含原始图中所有封闭实体的对象数组：岛屿、湖泊和海洋。地物对象结构：
- - `i`: `number` - 地物 id，从 `1` 开始
- - `land`: `boolean` - 若地物为陆地（高度 >= `20`）则为 `true`
- - `border`: `boolean` - 若地物与地图边缘相接则为 `true`（用于区分湖泊与海洋）
- - `type`: `string` - 地物类型，可为 `ocean`、`island` 或 `lake

### Pack object ｜ 打包图对象

- `pack.features`: `object[]` - 包含重新打包图中所有封闭实体的对象数组：岛屿、湖泊和海洋。注意：元素 0 没有数据。存储在 .map 文件中。地物对象结构：
- - `i`: `number` - 地物 id，从 `1` 开始
- - `land`: `boolean` - 若地物为陆地（高度 >= `20`）则为 `true`
- - `border`: `boolean` - 若地物与地图边缘相接则为 `true`（用于区分湖泊与海洋）
- - `type`: `string` - 地物类型，可为 `ocean`、`island` 或 `lake`
- - `subtype`: `string`：地物子类型，即分类生成器读取的内容。陆地取 `continent`、`island`、`isle` 或 `lake_island`；湖泊取 `freshwater`、`salt`、`dry`、`sinkhole`、`frozen` 或 `lava`；海洋按单元格数量取 `ocean`、`sea` 或 `gulf`。该集合是固定的：用户在“地物总览”（以及湖泊编辑器）中从中选取，但不能新增子类型
- - `group`: `string`：渲染分组，即绘制该地物所用的 SVG 组的 id——纯粹是渲染选择，与子类型无关。湖泊默认取子类型，湖中岛屿取 `lake_island`，其余陆地取 `sea_island`。湖泊可在“地物总览”中在分组之间移动，并可在湖泊编辑器中新建分组；岛屿分组为派生且固定。海洋没有渲染分组
- - `cells`: `number` - 地物中的单元格数
- - `area`: `number` - 地物面积，单位为地图单位的平方。岛屿和湖泊使用其多边形面积；海洋则累加其单元格面积。“地物总览”会将其转换为显示单位，并为与地图边缘相接的地物估算全球面积
- - `firstCell`: `number` - 地物中第一个（左上角）单元格的索引
- - `vertices`: `number[]` - 地物周围顶点的索引（周边顶点）
- - `name`: `string` - 为每个地物生成。岛屿使用其第一个陆地单元格的文化，湖泊使用某个岸上单元格，另有十分之一的概率改用英语形容词。海洋使用英语形容词或其所在的地图方位（_Azure_、_Northern_）；子类型名词单独显示。任何地物都可在“地物总览”中重命名。空值显示为 _Unnamed_
- - `note`: `string` - 可选。用户关于该地物的注释（图例），为 html。随地物一同删除
- - `coastline`: `object` - 可选。该地物自身的海岸线设置（与 `options.map.coastline` 结构相同），在海岸线编辑器中设置；地图级设置不再对其生效。仅限岛屿和湖泊

## Specific cells data ｜ 特定单元格数据

世界数据主要存储在 `grid` 和 `pack` 中 `cells` 对象的类型化数组里。

### Grid object ｜ Grid 对象

- `grid.cells.h`: `number[]` - 单元格高程，范围 `[0, 100]`，其中 `20` 是最低陆地高程。`Uint8Array`
- `grid.cells.f`: `number[]` - 地物索引。`Uint16Array` 或 `Uint32Array`（取决于单元格数量）
- `grid.cells.t`: `number[]` - 距水面的[距离场](https://prideout.net/blog/distance_fields/)。`1, 2, ...` 为陆地单元格，`-1, -2, ...` 为水域单元格，`0` 为未标记单元格。`Uint8Array`
- `grid.cells.temp`: `number[]` - 单元格温度，单位摄氏度。`Uint8Array`
- `grid.cells.prec`: `number[]` - 单元格降水量，刻度未指定。`Uint8Array`

### Pack object ｜ 打包图对象

- `pack.cells.h`: `number[]` - 单元格高程，范围 `[0, 100]`，其中 `20` 是最低陆地高程。`Uint8Array`
- `pack.cells.f`: `number[]` - 地物索引。`Uint16Array` 或 `Uint32Array`（取决于单元格数量）
- `pack.cells.t`: `number[]` - 距离场。`1, 2, ...` 为陆地单元格，`-1, -2, ...` 为水域单元格，`0` 为未标记单元格。`Uint8Array`
- `pack.cells.s`: `number[]` - 单元格评分。评分用于确定放置城镇的最佳单元格。`Uint16Array`
- `pack.cells.biome`: `number[]` - 单元格生物群系索引。`Uint8Array`
- `pack.cells.burg`: `number[]` - 单元格城镇索引。`Uint16Array`
- `pack.cells.culture`: `number[]` - 单元格文化索引。`Uint16Array`
- `pack.cells.state`: `number[]` - 单元格国家索引。`Uint16Array`
- `pack.cells.province`: `number[]` - 单元格省份索引。`Uint16Array`
- `pack.cells.religion`: `number[]` - 单元格宗教索引。`Uint16Array`
- `pack.cells.good`: `number[]` - 单元格奖励资源物资 id（无则为 `0`）。标记该单元格上提取的特殊物资。`Uint16Array`
- `pack.cells.market`: `number[]` - 单元格市场索引（未分配则为 `0`）。由市场领地泛洪填充。`Uint16Array`
- `pack.cells.area`: `number[]` - 单元格面积，单位为像素。`Uint16Array`
- `pack.cells.pop`: `number[]` - 单元格人口，以人口点计（默认 1 点 = 1000 人）。`Float32Array`，不取整，以免丢失高人口率的人口
- `pack.cells.r`: `number[]` - 单元格河流索引。`Uint16Array`
- `pack.cells.fl`: `number[]` - 单元格流量。定义流经该单元格的水量。用于获取河流数据并对单元格评分。`Uint16Array`
- `pack.cells.conf`: `number[]` - 汇流处的单元格流量。汇流处是河流交汇的单元格。`Uint16Array`
- `pack.cells.harbor`: `number[]` - 单元格港口评分。显示与该单元格相邻的水域单元格数量。用于评分。`Uint8Array`
- `pack.cells.haven`: `number[]` - 单元格的避风港单元格索引。每个沿海单元格都定义了避风港单元格，以便正确构建路线。`Uint16Array` 或 `Uint32Array`（取决于单元格数量）
- `pack.cells.routes`: `object` - 单元格之间通过路线的连接。例如 `pack.cells.routes[8] = {9: 306, 10: 306}` 表示单元格 `8` 有两条路线连接——通过路线 `306` 与单元格 `9` 相连，通过路线 `306` 与单元格 `10` 相连

# Secondary data ｜ 次级数据

次级数据作为 `pack` 对象的一部分提供。

## Cultures ｜ 文化

文化（种族、语言区）数据以对象数组存储，元素顺序严格。元素 0 由 _wildlands_ 文化保留。若文化被移除，该元素并不会被删除，而是改为添加 `removed` 属性。对象结构：

- `i`: `number` - 文化 id，始终等于数组索引
- `base`: `number` - _nameBase_ id，名称基用于生成名称
- `name`: `string` - 文化名称
- `origins`: `number[]` - 起源文化的 id。用于渲染文化树以展示文化演化。数组第一个成员为主链接，其余为辅助的树外链接
- `shield`: `string` - 盾徽类型。用于纹章渲染
- `center`: `number` - 文化中心（初始单元格）的单元格 id
- `code`: `string` - 文化名称缩写。用于渲染文化树
- `color`: `string` - 文化颜色，十六进制（如 `#45ff12`）或指向阴影图案的链接（如 `url(#hatch7)`）
- `expansionism`: `number` - 文化扩张系数。主要在文化生成期间使用，使文化扩张不均匀
- `type`: `string` - 文化类型，见[文化类型](https://github.com/Azgaar/Fantasy-Map-Generator/wiki/Culture-types)
- `area`: `number` - 文化面积，单位为像素
- `cells`: `number` - 分配给该文化的单元格数
- `rural`: `number` - 分配给该文化的单元格的农村（非城镇）人口。以人口点计
- `urban`: `number` - 分配给该文化的单元格的城市（城镇）人口。以人口点计
- `lock`: `boolean` - 若文化已锁定（不受重新生成影响）则为 `true`
- `removed`: `boolean` - 若文化已移除则为 `true`
- `note`: `string` - 可选。用户关于该文化的注释（图例），为 html。随文化一同删除

## Burgs ｜ 城镇

城镇（聚落）数据以对象数组存储，元素顺序严格。元素 0 是数字 `0`，而非对象。若城镇被移除，该元素并不会被删除，而是改为添加 `removed` 属性。对象结构：

- `i`: `number` - 城镇 id，始终等于数组索引
- `name`: `string` - 城镇名称
- `cell`: `number` - 城镇所在单元格 id。一个单元格只能有一个城镇
- `x`: `number` - x 轴坐标，保留两位小数
- `y`: `number` - y 轴坐标，保留两位小数
- `culture`: `number` - 城镇文化 id
- `state`: `number` - 城镇所属国家 id
- `feature`: `number` - 城镇所属地物 id（陆块的 id）
- `population`: `number` - 城镇人口，以人口点计
- `type`: `string` - 城镇的文化类型（Generic、River、Lake、Naval、Nomadic、Hunting、Highland），关乎地理而非等级。首府状态是 `capital`；规模等级是 `group`。见[文化类型](https://github.com/Azgaar/Fantasy-Map-Generator/wiki/Culture-types)
- `group`: `string` - 城镇分类与渲染分组。它也是城镇标签的默认标签分组
- `label`: `Label` - 可选的城镇标签覆盖。城镇标签默认使用城镇名称、坐标和 `burg.group`；`label.group` 只能覆盖标签分组
- `coa`: `object` - [Armoria 的 COA 格式](https://github.com/Azgaar/armoria-api#readme)的纹章，或指向库中图标的图片纹章 `{ icon: string, shield?: string }`。两种形式都可带有可选的 `size`、`x` 和 `y` 字段，用于地图放置。图片纹章可裁剪为盾形，但不能在 Armoria 中作为纹章编辑
- `MFCG`: `number` - [Medieval Fantasy City Generator](https://watabou.github.io/city-generator)（MFCG）中的城镇种子。若未提供，则由地图种子和城镇 id 组合而成
- `link`: `string` - 在 MFCG 中指向该城镇的自定义链接。若提供了链接，则不使用 `MFCG` 种子
- `capital`: `number` - 若城镇是首府则为 `1`，否则为 `0`（每个国家只有 1 个首府）
- `port`: `number` - 若城镇不是港口则为 `0`，否则为城镇通商所依赖水体的地物 id。对于沿海城镇，这是相邻的海/湖；对于位于可通航河流上的城镇，这是河流最终注入的水体（海洋，或内流盆地的封闭湖泊），因此河流城镇会加入该水体的海路网络
- `market`: `number` - 该城镇所属市场的 id（无则为 `0`）。在市场领地扩张期间由 `cells.market[burg.cell]` 得出
- `production`: `object[]` - 上次生产运行中每个城镇的生产/贸易记录。每条记录为以下之一：本地奖励记录 `{good, units}`、制造记录 `{good, units, recipe, cultureModifier?}`，或指向 `pack.deals` 的交易引用 `{dealId}`。供生产总览和生产链 UI 使用
- `product`: `number` - 上次生产运行的净产品（销售总收入减去原料成本）
- `treasury`: `number` - 累计现金余额，由原料采购、税后销售收入和需求补足采购更新。城镇编辑器也可手动设置；生产不会为与之匹配而重新计算
- `citadel`: `number` - 若城镇有城堡则为 `1`，否则为 `0`。用于 MFCG
- `plaza`: `number` - 若城镇有集市则为 `1`，否则为 `0`。用于 MFCG
- `shanty`: `number` - 若城镇有棚户区则为 `1`，否则为 `0`。用于 MFCG
- `temple`: `number` - 若城镇有神庙则为 `1`，否则为 `0`。用于 MFCG
- `walls`: `number` - 若城镇有城墙则为 `1`，否则为 `0`。用于 MFCG
- `lock`: `boolean` - 若城镇已锁定（不受重新生成影响）则为 `true`
- `removed`: `boolean` - 若城镇已移除则为 `true`
- `note`: `string` - 可选。用户关于该城镇的注释（图例），为 html。随城镇一同删除

## States ｜ 国家

国家数据以对象数组存储，元素顺序严格。元素 0 保留给 `neutrals`。若国家被移除，该元素并不会被删除，而是改为添加 `removed` 属性。对象结构：

- `i`: `number` - 国家 id，始终等于数组索引
- `name`: `string` - 国家名称的短（专有）形式
- `form`: `string` - 国家政体类型。可用类型有 `Monarchy`、`Republic`、`Theocracy`、`Union` 和 `Anarchy`
- `formName`: `string` - 政体名称字符串，用于得到国家的 `fullName`
- `fullName`: `string` - 国家全名。由专有名称与国家 `formName` 组合而成
- `color`: `string` - 国家颜色，十六进制（如 `#45ff12`）或指向阴影图案的链接（如 `url(#hatch7)`）
- `center`: `number` - 国家中心（初始单元格）的单元格 id
- `pole`: `number[]` - 国家的不可达极（视觉中心）坐标，见[概念说明](https://blog.mapbox.com/a-new-algorithm-for-finding-a-visual-center-of-a-polygon-7c77e6492fbc?gi=6bd4fcb9ecc1)
- `culture`: `number` - 国家文化 id（等于初始单元格的文化）
- `type`: `string` - 国家类型，见[文化类型](https://github.com/Azgaar/Fantasy-Map-Generator/wiki/Culture types)
- `expansionism`: `number` - 国家扩张系数。主要在生成国家期间使用，使国家扩张不均匀
- `area`: `number` - 国家面积，单位为像素
- `burgs`: `number` - 国家内的城镇数量
- `cells`: `number` - 国家内的单元格数量
- `rural`: `number` - 国家单元格的农村（非城镇）人口。以人口点计
- `urban`: `number` - 国家单元格的城市（城镇）人口。以人口点计
- `neighbors`: `number[]` - 相邻（陆地接壤）国家的 id
- `provinces`: `number[]` - 国家所辖省份的 id
- `diplomacy`: `string[]` - 按国家 id 表示对每个国家的关系：`Ally`、`Friendly`、`Neutral`、`Suspicion`、`Enemy`（交战）、`Unknown`、`Rival`、`Vassal`（为其附庸）或 `Suzerain`（为其宗主）；除附庸对外，双方持有相同关系。自身和中立国为 'x'。元素 0（中立国）的 `diplomacy` 用法不同，以 `string[][]` 形式保存战争故事
- `campaigns`: `object[]` - 该国参与的战争。战争定义为 `start`: `number`（年份）、`end`: `number`（年份）、`name`: `string`
- `alert`: `number` - 国家战争警报，见[军事力量页面](https://github.com/Azgaar/Fantasy-Map-Generator/wiki/Military-Forces)
- `military`: `Regiment[]` - 国家军团列表，见[军事力量页面](https://github.com/Azgaar/Fantasy-Map-Generator/wiki/Military-Forces)
- `label`: `Label` - 可选的国家标签数据。若缺失，渲染器会根据国家数据和标签模式推导文本、路径和相对大小
- `coa`: `object` - [Armoria 的 COA 格式](https://github.com/Azgaar/armoria-api#readme)的纹章，或指向库中图标的图片纹章 `{ icon: string, shield?: string }`。两种形式都可带有可选的 `size`、`x` 和 `y` 字段，用于地图放置。图片纹章可裁剪为盾形，但不能在 Armoria 中作为纹章编辑
- `salesTax`: `number` - 销售税率 `0..1`，向以该国为卖方的交易征收。由 `form` 生成（Monarchy 0.15、Theocracy 0.25、Union 0.07、Republic 0.05、Anarchy 0），每个国家略有抖动。中立国始终为 `0`
- `pollTax`: `number` - 每个人口点（农村 + 城市）的固定人头税，每周期记入国库一次。由 `form` 生成（Monarchy 0.20、Theocracy 0.10、Union 0.13、Republic 0.15、Anarchy 0），每个国家略有抖动。中立国始终为 `0`
- `treasury`: `number` - 累计的国家货币余额。由 `States.collectTaxes()` 从 `deal.tax`（销售税）加上 `pollTax × (rural + urban)` 重置并补充。中立国始终为 `0`
- `lock`: `boolean` - 若国家已锁定（不受重新生成影响）则为 `true`
- `removed`: `boolean` - 若国家已移除则为 `true`
- `note`: `string` - 可选。用户关于该国家的注释（图例），为 html。随国家一同删除

### Regiment ｜ 军团

- `i`: `number` - 军团 id，等于该军团在 `state[x].military` 数组中的索引。不唯一，因为使用的是唯一字符串 `regimentStateId-regimentId`
- `x`: `number` - 军团 x 坐标
- `y`: `number` - 军团 y 坐标
- `bx`: `number` - 军团基地 x 坐标
- `by`: `number` - 军团基地 y 坐标
- `angle`: `number` - 军团旋转角度（度）
- `icon`: `string` - 图标引用：裸符号 id，如 `glyph-2694-fe0f` 或 `custom-1a2b3c4d`（见 [Icons](icons.md)）；无则为空
- `cell`: `number` - 军团原始单元格 id
- `state`: `number` - 军团所属国家 id
- `name`: `string` - 军团名称
- `n`: `number` - 若军团是独立单位（如海军单位）则为 `1`，否则为 `0`
- `u`: `Record<unitName, number>` - 军团内容对象
- `note`: `string` - 可选。用户关于该军团的注释（图例），为 html。随军团一同删除

## Provinces ｜ 省份

省份数据以对象数组存储，元素顺序严格。元素 0 未使用。若省份被移除，该元素并不会被删除，而是改为添加 `removed` 属性。对象结构：

- `i`: `number` - 省份 id，始终等于数组索引
- `name`: `string` - 省份名称的短（专有）形式
- `formName`: `string` - 政体名称字符串，用于得到省份的 `fullName`
- `fullName`: `string` - 省份全名。由专有名称与省份 `formName` 组合而成
- `color`: `string` - 省份颜色，十六进制（如 `#45ff12`）或指向阴影图案的链接（如 `url(#hatch7)`）
- `center`: `number` - 省份中心（初始单元格）的单元格 id
- `pole`: `number[]` - 省份的不可达极（视觉中心）坐标，见[概念说明](https://blog.mapbox.com/a-new-algorithm-for-finding-a-visual-center-of-a-polygon-7c77e6492fbc?gi=6bd4fcb9ecc1)
- `area`: `number` - 省份面积，单位为像素
- `burg`: `number` - 省份首府城镇的 id（若有）
- `burgs`: `number[]` - 省份内城镇的 id。可选（打开省份编辑器时添加）
- `cells`: `number` - 省份内的单元格数量
- `rural`: `number` - 省份单元格的农村（非城镇）人口。以人口点计
- `urban`: `number` - 省份的城市（城镇）人口。以人口点计
- `coa`: `object` - [Armoria 的 COA 格式](https://github.com/Azgaar/armoria-api#readme)的纹章，或指向库中图标的图片纹章 `{ icon: string, shield?: string }`。两种形式都可带有可选的 `size`、`x` 和 `y` 字段，用于地图放置。图片纹章可裁剪为盾形，但不能在 Armoria 中作为纹章编辑
- `label`: `Label` - 可选的省份标签覆盖。若缺失，渲染器会根据省份数据推导文本和路径
- `lock`: `boolean` - 若省份已锁定（不受重新生成影响）则为 `true`
- `removed`: `boolean` - 若省份已移除则为 `true`
- `note`: `string` - 可选。用户关于该省份的注释（图例），为 html。随省份一同删除

## Religions ｜ 宗教

宗教数据以对象数组存储，元素顺序严格。元素 0 保留给 "No religion"。若宗教被移除，该元素并不会被删除，而是改为添加 `removed` 属性。对象结构：

- `i`: `number` - 宗教 id，始终等于数组索引
- `name`: `string` - 宗教名称
- `type`: `string` - 宗教类型。可用类型有 `Folk`、`Organized`、`Heresy` 和 `Cult`
- `form`: `string` - 宗教形式
- `deity`: `string` - 宗教的最高神祇（若有）
- `color`: `string` - 宗教颜色，十六进制（如 `#45ff12`）或指向阴影图案的链接（如 `url(#hatch7)`）
- `code`: `string` - 宗教名称缩写。用于渲染宗教树
- `origins`: `number[]` - 祖先宗教的 id。若宗教没有祖先则为 `[0]`。用于渲染宗教树。数组第一个成员为主链接，其余为辅助的树外链接
- `center`: `number` - 宗教中心（初始单元格）的单元格 id
- `culture`: `number` - 宗教的原始文化
- `expansionism`: `number` - 宗教扩张系数。在宗教生成期间用于确定竞争规模
- `expansion`: `string` - 宗教扩张类型。可为 `culture`（宗教仅在其文化内扩张）或 `global`
- `area`: `number` - 宗教面积，单位为像素
- `cells`: `number` - 宗教内的单元格数量
- `rural`: `number` - 宗教单元格的农村（非城镇）人口。以人口点计
- `urban`: `number` - 宗教的城市（城镇）人口。以人口点计
- `lock`: `boolean` - 若宗教已锁定（不受重新生成影响）则为 `true`
- `removed`: `boolean` - 若宗教已移除则为 `true`
- `note`: `string` - 可选。用户关于该宗教的注释（图例），为 html。随宗教一同删除

## Rivers ｜ 河流

Rivers 数据以无序对象数组存储（因此元素 id _不是_数组索引）。对象结构：

- `i`: `number` - 河流 id
- `name`: `string` - 河流名称
- `type`: `string` - 河流类型，仅用于得到河流全名
- `source`: `number` - 河流源头所在单元格的 id
- `mouth`: `number` - 河流入海口所在单元格的 id
- `parent`: `number` - 父河流 id。若河流没有父河流，则值为自身 id 或 `0`
- `basin`: `number` - 河流流域 id。流域 id 是河系主干的 id。若河流没有父河流，则值为自身 id
- `cells`: `number[]` - 河流各点所在单元格的 id 列表。单元格可能不唯一。单元格值为 `-1` 表示河流流出画布
- `points`: `number[][]` - 河流各点坐标。自动生成的河流不存储点，渲染时依赖 `cells`
- `discharge`: `number` - 河流流量，单位为 m³/s
- `length`: `number` - 河流长度，单位为 km
- `width`: `number` - 河口宽度，单位为 km
- `sourceWidth`: `number` - 渲染时给河流源头增加的额外宽度。用于让湖泊出口按流量以一定宽度起始。也可用于手动创建水道
- `note`: `string` - 可选。用户关于该河流的注释（图例），为 html。随河流一同删除

## Markers ｜ 标记

Markers 数据以无序对象数组存储（因此元素 id _不是_数组索引）。对象结构：

- `i`: `number` - 标记 id。`'marker' + i` 用作 svg 元素 id
- `name`: `string` - 标记名称，显示在注释框标题和标记总览中
- `icon`: `string` - 图标引用：裸符号 id，如 `glyph-1f30b` 或 `goods-wine`（见 [Icons](icons.md)）；无则为空
- `x`: `number` - 标记 x 坐标
- `y`: `number` - 标记 y 坐标
- `cell`: `number` - 单元格 id，用于防止在同一单元格生成多个标记
- `type`: `string` - 标记类型。若设置，样式更改将应用于同类型的所有标记。可选
- `size`: `number` - 标记大小，单位为像素。可选，默认值为 `30`（30px）
- `fill`: `string` - 标记图钉填充色。可选，默认为 `#fff`（白色）
- `stroke`: `string` - 标记图钉描边色。可选，默认为 `#000`（黑色）
- `iconFill`, `iconStroke`: `string` - 图标留空部分的颜色。可选，默认为图标自身的涂装（见 [Icons](icons.md#icon-paint)）
- `pin`: `string`：图钉元素类型。可选，默认为 `bubble`。若值设为 `no`，则不渲染图钉
- `pinned`: `boolean`：若存在被固定的标记，则只渲染 `pinned = true` 的标记。可选
- `dx`: `number` - 图标 x 偏移百分比。可选，默认为 `50`（50%，居中）
- `dy`: `number` - 图标 y 偏移百分比。可选，默认为 `50`（50%，居中）
- `px`: `number` - 图标框大小，单位为像素。可选，默认为 `12`（12px）
- `lock`: `boolean` - 若标记已锁定（不受重新生成影响）则为 `true`。可选
- `note`: `string` - 可选。用户关于该标记的注释（图例），为 html。随标记一同删除

## Labels ｜ 标签

每种类型的每个标签都由同一个 `Label` 记录描述。所有字段均为可选：

- `text`: `string` - 显示文本的覆盖值。竖线字符（`|`）用于分隔行
- `group`: `string` - 可选的标签分组覆盖
- `dx`: `number` - 地图坐标中的水平平移
- `dy`: `number` - 地图坐标中的垂直平移
- `pathPoints`: `number[][]` - 路径控制点，为 `[x, y]` 对，文本沿其弯曲。有三种状态：
  `undefined` 表示使用该标签类型的默认几何（国家为自动适配的路径，河流或路线为其自身线条，城镇和省份则没有），空数组表示该标签明确
  按纯文本渲染，非空数组则表示标签自身的路径
- `startOffset`: `number` - 文本沿路径的起始位置百分比；默认为 `50`。无路径时忽略
- `fontSize`: `number` - 相对于标签分组大小的字号百分比。默认为 `100`
- `letterSpacing`: `number` - 单个标签的字母间距，单位为像素。默认为 `0`（该属性为 null）

每个标签都属于某个地图实体，实体为其提供身份和位置。标签记录本身存储在该实体上，如 `pack.states[i].label`、`pack.provinces[i].label`、`pack.burgs[i].label`、
`pack.rivers[i].label` 和 `pack.routes[i].label`。

用户添加的标签没有这样的实体，因此会拥有自己的实体，以无序的 `AddedLabel[]` 存储在 `pack.addedLabels` 中：

- `i`: `number` - 稳定 id
- `x`, `y`: `number` - 标签在地图坐标中的位置，在 `dx`/`dy` 偏移之前
- `label`: `Label` - 标签记录，与任何其他实体上的一样。始终存在，因为承载标签是该实体唯一的用途；与其他实体不同，它没有可回退的名称，因此其文本存于 `label.text`
- `note`: `string` - 可选。用户关于该新增标签的注释（图例），为 html。随标签一同删除

运行时，标签分组样式索引在 `style.labels.groups` 中，以分组 id 为键。当前的 `.map` 文件在数据索引 48 处序列化完整的全局 `style` 对象。1.140 之前的迁移会从旧的 SVG 分组属性重建它；1.140 之前的缩放自动可见性会把 `display: none` 写入分组的行内样式，迁移会将其剥除，而一次自动更新（1.151.2）会从 1.150-1.151.1 保存的样式记录中剥除它，因此存储的分组样式绝不会带有 `display`。所有标签类型都可以共用一个分组而不改变其渲染图元：
带有 `pathPoints` 的标签渲染为 `<textPath>`，其他任何标签都渲染为定位的 `<text>`，标签编辑器允许用户为任意标签切换这两种方式，无论其类型如何。回退分组分别为 `states`、
`provinces`、所配置的默认城镇分组和 `added`。

有序的标签分组策略存储在 `options.map.labels` 中，因此会随 `.map` 文件一同传输：

- `groups`: `LabelGroupOptions[]` - 有序的分组定义

`showAll` 是对各组活动状态、缩放边界和图层依赖的覆盖，它是每个浏览器的偏好而非地图值，因此位于 `options.app.labels.showAll` 中，绝不会随地图保存

标签和城镇分组注册表是用户自己的集合，会通过 `options.map` 带入每张新地图，因此旧版本存储的值会被修复而非直接信任：`Options.repairSets` 在地图加载和新地图时都会运行，并为任何会导致无可绘制内容的项恢复默认值——空集合、没有自身分组的标签类型（`Labels.restoreMissingTypes`），或没有标记为默认的分组可供分配回退的城镇注册表（`Burgs.ensureDefaultGroup`）。

每个 `LabelGroupOptions` 包含：

- `name`: `string` - 全局唯一的逻辑分组 id
- `type`: `states | burgs | provinces | added` - 组织类别和默认来源
- `active`: `boolean` - 手动可见性开关
- `layerDependency`: `LayerId | null` - 可选的图层开关 id；未知 id 按关闭处理
- `zoom.min` 和 `zoom.max`: `number | null` - 包含端点在内的地图比例边界
- `mode`: `auto | short | full` - 生成的国家和省份名称策略

规范的保护分组是 `states`、`provinces`、`added` 以及每个活动的城镇分组。SVG 分组 id 是便于实现的 `labels-${name}` 值；逻辑 id 始终从 `data-group` 读取。

可选的分组级 `data-dx` 和 `data-dy` 值保留在样式数据中。渲染会在父 SVG 分组上推导出一个 CSS 平移，因此偏移会均匀应用于该分组中的每个标签。

城镇港口符号按城镇分组在 `styles.burgIcons.groups.<name>.groups.anchors` 中设置样式。其 `options.icon` 选择 SVG 符号，`size` 设置其缩放，可选的 `dx` / `dy` 偏移以图标大小为单位相对城镇移动它（正值向右 / 向下）。偏移缺失表示零。同一分组条目的 `groups.icons` 保存城镇图标自身的属性和选项。

## Routes ｜ 路线

Routes 数据以无序对象数组存储（因此元素 id _不是_数组索引）。对象结构：

- `i`: `number` - 路线 id。请注意，id 为 `0` 的元素是完整有效的路线，而非占位符
- `points`: `number[]` - 控制点数组，格式为 `[x, y, cellId]`
- `feature`: `number` - 路线所属的地物 id。自动生成的路线不能跨越多个地物
- `group`: `string` - 路线分组。默认分组有：'roads'、'trails'、'searoutes'
- `length`: `number` - 路线长度，单位为 km。可选
- `name`: `string` - 路线名称。可选
- `lock`: `boolean` - 若路线已锁定（不受重新生成影响）则为 `true`。可选
- `note`: `string` - 可选。用户关于该路线的注释（图例），为 html。随路线一同删除

## Zones ｜ 区域

Zones 数据以对象数组存储，`i` 不一定等于元素索引，但元素顺序决定渲染顺序，且这一点很重要。对象结构：

- `i`: `number` - 区域 id。请注意，id 为 `0` 的元素是完整有效的区域，而非占位符
- `name`: `string` - 区域描述
- `type`: `string` - 区域类型
- `color`: `string` - 指向阴影图案的链接（如 `url(#hatch7)`）或十六进制颜色（如 `#45ff12`）
- `cells`: `number[]` - 区域单元格数组
- `lock`: `boolean` - 若区域已锁定（不受重新生成影响）则为 `true`。可选
- `hidden`: `boolean` - 若区域已隐藏（不显示）则为 `true`。可选
- `note`: `string` - 可选。用户关于该区域的注释（图例），为 html。随区域一同删除

## Ice ｜ 冰

Ice 数据以对象数组存储，`i` 不一定等于元素索引，但元素顺序决定渲染顺序，且这一点很重要。对象结构：

- `i`: `number` - 冰元素 id。请注意，id 为 `0` 的元素是完整有效的冰元素，而非占位符
- `type`: `glacier | iceberg` - 冰类型
- `offset`: `[number, number]` - 冰的位置偏移，单位为 px，可选，仅为手动拖动的冰元素添加
- `points`: `number[][]` - 冰元素的顶点位置

## Relief ｜ 地形起伏

地形起伏图标存储在 `pack.relief: ReliefIcon[]` 中。数组顺序决定绘制顺序；生成时按包围盒底部（`y + s`）排序，因此位置较低的图标会盖住其后图标的底部。每个图标为
`{ type, variant?, set?, x, y, s }` 或 `{ icon, x, y, s }`，以普通 JSON 存储，没有解析/序列化步骤。`Relief.ref` 会构建每个描述符，因此默认的 `variant`
1 从不写入。`type` 指定逻辑地形起伏类型，`variant` 指定一个永久的变体槽位；渲染器会把缺失的 `variant` 解析为 1，因此存储数据与绘制数据绝不会不一致。
`set` 是可选的显式指定；缺失表示跟随样式。`icon` 是任意图标引用（自定义图标、字形、其他套组的图样），绘制在类型槽位的位置；它忽略样式所指定的套组。

`styles.relief.options` 保存 `set`（`simple`、`colored`、`gray`、`illustrated`、`stickers`）、`size` 和 `density`，与样式存储一同序列化在字段 48 中。`s` 是基础大小；`size` 是渲染系数，绘制时围绕图标锚点缩放它，因此更改套组或大小都不会修改 `pack.relief`，数组顺序也保持为有效的 z 序。
`options.map.relief.rules` 决定由哪个池放置陆地单元格的地形起伏：第一条**地形起伏规则**，其包含端点的 `height`（0–100）和 `temperature`（°C，`null` 边界表示开放）范围覆盖该单元格，且其可选的 `biomes` id 包含该单元格的生物群系（缺失表示所有生物群系），即认领该单元格，否则该单元格采用其生物群系的池。规则为 `{ name, height, temperature, biomes?, icons, density, size }`：`icons` 和 `density` 与生物群系的池相同，`size` 是规则最低高度处的图标大小，每升高一个高度单位增长 0.8，直至 `size.max`，之后才乘以每个条目的 `size` 系数。生物群系池的图标比它早 16–20 个单位。规则为每个单元格选择一个条目和变体，在没有选择余地的地方不消耗
随机数，因此默认规则能复现较早的固定丘陵和山脉。早于 v1.154.0 的地图会获得默认规则。
每个联合槽位都可经由真实图样或确定性别名在每个套组中解析。布局、回退解析和迁移约定见 [Icons](icons.md)。

## Measurers ｜ 测量器

测量器（绘制在地图之上的尺子及其他测量工具）存储在 `pack.measurers: Measurer[]` 中。生成地图时会创建一个横跨最大陆块的默认尺子。存储在 .map 文件中。v1.138.0 之前，测量器被序列化为独立字符串（已弃用的 `rulers` 数据），加载时自动更新为 `pack.measurers`。对象结构：

- `type`: `Ruler | Opisometer | RouteOpisometer | Planimeter` - 测量器类型
- `points`: `[number, number][]` - 控制点数组，格式为 `[x, y]`

## Goods ｜ 物资

物资（可交易的资源和产品）存储在 `pack.goods: Good[]` 中。物资 `i` 从 `1` 开始，且**不是**数组索引——查找时请使用 `Goods.get(i)`（由稀疏的 `goodById` 支持）。默认目录由 `GOODS_DATA` 构建。存储在 .map 文件中。物资若具有 `distribution` 则为*原料*，若具有 `recipes` 则为*制成品*，若两者兼有则为*混合*。对象结构：

- `i`: `number` - 物资 id（从 1 开始，不是数组索引）
- `name`: `string` - 物资名称
- `tags`: `string[]` - 自由形式的分类标签（用于在物资编辑器中筛选）
- `value`: `number` - 单位基础价格；所有市场定价的锚点
- `unit`: `string` - 计量单位标签（如 `kg`、`barrel`）
- `icon`: `string` - 用于该物资地图/UI 图标的图标引用：通常是物资图标集中的 `goods-<file>`，或任何其他图标，包括自定义图标（见 `icons.md`）
- `color`: `string` - 物资颜色，十六进制
- `chance`: `number` - 原料/混合物资的放置概率（0–100）。仅制成品的物资为 `0`。可选
- `distribution`: `string` - 按单元格求值的 JS 表达式，用于决定原料物资的放置位置（使用分布方法表；见 [goods_schema.md](../domain/goods_schema.md)）。可选
- `biomeOutput`: `Record<biomeId, number>` - 每个生物群系、每个生产周期、每个农村人口点产出的单位数。可选
- `recipes`: `Record<goodId, number>[]` - 备选配方数组；每个配方将输入物资 id 映射到每产出 1 单位所消耗的单位数。可选
- `multipliers`: `object` - 各维度的生产系数，每个都是可选的 `Record<id, number>`：`cultureType`、`culture`、`state`、`religion`、`biome`、`zone`。缺失或为 `1` 表示无影响，`0` 表示完全抑制；生效的因子按乘法组合。`GOODS_DATA` 中只包含与地图无关的 `cultureType`；其余通过编辑器按地图设置。可选
- `demandCoverage`: `Record<category, number>` - 一单位该物资对每个需求类别（`food`、`utilities`、`construction`、`military`、`luxury`）的满足程度。可选
- `note`: `string` - 可选。用户关于该物资的注释（图例），为 html。随物资一同删除

## Markets ｜ 市场

市场（区域经济中心）存储在 `pack.markets: Market[]` 中。注意市场 `i` 从 `1` 开始，且**不是**数组索引——查找时请使用 `Markets.get(i)`（由稀疏的 `marketById` 支持）。`cells.market` 值为 `0` 表示该单元格未分配。存储在 .map 文件中。对象结构：

- `i`: `number` - 市场 id（从 1 开始，不是数组索引）
- `centerBurgId`: `number` - 市场所依托城镇的 id
- `color`: `string` - 市场颜色，十六进制，用于领地渲染
- `goods`: `Record<goodId, {stock: number; price: number}>` - 每种物资的状态。存储单一的中间价 `price`；面向客户的 `buyPrice` / `sellPrice` 按需通过 `MARKET_MARGIN` 推导
- `name`: `string` - 可选的市场名称，由中心城镇的名称推导
- `note`: `string` - 可选。用户关于该市场的注释（图例），为 html。随市场一同删除

## Biomes ｜ 生物群系

生物群系定义存储在 `pack.biomes: Biome[]` 中，其中 `i` 等于数组索引。单元格通过 `pack.cells.biome` 引用生物群系。对象结构：

- `i`: `number` - 生物群系 id，始终等于数组索引
- `name`: `string` - 生物群系名称
- `color`: `string` - 生物群系颜色，十六进制（如 `#45ff12`）或指向阴影图案的链接
- `cost`: `number` - 非负的移动成本，用于文化、国家和宗教的扩张
- `habitability`: `number` - 非负的宜居度值；`0` 表示不宜居
- `icons`: `Record<string, { weight: number; size?: number }>` - 地形起伏池：低地地形起伏条目，按插入顺序排列，每项具有正权重和可选的正 `size`（池图标大小的系数，缺失为 1）。键为地形起伏类型（`dune`）或图标引用（`custom-1a2b3c4d`）。v1.154.0 之前为重复条目的列表
- `iconsDensity`: `number` - 该生物群系低地地形起伏的密集程度。为 `0`（无）到 `250` 的整数
- `removed`: `boolean` - 已移除自定义生物群系的可选标记
- `note`: `string` - 可选。用户关于该生物群系的注释（图例），为 html。随生物群系一同删除

用于分配默认生物群系 id 的温度和湿度查找矩阵属于生成器配置，而非地图状态。单元格数量、面积和人口统计按需计算，不存储在生物群系对象上。

## Deals ｜ 交易

交易记录日志存储在 `pack.deals: Deal[]` 中。在一个生产周期内为只追加，重新生成时重建。对象结构：

- `i`: `number` - 交易 id；在市场被移除而丢弃交易之前等于数组索引，因此请按 `i` 查找
- `seller`: `number` - 卖方的城镇 id 或市场 id
- `sellerType`: `"burg" | "market"` - `seller` 所指的内容
- `buyer`: `number` - 买方的城镇 id 或市场 id
- `buyerType`: `"burg" | "market"` - `buyer` 所指的内容
- `good`: `number` - 物资 id
- `units`: `number` - 交易数量，保留 2 位小数
- `price`: `number` - 交易时的单位价格，保留 2 位小数。对于市场间交易，这是进口方的到岸成本（出口方价格 + 运输 + 出口方销售税）
- `tax`: `number` - 可选。以货币单位表示的绝对销售税额，当卖方国家具有非零 `salesTax` 时，在城镇销售和市场间交易中设置。`States.collectTaxes()` 将其累加到卖方国家的国库中

## Journeys ｜ 旅程

旅程存储在 `pack.journeys: Journey[]` 中。默认每张地图生成一个旅程。对象结构：

- `i`: `number` - 旅程 id，唯一但不一定是数组索引（移除不会重新索引）
- `name`: `string` - 旅程名称
- `type`: `string` - 这是何种旅行，如 `Quest`、`Raid`、`Pilgrimage`。自由形式，由生成的原型设置
- `color`: `string` - 旅程颜色，十六进制；各分段可覆盖它
- `segments`: `JourneySegment[]` - 旅程的各段，按行进顺序排列
- `visible`: `boolean` - 可选。`false` 会在地图上隐藏该旅程。缺失表示可见
- `lock`: `boolean` - 可选。已锁定的旅程在“全部移除”后仍保留
- `note`: `string` - 可选。用户关于该旅程的注释（图例），为 html。随旅程一同删除

旅程分段是一段行程：一段行进，或一次停留：

- `i`: `number` - 分段 id，在旅程内唯一。在生成的旅程中为连续编号，但编辑不会重新索引，因此并不总是数组索引
- `name`: `string` - 分段名称
- `color`: `string` - 可选。覆盖旅程颜色
- `from` / `to`: `number` - 可选。端点单元格 id。在用户选择之前缺失
- `transport`: `string` - 运输类型**名称**（不是 id）：分段按名称引用 `options.map.transports`，因此重命名类型会更新每个分段，而移除类型会使该分段无法解析
- `speed`: `number` - 行进速度，单位为 km/h，始终如此，与用户的距离单位无关。默认为该运输方式的速度；用户可按分段覆盖
- `distance`: `number` - 路径长度，单位为 px。乘以 `distanceScale` 可得用户距离单位
- `points`: `[x, y, cellId][]` - 绘制的路径，来自寻路或手绘
- `avoidRoads`: `boolean` - 可选，仅陆地分段。绕开道路网络，并应用越野速度惩罚
- `duration`: `number` - 可选。行进时间，单位为小时；设置后覆盖距离/速度计算。在停留段上总会设置，因为停留没有可用于推导时间的速度
- `custom`: `boolean` - 可选。当用户逐单元格绘制路径时为 `true`；寻路器不会悄悄覆盖它
- `visible`: `boolean` - 可选。`false` 隐藏该分段。缺失表示可见

## Transports ｜ 运输

运输类型属于配置，而非地图状态：它们位于 `options.map.transports: Transport[]` 中。对象结构：

- `i`: `number` - 运输类型 id
- `name`: `string` - 运输类型名称。这是分段引用的键，因此必须保持唯一
- `speed`: `number` - 行进速度，单位为 km/h
- `domain`: `"land" | "water" | "air" | "stay"` - 同时决定寻路策略和哪些端点是有效的。`stay` 表示完全不移动
- `hoursPerDay`: `number` - 可选。使用该运输方式一天可持续的行进小时数，用于将行进小时数转换为天数。在它变为可配置之前保存的地图中缺失，此时回退到按域设置的默认值

## Name bases ｜ 名称基

名称生成器使用真实世界城镇名称的训练集（幻想名称基除外），它们存储在全局可用的 `nameBases` 数组中。每个数组元素代表一个独立的基。基结构为：

- `i`: `number` - 基 id，始终等于数组索引
- `name`: `string` - 名称基的专有名称
- `b`: `string` - 包含逗号分隔名称列表的长字符串
- `min`: `number` - 生成名称的建议最小长度。生成器会不断添加新音节，直到达到最小长度
- `max`: `number` - 生成名称的建议最大长度。若达到最大长度，生成器会停止添加新音节
- `d`: `string` - 生成名称中允许重复的字母
- `m`: `number` - 若生成的是多词名称，其中有多少个应转换为单个词。`0` 表示不允许多词名称，`1` 表示所有生成的多词名称都保持原样
