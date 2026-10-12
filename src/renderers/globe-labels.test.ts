import { describe, expect, it } from "vitest";
import { estimateLabelWidth, type GlobeLabelData, selectNonOverlappingLabels } from "./globe-labels";

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
