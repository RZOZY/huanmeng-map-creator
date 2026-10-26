import type { MapCommand } from "@/components/map-commands";
import { LAYER_NAMES } from "./layer-names";

export interface CommandSearchText {
  name: string;
  keywords: string;
}

// Only built-in command IDs are localized; model names and unknown commands stay untouched.
const COMMAND_TEXT: Readonly<Record<string, readonly [name: string, keywords: string]>> = {
  startTour: ["开始交互导览", "帮助 指南 教程"],
  newMap: ["生成新地图", "重新生成 随机 创建"],
  saveToMachine: ["保存地图文件", "存储 本地 磁盘 备份"],
  saveMapAs: ["地图另存为…", "保存 副本 文件名 文件夹 位置 备份"],
  loadFromFile: ["从文件加载地图", "打开 上传 本地 磁盘"],
  quickLoad: ["快速加载地图", "浏览器 存储 恢复"],
  saveToStorage: ["保存地图到浏览器存储", "本地 缓存"],
  saveToDropbox: ["保存地图到 Dropbox", "云端 云存储"],
  loadFromURL: ["从 URL 加载地图", "打开 网址 链接"],
  saveButton: ["显示保存面板", "存储 对话框"],
  loadButton: ["加载地图", "打开 面板 对话框"],
  exportButton: ["显示导出面板", "地图 下载 图片 数据"],
  copyMapURL: ["复制地图 URL", "种子 网址 链接 分享 剪贴板"],
  seedHistory: ["显示种子历史", "以前 地图 恢复"],
  editStatesButton: ["打开国家编辑器", "王国 邦国"],
  overviewBurgsButton: ["打开城镇总览", "聚落 城市 村庄"],
  editCulturesButton: ["打开文化编辑器", "族群 民族"],
  editReligions: ["打开宗教编辑器", "信仰"],
  editProvincesButton: ["打开省份编辑器", "领地 郡县"],
  editHeightmapButton: ["编辑高度图", "地形 海拔"],
  editBiomesButton: ["打开生物群系编辑器", "环境 生态 地形"],
  editReliefRules: ["打开地形规则编辑器", "图标 山脉 丘陵 树木 生物群系"],
  editDiplomacyButton: ["打开外交总览", "关系 盟友 战争"],
  overviewFeaturesButton: ["打开地理特征总览", "地物 岛屿 湖泊 海洋 陆地 水体 大陆"],
  overviewRiversButton: ["打开河流总览", "水道"],
  overviewRoutesButton: ["打开路线总览", "道路 小径 路径"],
  overviewMarkersButton: ["打开标记总览", "兴趣点 地点"],
  overviewLabelsButton: ["打开标签总览", "文本 排版"],
  editZonesButton: ["打开区域编辑器", "地区 范围"],
  overviewMilitaryButton: ["打开军事总览", "军队 军团"],
  regiments: ["打开军团总览", "军事 军队"],
  editEmblemButton: ["打开纹章编辑器", "徽标 徽章 盾徽"],
  editNotesButton: ["打开笔记编辑器", "设定 描述 传说"],
  lore: ["打开地图背景设定", "描述 历史 故事"],
  editNamesBaseButton: ["打开名称库编辑器", "地名 人名 语言 命名"],
  editUnitsButton: ["打开单位编辑器", "比例 距离 人口"],
  editCoastlineSettings: ["打开海岸线编辑器", "海岸 岛屿 海洋"],
  editMeasurersButton: ["打开测量工具编辑器", "测量器 标尺 距离"],
  editGoods: ["打开商品编辑器", "资源 产品 经济"],
  overviewMarketsButton: ["打开市场总览", "经济 贸易"],
  productionChains: ["打开生产链", "商品 配方 经济"],
  editTradeAnimationButton: ["打开贸易动画编辑器", "经济"],
  overviewJourneysButton: ["打开旅程总览", "旅行 任务"],
  transports: ["打开运输方式编辑器", "旅程 旅行 速度"],
  burgGroups: ["打开城镇分组编辑器", "聚落 城市 村庄 类型"],
  labelGroups: ["打开标签分组编辑器", "文本 排版 字体"],
  routeGroups: ["打开路线分组编辑器", "道路 小径 路径 类型"],
  world: ["打开世界配置器", "气候 大小 纬度 温度"],
  overviewCellsButton: ["打开单元格详情", "单元 信息"],
  overviewChartsButton: ["打开数据图表", "统计 图形"],
  addBurgTool: ["添加城镇", "聚落 城市 村庄"],
  addLabel: ["添加标签", "文本"],
  addMarker: ["添加标记", "兴趣点 地点"],
  addRiver: ["添加河流", "水道"],
  drawRiver: ["绘制河流", "添加 水道 手动"],
  addRoute: ["添加路线", "道路 小径 路径"],
  selectHeightmap: ["选择高度图模板", "预设 生成 选项"],
  openSubmapTool: ["创建子地图", "生成 局部图 区域"],
  openTransformTool: ["变换地图", "旋转 缩放 大小"],
  openWrapTool: ["打开形变工具", "包裹 调整 单元格 笔刷"],
  openMinimapButton: ["打开小地图", "导航"],
  viewMesh: ["打开 3D 场景", "三维 视图 模式 网格"],
  viewGlobe: ["打开球体视图", "地球仪 地球 星球 模式"],
  showStatesChart: ["显示国家图表", "王国 面积 人口 气泡图"],
  showProvincesChart: ["显示省份图表", "领地 面积 人口 矩形树图"],
  showBurgsChart: ["显示城镇图表", "聚落 城市 人口 气泡图"],
  showCulturesHierarchy: ["显示文化谱系", "族群 起源 树状图"],
  showReligionsHierarchy: ["显示宗教谱系", "信仰 起源 树状图"],
  showRelationsHistory: ["显示关系历史", "外交 编年史 战争"],
  regenerateStates: ["重新生成国家", "王国"],
  regenerateProvinces: ["重新生成省份", "郡县"],
  regenerateBurgs: ["重新生成城镇", "聚落 城市 村庄"],
  regenerateCultures: ["重新生成文化", "族群 民族"],
  regenerateReligions: ["重新生成宗教", "信仰"],
  regenerateRivers: ["重新生成河流", "水道"],
  regenerateRoutes: ["重新生成路线", "道路"],
  regenerateStateLabels: ["重新生成国家标签", "文本 位置"],
  regenerateReliefIcons: ["重新生成地形图标", "山脉 森林"],
  regenerateEmblems: ["重新生成纹章", "徽标 徽章 盾徽"],
  regenerateMarkers: ["重新生成标记", "兴趣点 地点"],
  regenerateZones: ["重新生成区域", "地区"],
  regenerateMilitary: ["重新生成军事力量", "军队 军团"],
  regeneratePopulation: ["重新生成人口", "居民"],
  regenerateGoods: ["重新生成商品", "资源"],
  regenerateMarkets: ["重新生成市场", "经济"],
  regenerateProduction: ["重新生成生产", "贸易 经济"],
  regenerateEconomy: ["重新生成经济", "贸易"],
  regenerateIce: ["重新生成冰盖", "冰川 冰山"],
  configRegenerateMarkers: ["配置标记生成", "设置"],
  zoomReset: ["重置缩放", "适应 视图 全图"],
  zoomIn: ["放大地图", "视图 拉近"],
  zoomOut: ["缩小地图", "视图 拉远"],
  toggleOptions: ["切换菜单", "选项 面板 显示 隐藏"],
  layersTab: ["打开图层选项卡", "菜单 面板"],
  styleTab: ["打开样式选项卡", "菜单 面板 编辑器"],
  optionsTab: ["打开选项选项卡", "菜单 面板 设置"],
  toolsTab: ["打开工具选项卡", "菜单 面板"],
  aboutTab: ["打开关于选项卡", "菜单 面板 信息 署名"],
  exportSvg: ["导出为 SVG", "下载 矢量 图片"],
  exportPng: ["导出为 PNG", "下载 图片"],
  exportJpeg: ["导出为 JPEG", "下载 图片"],
  exportTiles: ["导出为 PNG 瓦片", "下载 压缩包"],
  exportJsonFull: ["导出完整 JSON", "下载 数据"],
  exportJsonMinimal: ["导出精简 JSON", "下载 数据"],
  exportJsonPackCells: ["导出打包单元格 JSON", "下载 数据"],
  exportJsonGridCells: ["导出网格单元格 JSON", "下载 数据"],
  exportGeoJsonCells: ["导出单元格为 GeoJSON", "下载 地理信息"],
  exportGeoJsonRoutes: ["导出路线为 GeoJSON", "下载 地理信息"],
  exportGeoJsonRivers: ["导出河流为 GeoJSON", "下载 地理信息"],
  exportGeoJsonMarkers: ["导出标记为 GeoJSON", "下载 地理信息"],
  exportGeoJsonZones: ["导出区域为 GeoJSON", "下载 地理信息"],
  exportCsvBurgs: ["导出城镇为 CSV", "下载 表格 聚落 城市 村庄"],
  exportCsvBiomes: ["导出生物群系为 CSV", "下载 表格 环境 地形"],
  exportCsvRelations: ["导出关系为 CSV", "下载 表格 外交 矩阵"],
  exportCsvGoods: ["导出商品为 CSV", "下载 表格 资源 经济"],
  exportCsvMarkers: ["导出标记为 CSV", "下载 表格 兴趣点 地点"],
  exportCsvMarkets: ["导出市场为 CSV", "下载 表格 经济 贸易"],
  exportCsvMilitary: ["导出军事为 CSV", "下载 表格 军队"],
  exportCsvRegiments: ["导出军团为 CSV", "下载 表格 军事 军队"],
  exportCsvNotes: ["导出笔记为 CSV", "下载 表格 设定 传说 描述"],
  exportCsvZones: ["导出区域为 CSV", "下载 表格 地区"],
  showInfo: ["显示应用信息", "关于 版本 帮助"],
  getApp: ["获取桌面应用", "安装 下载"],
  toggleSaveReminder: ["切换保存提醒", "自动保存 通知"],
  optionsReset: ["重置选项", "恢复 默认 清除 缓存 重新加载"],
  savePresetButton: ["保存图层预设", "显示 图层"]
};

const PRESET_NAMES: Readonly<Record<string, string>> = {
  political: "政治地图",
  cultural: "文化地图",
  religions: "宗教地图",
  provinces: "省份地图",
  biomes: "生物群系地图",
  heightmap: "高度图",
  physical: "自然地理地图",
  poi: "兴趣点",
  goods: "商品地图",
  trade: "贸易动画",
  military: "军事地图",
  emblems: "徽标",
  landmass: "纯陆地图"
};

export function getCommandSearchText(command: Pick<MapCommand, "id" | "name">): CommandSearchText {
  if (Object.hasOwn(COMMAND_TEXT, command.id)) {
    const [name, keywords] = COMMAND_TEXT[command.id];
    return { name, keywords };
  }
  if (command.id.startsWith("layer:")) {
    const id = command.id.slice(6);
    if (Object.hasOwn(LAYER_NAMES, id)) {
      const name = LAYER_NAMES[id].replace(/<\/?u>/g, "");
      return { name: `切换${name}图层`, keywords: "图层 可见性 显示 隐藏" };
    }
  }
  if (command.id.startsWith("preset:")) {
    const id = command.id.slice(7);
    if (Object.hasOwn(PRESET_NAMES, id))
      return { name: `应用图层预设：${PRESET_NAMES[id]}`, keywords: "图层 预设 显示" };
  }
  return { name: command.name, keywords: "" };
}
