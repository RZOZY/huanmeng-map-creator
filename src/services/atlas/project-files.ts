import { type AtlasManifest, type AtlasMap, parseAtlasManifest, serializeAtlasManifest } from "./manifest";

export interface AtlasProjectAsset {
  readonly map: AtlasMap;
  readonly file: File | null;
}

export interface AtlasProjectFiles {
  readonly rootName: string;
  readonly manifest: AtlasManifest;
  readonly manifestJSON: string;
  readonly assets: readonly AtlasProjectAsset[];
}

const MAX_FILES = 10_000;
const MAX_MANIFEST_BYTES = 12_000_000;
const collisionKey = (path: string) => path.normalize("NFC").toLowerCase();

/** Matches only user-selected File capabilities, not physical paths or filesystem identities. */
export async function readAtlasProjectFiles(files: readonly File[]): Promise<AtlasProjectFiles> {
  if (!files.length || files.length > MAX_FILES) throw new Error("请选择包含不超过一万个文件的项目目录");
  const exact = new Map<string, File>();
  const aliases = new Map<string, string>();
  let rootName = "";
  for (const file of files) {
    const path = file.webkitRelativePath;
    validatePath(path);
    const [root, ...rest] = path.split("/");
    if (!rest.length || file.name !== rest.at(-1)) throw new Error("所选文件的相对路径与文件名不一致");
    if (rootName && rootName !== root) throw new Error("一次只能选择同一个项目根目录");
    rootName = root;
    const relative = rest.join("/");
    const key = collisionKey(relative);
    if (aliases.has(key)) throw new Error(`项目中存在重复或大小写／Unicode 歧义路径：${relative}`);
    exact.set(relative, file);
    aliases.set(key, relative);
  }
  const manifestFile = exact.get("atlas.json");
  if (!manifestFile) throw new Error("项目根目录必须包含名称完全一致的 atlas.json");
  if (manifestFile.size > MAX_MANIFEST_BYTES) throw new Error("图集清单文件超过 1200 万字节限制");
  const bytes = await manifestFile.arrayBuffer();
  if (bytes.byteLength > MAX_MANIFEST_BYTES) throw new Error("图集清单文件超过 1200 万字节限制");
  const manifest = parseAtlasManifest(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  const declared = new Set<string>();
  const assets = manifest.maps.map(map => {
    const path = map.asset.path;
    validatePath(path);
    const key = collisionKey(path);
    if (declared.has(key)) throw new Error(`清单中存在 Unicode 歧义资产路径：${path}`);
    declared.add(key);
    const alias = aliases.get(key);
    if (alias !== undefined && alias !== path) throw new Error(`资产路径大小写／Unicode 不完全一致：${path}`);
    return Object.freeze({ map, file: exact.get(path) ?? null });
  });
  return Object.freeze({
    rootName,
    manifest,
    manifestJSON: serializeAtlasManifest(manifest),
    assets: Object.freeze(assets)
  });
}

function validatePath(path: string): void {
  if (
    !path ||
    path.length > 4096 ||
    /[\\:%?#<>"|*\p{Cc}\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(path) ||
    path
      .split("/")
      .some(
        segment =>
          !segment ||
          segment === "." ||
          segment === ".." ||
          segment.trim() !== segment ||
          segment.endsWith(".") ||
          /^(con|prn|aux|nul|conin\$|conout\$|clock\$|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(segment)
      )
  )
    throw new Error("项目文件路径无效；不接受越界、编码、保留名或不可见控制字符");
}
