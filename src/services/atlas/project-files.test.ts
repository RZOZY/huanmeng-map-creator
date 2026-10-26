import { describe, expect, it, vi } from "vitest";
import { parseAtlasManifest } from "./manifest";
import { readAtlasProjectFiles } from "./project-files";

const WORLD = "20000000-0000-4000-8000-000000000001";
const LOCAL = "20000000-0000-4000-8000-000000000002";

function fixture() {
  const world = {
    id: WORLD,
    name: "世界 <Alpha>",
    kind: "world",
    asset: { path: "maps/世界.map", sha256: "a".repeat(64) },
    projection: "equirectangular",
    provenance: "测试记录，不是测绘证明",
    frame: { west: -180, east: 180, south: -90, north: 90 },
    size: { width: 1000, height: 500 },
    geographicRevision: 1,
    detailLevel: 0,
    parent: null,
    georeference: { verified: true, evidence: "测试锚点" }
  };
  return {
    schemaVersion: 1,
    project: { id: "10000000-0000-4000-8000-000000000001", name: "项目 <Beta>" },
    worldMapId: WORLD,
    maps: [
      world,
      {
        ...world,
        id: LOCAL,
        name: "局部",
        kind: "local",
        detailLevel: 1,
        asset: { path: "maps/详图.map", sha256: "b".repeat(64) },
        parent: { mapId: WORLD, geographicRevision: 1 }
      }
    ],
    places: []
  };
}

function entry(path: string, text = "不读取的地图") {
  const file = new File([text], path.split("/").at(-1) ?? "", { type: "application/octet-stream" });
  const read = vi.fn(async () => new TextEncoder().encode(text).buffer);
  Object.defineProperties(file, {
    webkitRelativePath: { value: path },
    arrayBuffer: { value: read }
  });
  return { file, read };
}

function selection(raw = fixture()) {
  const manifest = entry("工程/atlas.json", JSON.stringify(raw));
  const world = entry("工程/maps/世界.map");
  const local = entry("工程/maps/详图.map");
  return { manifest, world, local, files: [manifest.file, world.file, local.file] };
}

describe("explicit atlas directory capabilities", () => {
  it("reads only root atlas.json, holds exact File capabilities and freezes metadata", async () => {
    const { files, manifest, world, local } = selection();
    const extra = entry("工程/旧版/详图.map");
    const result = await readAtlasProjectFiles([...files, extra.file]);
    expect(result.rootName).toBe("工程");
    expect(result.manifest.project.name).toBe("项目 <Beta>");
    expect(result.assets.map(asset => asset.file)).toEqual([world.file, local.file]);
    expect(manifest.read).toHaveBeenCalledOnce();
    for (const item of [world, local, extra]) expect(item.read).not.toHaveBeenCalled();
    expect(parseAtlasManifest(result.manifestJSON)).toEqual(result.manifest);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.assets)).toBe(true);
    expect(Object.isFrozen(result.assets[0])).toBe(true);
    expect(Object.isFrozen(result.manifest.maps[0].frame)).toBe(true);
  });

  it("never confuses equal basenames in different directories", async () => {
    const data = selection();
    data.files[2] = entry("工程/旧版/详图.map").file;
    const result = await readAtlasProjectFiles(data.files);
    expect(result.assets[0].file).toBe(data.world.file);
    expect(result.assets[1].file).toBeNull();
  });

  it("reports missing world and local files without borrowing any from another session", async () => {
    const data = selection();
    const previous = await readAtlasProjectFiles(data.files);
    const current = await readAtlasProjectFiles([data.manifest.file]);
    expect(previous.assets.every(asset => asset.file)).toBe(true);
    expect(current.assets.every(asset => asset.file === null)).toBe(true);
  });

  it("keeps unverified geographic claims unchanged rather than approving them", async () => {
    const raw = fixture();
    raw.maps[0].georeference = { verified: false, evidence: "" };
    const result = await readAtlasProjectFiles(selection(raw).files);
    expect(result.assets[0].map.georeference.verified).toBe(false);
  });

  it.each([
    "",
    "atlas.json",
    "工程/maps/../atlas.json",
    "工程//atlas.json",
    "/工程/atlas.json",
    "工程/./atlas.json",
    "工程/maps\\x.map",
    "工程/maps/x?.map",
    "工程/maps/x%.map",
    "工程/maps/x\u0000.map",
    "工程/maps/x\u202e.map",
    "工程/maps/con.map",
    "工程/maps/x .map/",
    "工程/maps/尾点./x.map"
  ])("rejects malformed selected paths %j before reading", async path => {
    const data = selection();
    const extra = entry(path);
    await expect(readAtlasProjectFiles([...data.files, extra.file])).rejects.toThrow();
    expect(data.manifest.read).not.toHaveBeenCalled();
  });

  it.each(["工程/Atlas.json", "工程/sub/atlas.json"])("requires exact root atlas.json, not %s", async path => {
    const data = selection();
    const other = entry(path, JSON.stringify(fixture()));
    await expect(readAtlasProjectFiles([other.file, data.world.file])).rejects.toThrow();
    expect(other.read).not.toHaveBeenCalled();
  });

  it("rejects mismatched file.name even if its advertised path matches", async () => {
    const data = selection();
    Object.defineProperty(data.local.file, "name", { value: "冒名.map" });
    await expect(readAtlasProjectFiles(data.files)).rejects.toThrow();
    expect(data.manifest.read).not.toHaveBeenCalled();
  });

  it("rejects mixed roots before reading either manifest", async () => {
    const data = selection();
    await expect(readAtlasProjectFiles([...data.files, entry("另一根/x.map").file])).rejects.toThrow();
    expect(data.manifest.read).not.toHaveBeenCalled();
  });

  it("rejects the same capability twice rather than silently deduplicating it", async () => {
    const data = selection();
    await expect(readAtlasProjectFiles([...data.files, data.world.file])).rejects.toThrow();
    expect(data.manifest.read).not.toHaveBeenCalled();
  });

  it.each(["工程/maps/世界.MAP", "工程/maps/世\u754c.map"])("rejects ambiguous duplicate entries %s", async path => {
    const data = selection();
    await expect(readAtlasProjectFiles([...data.files, entry(path).file])).rejects.toThrow();
    expect(data.manifest.read).not.toHaveBeenCalled();
  });

  it("rejects Unicode-normalization collisions, without normalizing paths into a match", async () => {
    const data = selection();
    await expect(
      readAtlasProjectFiles([...data.files, entry("工程/é.map").file, entry("工程/e\u0301.map").file])
    ).rejects.toThrow();
    const raw = fixture();
    raw.maps[0].asset.path = "maps/é.map";
    const one = selection(raw);
    one.files[1] = entry("工程/maps/e\u0301.map").file;
    await expect(readAtlasProjectFiles(one.files)).rejects.toThrow();
  });

  it("rejects a case-only near match rather than opening it or hiding the mismatch as missing", async () => {
    const data = selection();
    data.files[1] = entry("工程/maps/世界.MAP").file;
    await expect(readAtlasProjectFiles(data.files)).rejects.toThrow();
  });

  it("rejects NFC-equivalent distinct manifest asset declarations", async () => {
    const raw = fixture();
    raw.maps[0].asset.path = "maps/é.map";
    raw.maps[1].asset.path = "maps/e\u0301.map";
    const data = selection(raw);
    await expect(readAtlasProjectFiles(data.files)).rejects.toThrow();
  });

  it("bounds the selection and manifest bytes before reading contents", async () => {
    const data = selection();
    await expect(readAtlasProjectFiles([])).rejects.toThrow();
    await expect(readAtlasProjectFiles(Array.from({ length: 10_001 }, () => data.world.file))).rejects.toThrow();
    Object.defineProperty(data.manifest.file, "size", { value: 12_000_001 });
    await expect(readAtlasProjectFiles(data.files)).rejects.toThrow();
    expect(data.manifest.read).not.toHaveBeenCalled();
  });

  it("propagates unreadable snapshot and invalid UTF-8/JSON failures without reading maps", async () => {
    const data = selection();
    data.manifest.read.mockRejectedValueOnce(new DOMException("旧文件不可读", "NotReadableError"));
    await expect(readAtlasProjectFiles(data.files)).rejects.toThrow("旧文件不可读");
    data.manifest.read.mockResolvedValueOnce(new Uint8Array([255]).buffer);
    await expect(readAtlasProjectFiles(data.files)).rejects.toThrow();
    data.manifest.read.mockResolvedValueOnce(new TextEncoder().encode("{").buffer);
    await expect(readAtlasProjectFiles(data.files)).rejects.toThrow();
    expect(data.world.read).not.toHaveBeenCalled();
  });
});
