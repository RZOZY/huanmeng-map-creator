// 图层中文名（含 <u> 快捷键标记，保留原样式）
//
// 图层按钮是 <li data-layer="...">，内容形如 Te<u>x</u>ture —— 文本被 <u> 切成多个节点，
// 整串匹配必然失效，所以改按 data-layer 属性整块替换 innerHTML。
// 名称取自幻艺地图；其中 rulers 幻艺误译为「统治者」，按图层语义改为「标尺」。
export const LAYER_NAMES: Record<string, string> = {
  texture: "纹<u>理</u>",
  heightmap: "<u>高</u>度图",
  lakes: "湖泊",
  biomes: "<u>生</u>物群系",
  cells: "单<u>元</u>",
  grid: "网格",
  coordinates: "坐<u>标</u>",
  compass: "<u>风</u>向玫瑰",
  rivers: "河<u>流</u>",
  relief: "地<u>形</u>",
  religions: "<u>宗</u>教",
  cultures: "<u>文</u>化",
  states: "<u>国</u>家",
  provinces: "<u>省</u>份",
  zones: "<u>区</u>域",
  borders: "边<u>界</u>",
  routes: "路<u>线</u>",
  temperature: "<u>气</u>温",
  ice: "冰盖",
  goods: "<u>商</u>品",
  markets: "市场",
  trade: "贸易",
  precipitation: "降<u>水</u>量",
  population: "人<u>口</u>",
  emblems: "徽标",
  burgIcons: "<u>图</u>标",
  labels: "<u>标</u>签",
  military: "<u>军</u>事",
  markers: "标<u>记</u>",
  journeys: "旅程",
  rulers: "标<u>尺</u>",
  scaleBar: "比例尺",
  vignette: "暗角"
};
