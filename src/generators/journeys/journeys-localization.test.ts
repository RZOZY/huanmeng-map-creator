import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Transports } from "@/generators/transports-generator";
import type { Journey, JourneyPoint } from "@/types/Journey";
import { Journeys } from "./journeys-generator";

vi.mock("./journey-story", () => ({ generateStoryJourney: () => null }));

const oldJourney = (i: number, name: string): Journey => ({
  i,
  name,
  type: "Travel",
  color: "#123456",
  lock: true,
  note: "Azgaar & 用户原文",
  segments: [
    {
      i: 4,
      name: "Segment 5 — 用户路段",
      from: 0,
      to: 1,
      transport: "Custom Journey Transport",
      speed: 7,
      distance: 10,
      points: [
        [0, 0, 0],
        [10, 0, 1]
      ],
      custom: true,
      duration: 2
    }
  ]
});

function installFallbackMap(names: (string | undefined)[]): void {
  const points: JourneyPoint[] = [
    [0, 0, 0],
    [10, 0, 1]
  ];
  vi.stubGlobal("pack", {
    journeys: [],
    burgs: [{ i: 0 }, ...names.map((name, cell) => ({ i: cell + 1, name, cell, capital: 1 }))],
    cells: {
      h: new Uint8Array([30, 30]),
      f: new Uint16Array([1, 1]),
      p: points.map(([x, y]) => [x, y]),
      c: [[1], [0]],
      routes: { 0: { 1: 4 }, 1: { 0: 4 } }
    },
    routes: [{ i: 4, group: "roads", points }]
  });
}

beforeEach(() => {
  vi.stubGlobal("pack", { journeys: [] });
  vi.stubGlobal("options", structuredClone(options));
  options.map.transports = Transports.getDefaults();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("new journey defaults", () => {
  it("creates a Chinese journey name without changing the stored fields or zero-based id", () => {
    const journey = Journeys.addEmpty();
    expect(journey).toEqual({
      i: 0,
      name: "旅程 1",
      type: "旅程",
      color: expect.any(String),
      segments: []
    });
    expect(pack.journeys[0]).toBe(journey);
  });

  it("keeps sparse ids and existing names while naming only newly appended entities", () => {
    pack.journeys = [oldJourney(0, "Journey 1"), oldJourney(8, "Journey to the West — 西游")];
    const before = JSON.stringify(pack.journeys);
    const journey = Journeys.addEmpty();
    expect(journey.i).toBe(9);
    expect(journey.name).toBe("旅程 10");
    expect(JSON.stringify(pack.journeys.slice(0, 2))).toBe(before);

    const segmentId = Journeys.addSegment(8);
    expect(segmentId).toBe(5);
    expect(pack.journeys[1].segments[1]).toEqual({
      i: 5,
      name: "路段 6",
      from: 1,
      transport: "步行（负重）",
      speed: 3,
      distance: 0,
      points: []
    });
    expect(pack.journeys[1].segments[0]).toEqual(JSON.parse(before)[1].segments[0]);
  });

  it("names a new segment in Chinese while retaining the fallback transport key and speed", () => {
    pack.journeys = [oldJourney(12, "My Journey")];
    options.map.transports = [];
    const segmentId = Journeys.addSegment(12);
    expect(segmentId).toBe(5);
    expect(pack.journeys[0].segments[1]).toEqual({
      i: 5,
      name: "路段 6",
      from: 1,
      transport: "Direct",
      speed: 5,
      distance: 0,
      points: []
    });
  });

  it("round-trips the Chinese defaults through JSON without changing the journey contract", () => {
    const journey = Journeys.addEmpty();
    Journeys.addSegment(journey.i);
    const encoded = JSON.stringify(pack.journeys);
    pack.journeys = JSON.parse(encoded) as Journey[];
    Journeys.sync();
    Journeys.generate();
    expect(pack.journeys[0].name).toBe("旅程 1");
    expect(pack.journeys[0].segments[0].name).toBe("路段 1");
    expect(JSON.stringify(pack.journeys)).toBe(encoded);
  });
});

describe("existing and user-authored journey names", () => {
  it.each(["Journey 1", "Journey to the West", "自定义 Journey <北门>"])(
    "preserves the explicitly chosen name %s rather than treating it as a default",
    name => {
      const journey = Journeys.addEmpty();
      Journeys.rename(journey.i, name);
      Journeys.setType(journey.i, "My Journey Type");
      const segmentId = Journeys.addSegment(journey.i);
      Journeys.setSegment(journey.i, segmentId, { name: "My Segment — 原文" });
      Journeys.sync();
      Journeys.generate();
      expect(journey.name).toBe(name);
      expect(journey.type).toBe("My Journey Type");
      expect(journey.segments[0].name).toBe("My Segment — 原文");
    }
  );

  it("leaves old default-looking and custom names byte-for-byte unchanged across JSON restoration", () => {
    pack.journeys = [oldJourney(0, "Journey 1"), oldJourney(12, "My Journey & 北门")];
    const encoded = JSON.stringify(pack.journeys);
    pack.journeys = JSON.parse(encoded) as Journey[];
    Journeys.sync();
    Journeys.generate();
    expect(JSON.stringify(pack.journeys)).toBe(encoded);
    expect(pack.journeys.map(journey => journey.name)).toEqual(["Journey 1", "My Journey & 北门"]);
    expect(pack.journeys.map(journey => journey.segments[0].name)).toEqual([
      "Segment 5 — 用户路段",
      "Segment 5 — 用户路段"
    ]);
    expect(pack.journeys.map(journey => journey.type)).toEqual(["Travel", "Travel"]);
  });
});

describe("fallback journey display defaults", () => {
  it("uses the Chinese default type while preserving the endpoint names and route data", () => {
    installFallbackMap(["North Gate", "旧城 Delta"]);
    const journey = Journeys.addRandom();
    expect(journey?.name).toBe("North Gate → 旧城 Delta");
    expect(journey?.type).toBe("旅程");
    expect(journey?.segments[0]).toEqual({
      i: 0,
      name: "North Gate → 旧城 Delta",
      from: 0,
      to: 1,
      transport: "步行（负重）",
      speed: 3,
      distance: 10,
      points: [
        [0, 0, 0],
        [10, 0, 1]
      ]
    });
  });

  it("uses Chinese start and end labels only when a fallback endpoint has no name", () => {
    installFallbackMap([undefined, undefined]);
    const journey = Journeys.addRandom();
    expect(journey?.name).toBe("起点 → 终点");
    expect(journey?.segments[0].name).toBe("起点 → 终点");
    expect(pack.burgs[1].name).toBeUndefined();
    expect(pack.burgs[2].name).toBeUndefined();
  });
});
