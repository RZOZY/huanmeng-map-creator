// The shape of styles: one root node per style element. Every node carries the same three bags:
//   attrs   — SVG attributes, written to the element as they are; `null` means "attribute not set"
//   options — renderer inputs, never written to the DOM
//   groups  — named child nodes, fixed (statesBody, oceanWaves) or user-created (label groups)
import { z } from "zod";
import { GRID_TYPES } from "@/data/grid-types";
import { OCEAN_OUTLINES, OCEAN_PATTERNS } from "@/data/ocean-patterns";
import {
  CLIPS,
  CONTOUR_MODES,
  FONT_STYLES,
  FONT_WEIGHTS,
  HACHURE_MODES,
  HEIGHTMAP_CURVES,
  LAKE_EMBELLISHMENTS,
  LINECAPS,
  LINEJOINS,
  MAP_FILTERS,
  RELIEF_SETS,
  WAVE_TYPES
} from "@/data/style-choices";
import type { StyleMeta } from "@/types/styles";
import { hexColor } from "@/utils/schemaUtils";
import { FORMATS, isLabelStyle } from "./styles-formats";

export const styleMeta = z.registry<StyleMeta>();

const meta = <T extends z.ZodType>(schema: T, fieldMeta: StyleMeta): T => {
  styleMeta.add(schema, fieldMeta);
  return schema;
};
// a clone reads its parent's meta under its own, so a variant overrides what it names and keeps the rest
const variant = <T extends z.ZodType>(schema: T, fieldMeta: StyleMeta): T => meta(schema.clone(), fieldMeta);
const hidden = <T extends z.ZodType>(schema: T): T => variant(schema, { hidden: true }); // stored, never edited

const range = (min: number, max: number, fieldMeta: StyleMeta = {}) => meta(z.number().min(min).max(max), fieldMeta);
const count = (min: number, max: number, fieldMeta: StyleMeta = {}) =>
  meta(z.number().int().min(min).max(max), fieldMeta);
const number = (fieldMeta: StyleMeta = {}) => meta(z.number(), fieldMeta); // a slider when `range` is given
const flag = (fieldMeta: StyleMeta) => meta(z.boolean(), fieldMeta);
const text = (fieldMeta: StyleMeta) => meta(z.string(), fieldMeta);
const choice = (choices: Record<string, string>, fieldMeta: StyleMeta = {}) =>
  meta(z.enum(Object.keys(choices)), { choices, ...fieldMeta });
const solidColor = (fieldMeta: StyleMeta = {}) => meta(hexColor.clone(), { control: "color", ...fieldMeta });

// --- shared attrs -----------------------------------------------------------------------------------
const opacity = range(0, 1, { nullAs: 1, tip: "设置不透明度。0 为全透明，1 为不透明" }).nullable();

const color = solidColor().nullable();

const fill = variant(color, { label: "颜色", tip: "设置填充颜色" });
const fillOpacity = variant(opacity, { label: "不透明度", tip: "设置填充不透明度。0 为全透明，1 为不透明" });

const stroke = variant(color, { label: "Color", tip: "设置描边颜色" });
const strokeOpacity = variant(opacity, { label: "Opacity", tip: "设置描边不透明度。0 为全透明，1 为不透明" });

const strokeWidth = meta(z.number().min(0), {
  label: "宽度",
  nullAs: 0,
  range: [0, 10],
  tip: "设置描边宽度"
}).nullable();

const strokeDasharray = meta(z.string().regex(FORMATS.strokeDasharray), {
  control: "dash",
  label: "虚线样式",
  tip: "设置描边的虚线样式，例如 5 2"
})
  .nullable()
  .default(null);

const strokeLinecap = choice(LINECAPS, { label: "线端样式", tip: "设置描边的线端样式" }).nullable();

const strokeLinejoin = choice(LINEJOINS, { label: "拐角样式", tip: "设置描边的拐角样式" }).nullable();

const fontFamily = text({ control: "font", label: "字体族", tip: "选择字体" });

const fontSizePx = meta(z.string().regex(FORMATS.fontSizePx), {
  control: "px",
  label: "大小",
  range: [1, 40],
  tip: "设置字号（像素）"
});

const filter = meta(z.string().regex(FORMATS.filter), {
  control: "filter",
  tip: "为该元素选择滤镜。滤镜可能影响性能！"
}).nullable();

const blurFilter = meta(z.string().regex(FORMATS.blurFilter), {
  control: "blur",
  label: "模糊",
  range: [0, 10],
  tip: "模糊半径（像素）。设为 0 即实线"
}).nullable();

// a defs reference the renderer owns (url(#fog), url(#vignette-mask)): stored, never edited
const mask = hidden(z.string().regex(FORMATS.mask).nullable());

// the layers that clip to land or water offer the two masks
const clip = choice(CLIPS, { label: "裁剪", tip: "设置裁剪。只有未被裁掉的部分会显示" }).nullable();

const transform = hidden(z.string().nullable()); // a raw layer transform, not a style choice

const percentage = meta(z.string().regex(FORMATS.percentage), { control: "percent" });

const dashGroup = {
  "stroke-width": variant(strokeWidth, { group: "Stroke" }),
  "stroke-dasharray": variant(strokeDasharray, { group: "Stroke" }),
  "stroke-linecap": variant(strokeLinecap, { group: "Stroke" })
};

const strokeGroup = {
  stroke: variant(stroke, { group: "Stroke" }),
  "stroke-opacity": variant(strokeOpacity, { group: "Stroke" }),
  "stroke-width": variant(strokeWidth, { group: "Stroke" }),
  "stroke-dasharray": variant(strokeDasharray, { group: "Stroke" }),
  "stroke-linecap": variant(strokeLinecap, { group: "Stroke" }),
  "stroke-linejoin": variant(strokeLinejoin, { group: "Stroke" })
};

const fillGroup = { fill: variant(fill, { group: "Fill" }), "fill-opacity": variant(fillOpacity, { group: "Fill" }) };

// x/y shifts, in the unit of their element; a slider each: a dragged offset beats a typed one
const shift = (axis: string, reach: number, step: number, tip: string) =>
  number({ label: `Shift ${axis}`, range: [-reach, reach], step, tip });

// --- feature parts ----------------------------------------------------------------------------------
const borders = z.strictObject({
  attrs: z.strictObject({
    stroke,
    opacity,
    "stroke-width": strokeWidth,
    "stroke-dasharray": strokeDasharray,
    "stroke-linecap": strokeLinecap,
    filter
  })
});

const lake = z.strictObject({
  attrs: z.strictObject({ opacity, ...fillGroup, ...strokeGroup, filter }),
  options: meta(
    z.strictObject({
      embellishment: choice(LAKE_EMBELLISHMENTS, {
        tip: "沿岸的细密波纹，向开阔水面逐渐消失，小湖泊中会缩小"
      }),
      density: range(0.1, 4, { tip: "波纹行的疏密程度" }),
      length: range(0.2, 4, { tip: "波纹长度，会按可用水面宽度调整" }),
      halo: range(0, 2, {
        label: "岸边留白",
        step: 0.05,
        tip: "沿岸线留出的清水带，相对于湖泊波纹尺度"
      }),
      color: solidColor({ group: "Stroke", label: "Color" }),
      width: range(0.05, 2, { group: "Stroke", label: "Width", step: 0.05, tip: "波纹的描边宽度（地图像素）" }),
      opacity: range(0, 1, { group: "Stroke", label: "Opacity", step: 0.05, tip: "湖泊波纹的不透明度" })
    }),
    { gate: "embellishment", label: "装饰" }
  ).default({ embellishment: "none", density: 1, length: 1, halo: 0.2, color: "#000000", width: 0.3, opacity: 0.6 })
});

const contours = meta(
  z.strictObject({
    mode: choice(CONTOUR_MODES, {
      tip: "在高度图配色之上绘制平滑的等高线，或只显示等高线"
    }),
    interval: count(1, 20, {
      label: "间距",
      tip: "等高线之间的海拔间距。数值越小细节越多；每第五条线更粗"
    }),
    color: solidColor({ tip: "等高线的颜色" }),
    width: range(0.1, 2, { step: 0.05, tip: "次要等高线的宽度。每第五条线宽度加倍" }),
    opacity: range(0, 1, { step: 0.05, tip: "等高线的不透明度" })
  }),
  { gate: "mode" }
).default({ mode: "off", interval: 5, color: "#5c513e", width: 0.35, opacity: 0.5 });

// downhill pen strokes, denser and longer on steeper slopes
const hachures = meta(
  z.strictObject({
    mode: choice(HACHURE_MODES, {
      tip: "在高度图配色之上绘制下降笔触，或只显示笔触"
    }),
    density: range(0.1, 4, {
      tip: "笔触的疏密程度（相对默认值）。坡陡处会更密"
    }),
    length: range(0.2, 4, {
      tip: "笔触长度（相对默认值）。坡度变缓处笔触会提前中止"
    }),
    width: range(0.2, 4, {
      group: "Stroke",
      label: "Width",
      tip: "笔触根部的宽度（相对默认值）。坡缓处笔触更轻"
    }),
    color: solidColor({ group: "Stroke", label: "Color", tip: "晕渲笔触的颜色" }),
    opacity: range(0, 1, { step: 0.05, tip: "晕渲笔触的不透明度" })
  }),
  { gate: "mode" }
).default({ mode: "off", density: 1, length: 1, width: 1, color: "#5c513e", opacity: 0.65 });

const heightOptions = z.strictObject({
  scheme: text({ control: "scheme", label: "配色方案", tip: "为该元素选择配色方案" }),
  terracing: range(0, 20, { step: 1, tip: "梯田化强度。设为 0 即关闭" }),
  skip: range(0, 10, {
    label: "减少图层数",
    step: 1,
    tip: "图层减少比例。调高可提升性能"
  }),
  relax: range(0, 10, {
    label: "简化",
    step: 1,
    tip: "线条简化比例。调高可略微提升性能"
  }),
  curve: choice(HEIGHTMAP_CURVES, { label: "线条样式", tip: "选择线条插值类型" }),
  contours,
  hachures
});
const landHeights = z.strictObject({ attrs: z.strictObject({ opacity, filter, mask }), options: heightOptions });
const oceanHeights = meta(
  z.strictObject({
    attrs: landHeights.shape.attrs,
    options: heightOptions.extend({
      render: flag({ label: "渲染海洋高度", tip: "勾选以渲染海洋高度" })
    })
  }),
  { gate: "options.render" }
);

const coastlineBands = meta(
  z.strictObject({
    render: flag({ label: "海岸线色带", tip: "绘制跟随海岸线的同心色带" }),
    count: count(1, 8, { tip: "海岸周围的色带数量" }),
    spacing: range(0.2, 5, { tip: "色带间距（地图单位）；离岸越远色带越宽" }),
    width: range(0.05, 1, {
      group: "Outline",
      label: "Width",
      step: 0.05,
      tip: "分隔色带的深色线条宽度"
    }),
    color: solidColor({ group: "Outline", label: "Color" }),
    shore: solidColor({ label: "岸边色调", tip: "叠加在现有海洋上的色调，近岸处最强" }),
    shade: range(0, 1, {
      label: "明暗",
      step: 0.05,
      tip: "近岸色调的强度；设为 0 时海洋贴图上只保留轮廓"
    }).default(0.35),
    opacity: range(0, 1, { step: 0.05 })
  }),
  { gate: "render", label: "Coastline bands" }
).default({
  render: false,
  count: 5,
  spacing: 1.1,
  width: 0.25,
  color: "#575448",
  shore: "#b9b6a1",
  shade: 0.35,
  opacity: 1
});

// coastal and distant-sea strokes around a clear offshore band
const oceanWaves = meta(
  z.strictObject({
    // the renderer bakes the stroke into the drawing
    attrs: meta(
      z.strictObject({
        opacity,
        stroke: strokeGroup.stroke,
        "stroke-width": variant(strokeGroup["stroke-width"], { range: [0.05, 2], step: 0.05 }),
        "stroke-dasharray": strokeGroup["stroke-dasharray"],
        filter
      }),
      { effect: "draw" }
    ),
    options: z.strictObject({
      render: flag({
        label: "海洋装饰",
        tip: "在近岸留白带的外侧装饰沿岸与远处水面"
      }),
      type: choice(WAVE_TYPES, { tip: "选择海洋装饰的形状" }).default("waves"),
      density: range(0.1, 4, { tip: "装饰的疏密程度（相对默认值）" }),
      length: range(0.2, 4, { tip: "笔触长度（相对默认值）" }),
      reach: range(1, 12, {
        step: 0.5,
        tip: "装饰向海中渐隐的距离（按单元格间距计）"
      }),
      halo: range(0, 2, {
        label: "沿岸留白",
        step: 0.05,
        tip: "海岸线色带（或岸边）之外的清水带（按单元格间距计）"
      })
    })
  }),
  { gate: "options.render", label: "Ocean embellishment" }
).default({
  attrs: { opacity: 0.5, stroke: "#1f3846", "stroke-width": 0.5, "stroke-dasharray": null, filter: null },
  options: { render: false, type: "waves", density: 1, length: 1, reach: 4, halo: 0.25 }
});

const burgGroup = z.strictObject({
  attrs: z.strictObject({
    opacity,
    ...fillGroup,
    ...strokeGroup,
    filter
  }),
  options: z.strictObject({
    size: number({ label: "图标大小", range: [0.01, 100], step: 0.01, tip: "设置图标大小" }),
    icon: text({ control: "icon", tip: "选择图标" })
  })
});

// a port group takes the burg group and adds the shift of its own
const anchorGroup = burgGroup.extend({
  options: burgGroup.shape.options.extend({
    dx: meta(z.number().optional(), {
      label: "水平偏移",
      range: [-5, 5],
      step: 0.05,
      nullAs: 0,
      tip: "水平偏移（以图标大小为单位的正值向右）"
    }),
    dy: meta(z.number().optional(), {
      label: "垂直偏移",
      range: [-5, 5],
      step: 0.05,
      nullAs: 0,
      tip: "垂直偏移（以图标大小为单位的正值向下）"
    })
  })
});

const coastline = z.strictObject({
  attrs: z.strictObject({ opacity, stroke: stroke, "stroke-width": strokeWidth, filter })
});

const emblemGroup = z.strictObject({
  options: z.strictObject({ size: number({ range: [0, 5], step: 0.01, tip: "设置徽标大小倍率" }) })
});

const padding = (side: string) =>
  number({ group: "Padding", label: side, range: [0, 50], step: 0.5, tip: "背景元素的内边距（像素）" });

// --- the record -------------------------------------------------------------------------------------
// on change run scripts/convert-style-presets.mjs to automatically update style presets
export const stylesSchema = z.strictObject({
  biomes: z.strictObject({ attrs: z.strictObject({ opacity, filter }) }),
  borders: z.strictObject({ groups: z.strictObject({ stateBorders: borders, provinceBorders: borders }) }),
  burgIcons: z.strictObject({
    groups: z
      .record(
        z.string(),
        z.strictObject({
          groups: z.strictObject({
            icons: meta(burgGroup, { label: "图标" }),
            anchors: meta(anchorGroup, { label: "锚点" })
          })
        })
      )
      .refine(groups => Object.keys(groups).length > 0)
  }),
  cells: z.strictObject({ attrs: z.strictObject({ ...strokeGroup, filter, mask: clip }) }),
  coastline: z.strictObject({ groups: z.strictObject({ sea_island: coastline, lake_island: coastline }) }),
  compass: z.strictObject({
    attrs: z.strictObject({ opacity, transform, filter, mask: clip }),
    groups: z.strictObject({
      compassRose: z.strictObject({
        attrs: z.strictObject({
          transform: meta(z.string().regex(FORMATS.compassTransform), {
            control: "transform",
            label: "放置",
            tip: "设置风向玫瑰图的偏移与大小"
          }).nullable()
        })
      })
    })
  }),
  coordinates: z.strictObject({
    attrs: z.strictObject({
      stroke,
      opacity,
      "stroke-width": strokeWidth,
      "stroke-dasharray": strokeDasharray,
      "stroke-linecap": strokeLinecap,
      "font-size": variant(fontSizePx, { effect: "draw" }), // the renderer derives the drawn size from it
      filter,
      mask: clip
    })
  }),
  cultures: z.strictObject({ attrs: z.strictObject({ opacity, ...strokeGroup, filter }) }),
  emblems: z.strictObject({
    attrs: z.strictObject({ opacity, "stroke-width": variant(strokeWidth, { label: "描边宽度" }), filter }),
    groups: z.strictObject({
      stateEmblems: emblemGroup,
      provinceEmblems: emblemGroup,
      burgEmblems: emblemGroup
    })
  }),
  fogging: z.strictObject({ attrs: z.strictObject({ opacity, fill, mask, filter }) }),
  goods: z.strictObject({
    groups: z.strictObject({
      goodsCells: z.strictObject({ attrs: z.strictObject({ opacity, filter }) }),
      goodsIcons: z.strictObject({
        attrs: z.strictObject({
          opacity,
          stroke: variant(stroke, { label: "图标线条", tip: "图标线条的颜色" }),
          "stroke-width": variant(strokeWidth, {
            label: "Stroke Width",
            tip: "圆形轮廓的宽度；图标线条按它的 40% 绘制"
          }),
          filter
        }),
        options: z.strictObject({
          size: number({
            label: "标记大小",
            range: [1, 20],
            step: 0.5,
            tip: "设置商品标记（图标与圆形）的大小（像素）"
          }),
          circle: flag({ label: "显示圆形", tip: "显示或隐藏商品图标外的圆形" })
        })
      }),
      goodsBurgs: z.strictObject({
        attrs: z.strictObject({
          opacity,
          stroke: strokeGroup.stroke,
          "stroke-width": strokeGroup["stroke-width"],
          filter
        }),
        options: z.strictObject({
          size: number({
            label: "牌面大小",
            range: [1, 12],
            step: 0.5,
            tip: "设置城镇产出牌面图标的大小（像素）。牌面与文字会一同缩放"
          })
        })
      })
    })
  }),
  grid: z.strictObject({
    attrs: meta(
      z.strictObject({
        stroke,
        opacity,
        "stroke-width": strokeWidth,
        "stroke-dasharray": strokeDasharray,
        "stroke-linecap": strokeLinecap,
        transform,
        filter,
        mask: clip
      }),
      { effect: "draw" }
    ),
    options: z.strictObject({
      type: choice(GRID_TYPES, { tip: "选择网格叠加类型" }),
      scale: number({ range: [0.1, 10], step: 0.01, tip: "设置网格单元的缩放倍率" }),
      dx: shift("x", 100, 1, "Shift by x axis in pixels"),
      dy: shift("y", 100, 1, "Shift by y axis in pixels")
    })
  }),
  heightmap: z.strictObject({ groups: z.strictObject({ landHeights, oceanHeights }) }),
  ice: z.strictObject({ attrs: z.strictObject({ opacity, fill, ...strokeGroup, filter }) }),
  journeys: z.strictObject({ attrs: z.strictObject({ opacity, ...dashGroup, filter, mask: clip }) }),
  labels: z.strictObject({
    groups: z.record(
      z.string(),
      z.strictObject({
        attrs: z.strictObject({
          opacity,
          ...fillGroup,
          ...strokeGroup,
          "stroke-width": meta(z.number().min(0), {
            group: "Stroke",
            label: "Width",
            range: [0, 2],
            step: 0.01,
            tip: "Set stroke width"
          }).default(0),
          "font-family": variant(fontFamily, { group: "Font", effect: "draw" }),
          "font-size": meta(z.string().regex(FORMATS.fontSizePercent), {
            control: "percent",
            group: "Font",
            label: "Size",
            range: [1, 40],
            effect: "draw",
            tip: "设置字号，相对于标签图层"
          }),
          "font-style": choice(FONT_STYLES, {
            label: "样式",
            group: "Font",
            tip: "设置字体样式"
          })
            .nullable()
            .default(null),
          "font-weight": meta(z.literal(FONT_WEIGHTS), {
            control: "select",
            label: "字重",
            group: "Font",
            tip: "设置字重"
          })
            .nullable()
            .default(null),
          "letter-spacing": number({
            label: "Spacing",
            group: "Font",
            nullAs: 0,
            range: [-2, 10],
            step: 0.01,
            effect: "draw",
            tip: "设置字间距"
          }).nullable(),
          style: meta(z.string().refine(isLabelStyle), {
            control: "labelStyle",
            label: "Style",
            tip: "设置文字阴影、大小写与偏移"
          }).nullable(),
          filter
        })
      })
    )
  }),
  lakes: z.strictObject({ groups: z.record(z.string(), lake) }), // stock groups plus user-created ones
  landmass: z.strictObject({ attrs: z.strictObject({ opacity, fill, filter }) }),
  legend: z.strictObject({
    attrs: z.strictObject({
      ...strokeGroup,
      "font-family": variant(fontFamily, { effect: "draw" }),
      "font-size": variant(fontSizePx, { effect: "draw" })
    }),
    options: z.strictObject({
      columns: number({
        label: "每列条目数",
        range: [1, 30],
        step: 1,
        tip: "设置单列的最大条目数"
      })
    }),
    groups: z.strictObject({
      box: meta(z.strictObject({ attrs: z.strictObject(fillGroup) }), {
        label: "背景",
        effect: "draw"
      })
    })
  }),
  map: z.strictObject({
    attrs: z.strictObject({
      filter: choice(MAP_FILTERS, {
        label: "滤镜",
        tip: "设置应用于整张地图的滤镜"
      }).nullable()
    })
  }),
  markers: z.strictObject({ attrs: z.strictObject({ opacity, filter }) }),
  markets: z.strictObject({
    attrs: z.strictObject({
      "fill-opacity": fillGroup["fill-opacity"],
      "stroke-opacity": variant(strokeOpacity, { group: "Stroke" }),
      "stroke-width": variant(strokeWidth, { group: "Stroke" }),
      "stroke-dasharray": variant(strokeDasharray, { group: "Stroke" }),
      "stroke-linecap": variant(strokeLinecap, { group: "Stroke" }),
      filter
    }),
    options: z.strictObject({
      size: number({
        label: "Marker size",
        range: [1, 12],
        step: 0.5,
        tip: "设置市场标记（圆形）的大小（像素）"
      }),
      iconSize: number({
        label: "Icon size",
        range: [1, 20],
        step: 0.5,
        tip: "设置市场标记图标的大小（像素）"
      }),
      icon: text({ control: "icon", label: "标记图标", tip: "设置市场标记内部显示的图标" })
    })
  }),
  military: z.strictObject({
    attrs: z.strictObject({ opacity, "fill-opacity": fillGroup["fill-opacity"], ...strokeGroup, filter }),
    options: z.strictObject({
      boxSize: number({
        range: [0, 10],
        step: 0.1,
        tip: "设置军团框大小。更改后所有军团都会重绘（位置将恢复默认）"
      })
    })
  }),
  ocean: z.strictObject({
    options: z.strictObject({ bands: coastlineBands }),
    groups: z.strictObject({
      base: z.strictObject({
        attrs: z.strictObject({ fill })
      }),
      pattern: z.strictObject({
        attrs: z.strictObject({
          href: choice(OCEAN_PATTERNS, { label: "图像", tip: "选择海洋图案" }),
          opacity
        })
      }),
      oceanLayers: z.strictObject({
        attrs: z.strictObject({ filter }),
        options: z.strictObject({
          outline: choice(OCEAN_OUTLINES, { label: "海洋图层", tip: "定义海岸轮廓的等高线方案" })
        })
      }),
      oceanWaves
    })
  }),
  population: z.strictObject({
    attrs: z.strictObject({ opacity, ...dashGroup, filter, mask: clip }),
    groups: z.strictObject({
      rural: z.strictObject({
        attrs: z.strictObject({ stroke })
      }),
      urban: z.strictObject({
        attrs: z.strictObject({ stroke })
      })
    })
  }),
  precipitation: z.strictObject({
    attrs: z.strictObject({ opacity, fill, ...strokeGroup, filter, mask: clip })
  }),
  provinces: z.strictObject({ attrs: z.strictObject({ opacity, filter }) }),
  relief: z.strictObject({
    attrs: z.strictObject({
      opacity,
      stroke: variant(color, { label: "Color", tip: "Set stroke color" }).default("#23343f"),
      filter,
      mask: clip
    }),
    options: z.strictObject({
      set: meta(z.enum(RELIEF_SETS), {
        label: "Style",
        effect: "draw",
        tip: "选择地形图标集。已有图标只会换样式，不会重新生成"
      }),
      size: number({
        range: [0.2, 4],
        step: 0.01,
        effect: "draw",
        tip: "设置地形图标的大小。这是渲染倍率，不改动地图数据"
      }),
      density: number({
        range: [0.3, 0.8],
        step: 0.01,
        effect: "regenerateRelief",
        tip: "Define the density of relief icons. All relief icons are regenerated, discarding manual edits. Highly affects performance!"
      })
    })
  }),
  religions: z.strictObject({ attrs: z.strictObject({ opacity, ...strokeGroup, filter }) }),
  rivers: z.strictObject({ attrs: z.strictObject({ opacity, fill, filter }) }),
  routes: z.strictObject({
    groups: z.record(
      z.string(),
      z.strictObject({ attrs: z.strictObject({ opacity, ...strokeGroup, filter, mask: clip }) })
    )
  }),
  rulers: z.strictObject({
    attrs: meta(
      z.strictObject({ opacity, ...dashGroup, "font-size": variant(fontSizePx, { group: "Label" }), filter }),
      { effect: "draw" }
    )
  }),
  scaleBar: meta(
    z.strictObject({
      attrs: z.strictObject({ opacity, fill, "font-size": fontSizePx }),
      options: z.strictObject({
        barSize: number({ label: "标尺大小", range: [0.5, 5], step: 0.1, tip: "设置标尺大小" }),
        label: text({ tip: "输入比例尺文字，留空则隐藏文字" }),
        x: number({ group: "Position", range: [0, 100], step: 0.1, tip: "比例尺右边缘（百分比）" }),
        y: number({ group: "Position", range: [0, 100], step: 0.1, tip: "比例尺下边缘（百分比）" })
      }),
      groups: z.strictObject({
        back: meta(
          z.strictObject({
            attrs: z.strictObject({
              opacity,
              ...fillGroup,
              stroke: strokeGroup.stroke,
              "stroke-width": strokeGroup["stroke-width"],
              filter
            }),
            options: z.strictObject({
              top: padding("Top"),
              right: padding("Right"),
              bottom: padding("Bottom"),
              left: padding("Left")
            })
          }),
          { label: "Background" }
        )
      })
    }),
    { effect: "draw" }
  ),
  states: z.strictObject({
    groups: z.strictObject({
      statesBody: z.strictObject({ attrs: z.strictObject({ opacity, filter }) }),
      // rendered only when performance is set to best quality; the zoom scales the width it writes
      statesHalo: z.strictObject({
        attrs: z.strictObject({
          opacity,
          "stroke-width": variant(strokeWidth, { range: [0, 30], step: 0.1, effect: "zoom" }),
          filter: blurFilter
        })
      })
    })
  }),
  temperature: z.strictObject({
    attrs: z.strictObject({
      fill: variant(fill, { group: "Label" }),
      "fill-opacity": fillGroup["fill-opacity"],
      "font-size": variant(fontSizePx, { group: "Label" }),
      ...strokeGroup,
      filter,
      mask: clip
    })
  }),
  texture: z.strictObject({
    attrs: z.strictObject({ opacity, filter, mask: clip }),
    options: z.strictObject({
      href: text({
        control: "texture",
        label: "Image",
        tip: "选择贴图图像。大贴图会严重影响性能"
      }),
      x: shift("x", 500, 1, "Shift texture by x axis in pixels"),
      y: shift("y", 500, 1, "Shift texture by y axis in pixels")
    })
  }),
  trade: z.strictObject({ attrs: z.strictObject({ opacity, filter }) }),
  vignette: z.strictObject({
    attrs: z.strictObject({ opacity, fill, mask, filter }),
    options: meta(
      z.strictObject({
        x: variant(percentage, {
          label: "X 位置",
          range: [0, 100],
          step: 0.1,
          tip: "暗角矩形的 X 坐标（百分比）"
        }),
        y: variant(percentage, {
          label: "Y 位置",
          range: [0, 100],
          step: 0.1,
          tip: "暗角矩形的 Y 坐标（百分比）"
        }),
        width: variant(percentage, { range: [0, 100], step: 0.1, tip: "暗角矩形的宽度（百分比）" }),
        height: variant(percentage, { range: [0, 100], step: 0.1, tip: "暗角矩形的高度（百分比）" }),
        rx: variant(percentage, {
          label: "X 半径",
          range: [0, 50],
          step: 0.1,
          tip: "暗角的 X 半径（百分比）"
        }),
        ry: variant(percentage, {
          label: "Y 半径",
          range: [0, 50],
          step: 0.1,
          tip: "暗角的 Y 半径（百分比）"
        }),
        filter: variant(blurFilter, { range: [0, 400], step: 1, tip: "设置暗角模糊的扩散范围（像素）" })
      }),
      { effect: "draw" }
    )
  }),
  zones: z.strictObject({ attrs: z.strictObject({ opacity, ...strokeGroup, filter, mask: clip }) })
});
