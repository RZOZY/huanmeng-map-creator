import { describe, expect, it } from "vitest";
import {
  estimateLabelWidth,
  type GlobeLabelData,
  placeTextAlongPath,
  selectNonOverlappingLabels
} from "./globe-labels";

const label = (overrides: Partial<GlobeLabelData> = {}): GlobeLabelData => ({
  group: "burg",
  text: "测试城",
  mapX: 100,
  mapY: 100,
  fontPx: 10,
  color: "#000000",
  opacity: 1,
  fontFamily: "serif",
  ...overrides
});

/** 与实现同一套估算：给一条标签算出它的地图空间矩形 */
const boxOf = (item: GlobeLabelData) => {
  const halfWidth = estimateLabelWidth(item.text, item.fontPx) / 2;
  const halfHeight = (item.fontPx * 1.25) / 2;
  const pad = item.fontPx * 0.2;
  return {
    left: item.mapX - halfWidth - pad,
    right: item.mapX + halfWidth + pad,
    top: item.mapY - halfHeight - pad,
    bottom: item.mapY + halfHeight + pad
  };
};

describe("selectNonOverlappingLabels", () => {
  it("同一位置的标签只留优先级最高的那条", () => {
    const kept = selectNonOverlappingLabels([
      label({ group: "burg", text: "小城" }),
      label({ group: "state", text: "大国" })
    ]);

    expect(kept).toHaveLength(1);
    expect(kept[0].group).toBe("state");
  });

  it("离得够远就都留下", () => {
    const kept = selectNonOverlappingLabels([label({ mapX: 100 }), label({ mapX: 1000 })]);
    expect(kept).toHaveLength(2);
  });

  it("留下的标签两两不重叠", () => {
    const many = Array.from({ length: 60 }, (_, index) =>
      label({ mapX: 200 + (index % 10) * 9, mapY: 200 + Math.floor(index / 10) * 9 })
    );

    const kept = selectNonOverlappingLabels(many);
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.length).toBeLessThan(many.length); // 挤成一团时必然要丢掉一些

    for (let i = 0; i < kept.length; i++) {
      for (let j = i + 1; j < kept.length; j++) {
        const a = boxOf(kept[i]);
        const b = boxOf(kept[j]);
        const overlaps = a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        expect(overlaps, `第 ${i} 条与第 ${j} 条重叠了`).toBe(false);
      }
    }
  });

  it("不超过上限，且先放重要的", () => {
    const many = Array.from({ length: 40 }, (_, index) =>
      label({ group: index % 2 ? "burg" : "state", mapX: 100 + index * 60 })
    );

    const kept = selectNonOverlappingLabels(many, 5);
    expect(kept).toHaveLength(5);
    expect(kept[0].group).toBe("state");
  });

  it("宽度估算：中日韩字按整格、拉丁按半格", () => {
    expect(estimateLabelWidth("中国", 10)).toBeCloseTo(20, 6);
    expect(estimateLabelWidth("ab", 10)).toBeCloseTo(11, 6);
  });
});

describe("placeTextAlongPath", () => {
  const fixed = () => 10; // 每个字宽 10

  it("水平路径：整行以 startOffset% 处居中", () => {
    const glyphs = placeTextAlongPath(
      [
        [0, 0],
        [100, 0]
      ],
      "中国",
      fixed,
      50
    );

    expect(glyphs).toHaveLength(2);
    expect(glyphs[0].x).toBeCloseTo(45, 6); // 20 宽的字串中心在 50 → 首字中心 45
    expect(glyphs[1].x).toBeCloseTo(55, 6);
    expect(glyphs[0].angle).toBeCloseTo(0, 6);
    expect(glyphs[0].y).toBeCloseTo(0, 6);
  });

  it("拐弯路径：每个字跟着所在段的切线转", () => {
    const glyphs = placeTextAlongPath(
      [
        [0, 0],
        [50, 0],
        [50, 50]
      ],
      "ab",
      fixed,
      50
    );

    expect(glyphs).toHaveLength(2);
    expect(glyphs[0].y).toBeCloseTo(0, 6); // 第一字在水平段
    expect(glyphs[0].angle).toBeCloseTo(0, 6);
    expect(glyphs[1].x).toBeCloseTo(50, 6); // 第二字在竖直段
    expect(glyphs[1].angle).toBeCloseTo(Math.PI / 2, 6);
  });

  it("起点百分比 0：超出路径的部分夹在路径内", () => {
    const glyphs = placeTextAlongPath(
      [
        [0, 0],
        [100, 0]
      ],
      "ab",
      fixed,
      0
    );

    expect(glyphs.map(glyph => glyph.x)).toEqual([0, 5]); // 首字被夹到起点，不跑出路径
  });

  it("路径不足两个点或长度为零时返回空", () => {
    expect(placeTextAlongPath([[1, 1]], "x", fixed)).toEqual([]);
    expect(
      placeTextAlongPath(
        [
          [1, 1],
          [1, 1]
        ],
        "x",
        fixed
      )
    ).toEqual([]);
  });

  it("每个字的间距等于它的宽度（不叠字）", () => {
    const glyphs = placeTextAlongPath(
      [
        [0, 0],
        [100, 0]
      ],
      "abc",
      fixed,
      50
    );

    expect(glyphs[1].x - glyphs[0].x).toBeCloseTo(10, 6);
    expect(glyphs[2].x - glyphs[1].x).toBeCloseTo(10, 6);
  });
});
