// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { preflightMapData, prepareDetachedMapSvg } from "./map-preflight";

function fixture(): string[] {
  const data = Array<string>(53).fill("");
  data[0] = "1.154.0|test||seed|2|2|0";
  data[1] = "{}";
  data[3] = "[]";
  data[5] = '<svg id="map"><g id="viewbox"></g></svg>';
  data[6] = JSON.stringify({
    spacing: 1,
    cellsX: 2,
    cellsY: 2,
    points: [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1]
    ],
    boundary: [
      [-1, -1],
      [3, 3]
    ],
    features: [0]
  });
  for (let i = 7; i <= 11; i++) data[i] = "0,0,0,0";
  for (const i of [12, 13, 14, 15]) data[i] = "[0]";
  for (const i of [16, 17, 18, 19, 20, 21, 22, 24, 25]) data[i] = "0,0";
  return data;
}

const check = (data: readonly string[], version = "1.154.0") => preflightMapData(data, version);

describe("map data preflight without a live world", () => {
  it("accepts and does not mutate a minimal modern record set", () => {
    const data = Object.freeze(fixture());
    expect(() => check(data)).not.toThrow();
  });

  it.each([6, 12, 13, 14, 15])("rejects a missing mandatory JSON record %s", index => {
    const data = fixture();
    data[index] = "";
    expect(() => check(data)).toThrow();
  });

  it.each([1, 3, 6, 12, 13, 14, 15, 29, 30, 32, 34, 35, 36, 37, 38, 39, 41, 42, 43, 46, 47, 49, 50, 51, 52])(
    "rejects malformed consumed JSON at %s",
    index => {
      const data = fixture();
      data[index] = index === 3 ? "[{" : "{";
      expect(() => check(data)).toThrow();
    }
  );

  it.each([12, 13, 14, 15, 29, 30, 32, 34, 35, 37, 38, 39, 41, 42, 43, 46, 47, 49, 52])(
    "rejects a non-array collection at %s",
    index => {
      const data = fixture();
      data[index] = "{}";
      expect(() => check(data)).toThrow();
    }
  );

  it.each(["null", "[]", "false"])("rejects non-record grid %s", value => {
    const data = fixture();
    data[6] = value;
    expect(() => check(data)).toThrow();
  });

  it.each([
    { spacing: 0 },
    { spacing: -1 },
    { cellsX: 0 },
    { cellsY: -1 },
    { points: [] },
    { points: [null] },
    { points: [["0", 1]] },
    { points: [[0, Number.POSITIVE_INFINITY]] },
    { boundary: [null] },
    { features: undefined },
    { features: null },
    { features: {} }
  ])("rejects unsafe grid inputs %j", patch => {
    const data = fixture();
    data[6] = JSON.stringify({ ...JSON.parse(data[6]), ...patch });
    expect(() => check(data)).toThrow();
  });

  it.each([7, 8, 9, 10, 11, 16, 17, 18, 19, 20, 21, 22, 24, 26, 27, 40, 44])(
    "rejects a mismatching vector at %s",
    index => {
      const data = fixture();
      data[index] = "0";
      expect(() => check(data)).toThrow();
    }
  );

  it.each(["NaN,0", "Infinity,0", "1e999,0", "0,", ",0", "0,,0", " ,0"])("rejects unsafe CSV %s", value => {
    const data = fixture();
    data[25] = value;
    expect(() => check(data)).toThrow();
  });

  it("preserves legacy finite numeric conversion, sentinels, optional slots and repairable references", () => {
    const data = fixture();
    data[10] = "-2,-1,0,1";
    data[11] = "-20,-1,0,15";
    data[18] = "1545,376";
    data[21] = "0.25,2e-3";
    data[24] = "65535,0";
    data[19] = "999,999";
    data[34] = '[{"family":"Georgia"}]';
    data[32] = '[{"i":1,"name":"Original River"}]';
    data[50] = '{"order":["unknown","unknown"],"active":["unknown"]}';
    data[51] = '{"pack":{"vertices":{"p":{"999999":[[0,0],[1,1]]}}},"future":true}';
    expect(() => check(data)).not.toThrow();
  });

  it.each([
    ...[13, 14, 15, 29, 30, 32, 35, 38, 39, 41, 43, 46, 49].map(index => [index, "[null]"] as const),
    [12, '[0,{"vertices":{}}]'],
    [38, "[{}]"],
    [39, '[{"type":"glacier"}]'],
    [46, '[{"type":"Ruler"}]'],
    [46, '[{"type":"Other","points":[]}]'],
    [46, '[{"type":"Ruler","points":[]}]'],
    [52, '[{"segments":[{"transport":"foot"}]}]'],
    [34, "[null]"],
    [47, "[{}]"],
    [47, '[{"label":null}]'],
    [37, '[{"i":1}]'],
    [37, '[{"points":null}]'],
    [50, '{"order":[],"active":null}'],
    [50, '{"order":[0],"active":[]}'],
    [51, "null"],
    [51, '{"pack":{"vertices":{"p":{"0":null}}}}'],
    [51, '{"pack":{"vertices":{"p":{"0":[[0,0],null]}}}}'],
    [52, '[{"i":1}]'],
    [52, '[{"segments":[null]}]'],
    [31, "English|3|12|d|0"],
    [31, "English|3|12|d|0|/"]
  ] as const)("rejects a known consumed nested failure in slot %s: %s", (index, value) => {
    const data = fixture();
    data[index] = value;
    expect(() => check(data)).toThrow();
  });

  it("allows empty/short route points, legacy label size, empty names and nullable unused overrides", () => {
    const data = fixture();
    data[37] = '[{"points":[]},{"points":[[0,0,1]]}]';
    data[47] = '[{"i":1,"label":{"text":"User Link","size":50}}]';
    data[51] = '{"pack":{"vertices":{"p":null}},"grid":{"future":null}}';
    data[31] = "English|3|12|d|0|";
    data[52] = '[{"i":1,"segments":[]}]';
    expect(() => check(data)).not.toThrow();
  });

  it("preserves supported feature and market holes that are not dereferenced by packing", () => {
    const data = fixture();
    data[6] = JSON.stringify({ ...JSON.parse(data[6]), features: [null, null, { type: "ocean" }] });
    data[12] = '[null,0,null,{"vertices":[]}]';
    data[42] = '[null,{"i":1}]';
    expect(() => check(data)).not.toThrow();
  });

  it.each([
    ["0,0,0,0", "0,254,0,0", true],
    ["0,65537,0,0", "0,254,0,0", false],
    ["0,0,0,0", "254,0,0,0", false]
  ] as const)("checks only the grid feature dereference used by packing: %s / %s", (ids, types, rejects) => {
    const data = fixture();
    data[6] = JSON.stringify({ ...JSON.parse(data[6]), features: [null, { type: "ocean" }] });
    data[9] = ids;
    data[10] = types;
    if (rejects) expect(() => check(data)).toThrow();
    else expect(() => check(data)).not.toThrow();
  });

  it("does not impose modern settings/biomes/styles/layer schema on legacy input", () => {
    const data = fixture();
    data[1] = "km|3|square";
    data[3] = "#fff|100|Legacy biome";
    data[4] = "legacy notes";
    data[48] = "old style fallback";
    data[50] = "ignored before 1.144";
    expect(() => check(data.slice(0, 40), "1.112.1")).not.toThrow();
    expect(() => check(data, "1.112.1")).not.toThrow();
  });

  it.each(["1.112.1", "1.139.4", "1.143.1"])("accepts the real legacy fixture %s without rewriting it", version => {
    const text = readFileSync(resolve(process.cwd(), "tests", "fixtures", `${version}.map`), "utf8");
    const data = Object.freeze(text.split("\r\n"));
    expect(() => check(data, version)).not.toThrow();
    expect(prepareDetachedMapSvg(data[5]).id).toBe("map");
    expect(data.join("\r\n")).toBe(text);
  });
});

describe("detached map scene preparation", () => {
  it("uses HTML SVG parsing semantics and never changes the live scene", () => {
    document.body.innerHTML = '<svg id="map"><g id="viewbox"></g></svg><input id="untouched" value="user">';
    const oldMap = document.getElementById("map");
    const root = prepareDetachedMapSvg(
      '<svg id="map"><g id="viewbox"><text>&nbsp;User</text><use xlink:href="#x"/></g></svg>'
    );
    expect(root).toBeInstanceOf(SVGSVGElement);
    expect(root.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(root.isConnected).toBe(false);
    expect(document.getElementById("map")).toBe(oldMap);
    expect(document.getElementById("untouched")).toHaveProperty("value", "user");
    expect(root.querySelector("text")?.textContent).toBe("\u00a0User");
    document.body.prepend(root);
    expect(document.body.firstElementChild).toBe(root);
  });

  it.each([
    "",
    '<div id="map"><g id="viewbox"></g></div>',
    '<svg id="other"><g id="viewbox"/></svg>',
    '<svg id="map"></svg>',
    '<svg id="map"><g id="viewbox"/><g id="viewbox"/></svg>',
    '<svg id="map"><g id="viewbox"/></svg><div>extra</div>',
    'non-whitespace<svg id="map"><g id="viewbox"/></svg>',
    '<svg id="map"><g id="viewbox"/><svg id="map"/></svg>',
    '<svg id="map"><foreignObject><div id="viewbox"/></foreignObject></svg>',
    '<svg id="map"><g id="viewbox"/><script>unexpected()</script></svg>',
    '<svg id="map"><g id="viewbox"/><foreignObject><script>unexpected()</script></foreignObject></svg>'
  ])("rejects an ambiguous or missing core scene: %s", source => {
    expect(() => prepareDetachedMapSvg(source)).toThrow();
  });

  it("allows comments, whitespace, legacy repeated non-core group ids and missing modern layers", () => {
    expect(() =>
      prepareDetachedMapSvg(' <!--old--> <svg id="map"><g id="viewbox"><g id="cults"/><g id="cults"/></g></svg> ')
    ).not.toThrow();
  });
});
