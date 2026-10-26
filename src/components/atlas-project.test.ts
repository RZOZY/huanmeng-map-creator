// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AtlasNavigationPorts } from "@/services/atlas/navigation-session";
import type { MapLoadOutcome } from "@/services/io/load-operation";

const mocks = vi.hoisted(() => ({ upload: vi.fn(), tip: vi.fn(), receipt: vi.fn(), capture: vi.fn(), apply: vi.fn() }));
vi.mock("@/services", () => ({ Services: { Load: { uploadAtlasMap: mocks.upload } } }));
vi.mock("@/components/tooltips", () => ({ tip: mocks.tip }));
const WORLD = "20000000-0000-4000-8000-000000000001";
const LOCAL = "20000000-0000-4000-8000-000000000002";

function fixture(name = "项目 <Beta>") {
  const world = {
    id: WORLD,
    name: "同名 <Alpha>",
    kind: "world",
    asset: { path: "maps/世界.map", sha256: "a".repeat(64) },
    projection: "equirectangular",
    provenance: "测试记录",
    frame: { west: -180, east: 180, south: -90, north: 90 },
    size: { width: 1000, height: 500 },
    geographicRevision: 1,
    detailLevel: 0,
    parent: null,
    georeference: { verified: true, evidence: "测试锚点" }
  };
  return {
    schemaVersion: 1,
    project: { id: "10000000-0000-4000-8000-000000000001", name },
    worldMapId: WORLD,
    maps: [
      world,
      {
        ...world,
        id: LOCAL,
        kind: "local",
        detailLevel: 1,
        asset: { path: "maps/详图.map", sha256: "b".repeat(64) },
        parent: { mapId: WORLD, geographicRevision: 1 }
      }
    ],
    places: []
  };
}
function entry(path: string, text = "不预读地图") {
  const file = new File([text], path.split("/").at(-1) ?? "", { type: "application/octet-stream" });
  const read = vi.fn(async () => new TextEncoder().encode(text).buffer);
  Object.defineProperties(file, { webkitRelativePath: { value: path }, arrayBuffer: { value: read } });
  return { file, read };
}
function selection(name?: string) {
  const raw = fixture(name);
  const manifest = entry("工程/atlas.json", JSON.stringify(raw));
  const world = entry("工程/maps/世界.map");
  const local = entry("工程/maps/详图.map");
  return { raw, manifest, world, local, files: [manifest.file, world.file, local.file] };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const node = <T extends Element>(selector: string) => document.querySelector<T>(selector)!;
const mapButton = (id = WORLD) => node<HTMLButtonElement>(`button[data-atlas-map="${id}"]`);
const input = () => node<HTMLInputElement>("#atlasProjectDirectory");
const status = () => node<HTMLElement>("[data-status]").textContent;
const choose = () => node<HTMLButtonElement>('[data-action="choose"]');
const close = () => node<HTMLButtonElement>('[data-action="close"]');
function selectFiles(files: File[]) {
  const directory = input();
  Object.defineProperty(directory, "files", { configurable: true, value: files });
  directory.dispatchEvent(new Event("change"));
}
async function ready(files = selection().files) {
  selectFiles(files);
  await vi.waitFor(() => expect(document.querySelector("tbody tr")).not.toBeNull());
}
let showAtlasProject: () => void;
let oldShowModal: PropertyDescriptor | undefined;
let oldClose: PropertyDescriptor | undefined;
beforeEach(async () => {
  vi.resetModules();
  const identity = await import("@/services/atlas/identity");
  const model = await import("@/services/io/model-status");
  vi.doMock("@/components/atlas-navigation-ports", () => ({
    createAtlasNavigationPorts: (): AtlasNavigationPorts => ({
      identity: identity.getCurrentAtlasIdentity,
      epoch: model.getMapModelEpoch,
      stable: model.isMapModelStable,
      observe: sha256 => ({
        sha256,
        projection: "equirectangular",
        frame: { west: -180, east: 180, north: 90, south: -90 },
        size: { width: 1000, height: 500 },
        objects: []
      }),
      captureView: mocks.capture,
      applyView: mocks.apply,
      load: (file, json, mapId, canAdopt) => mocks.receipt(file, json, mapId, { canAdopt })
    })
  }));
  mocks.receipt.mockReset().mockResolvedValue({ outcome: { type: "cancelled" }, replacementEpoch: null });
  mocks.capture.mockReset().mockReturnValue({ x: 321.25, y: 123.5, scale: 1.25 });
  mocks.apply.mockReset();
  mocks.upload.mockReset().mockResolvedValue({ type: "cancelled" });
  mocks.tip.mockReset();
  document.body.replaceChildren();
  oldShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
  oldClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    })
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    })
  });
  ({ showAtlasProject } = await import("./atlas-project"));
  showAtlasProject();
});
afterEach(() => {
  document.querySelector<HTMLButtonElement>('#atlasProjectPanel [data-action="close"]')?.click();
  document.body.replaceChildren();
  if (oldShowModal) Object.defineProperty(HTMLDialogElement.prototype, "showModal", oldShowModal);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  if (oldClose) Object.defineProperty(HTMLDialogElement.prototype, "close", oldClose);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
});

async function seedSource(name = "采用来源 <Alpha>") {
  const { parseAtlasManifest } = await import("@/services/atlas/manifest");
  const { recordVerifiedAtlasIdentity, getCurrentAtlasIdentity } = await import("@/services/atlas/identity");
  const { getMapModelEpoch, markMapModelStable } = await import("@/services/io/model-status");
  markMapModelStable();
  expect(
    recordVerifiedAtlasIdentity(
      parseAtlasManifest(JSON.stringify(fixture(name))),
      WORLD,
      "a".repeat(64),
      getMapModelEpoch()
    )
  ).toBe(true);
  return getCurrentAtlasIdentity()!;
}
const identityText = () => node<HTMLElement>("[data-atlas-identity]")?.textContent;
const refreshIdentity = () => node<HTMLButtonElement>('[data-action="refresh-identity"]').click();

const localNav = () => node<HTMLButtonElement>('[data-direction="local"]');
const worldNav = () => node<HTMLButtonElement>('[data-direction="world"]');
const backNav = () => node<HTMLButtonElement>('[data-action="back-view"]');
const minimize = () => node<HTMLButtonElement>('[data-action="minimize"]');
const placeSelect = () => node<HTMLSelectElement>("[data-atlas-place]");
function navigationSelection() {
  const selected = selection();
  const raw = {
    ...selected.raw,
    places: [
      {
        id: "30000000-0000-4000-8000-000000000001",
        name: "同名 <img src=x>",
        kind: "地点",
        coordinate: { longitude: 0, latitude: 0 },
        provenance: "测试",
        revision: 1,
        bindings: []
      },
      {
        id: "30000000-0000-4000-8000-000000000002",
        name: "同名 <img src=x>",
        kind: "地点",
        coordinate: { longitude: 10, latitude: 20 },
        provenance: "测试",
        revision: 1,
        bindings: []
      }
    ]
  };
  const manifest = entry("工程/atlas.json", JSON.stringify(raw));
  return { ...selected, raw, manifest, files: [manifest.file, selected.world.file, selected.local.file] };
}
async function readyNavigation() {
  const selected = navigationSelection();
  await ready(selected.files);
  await seedSource();
  refreshIdentity();
  expect(localNav().disabled).toBe(false);
  return selected;
}
async function mockRealizedNavigation() {
  const model = await import("@/services/io/model-status");
  const identity = await import("@/services/atlas/identity");
  const { parseAtlasManifest } = await import("@/services/atlas/manifest");
  mocks.receipt.mockImplementation(
    async (_file: File, json: string, mapId: string, authorization: { canAdopt: () => boolean }) => {
      if (!authorization.canAdopt()) return { outcome: { type: "cancelled" }, replacementEpoch: null };
      model.markMapModelUnstable();
      window.dispatchEvent(new Event("map:replacing"));
      model.markMapModelStable();
      const manifest = parseAtlasManifest(json);
      const map = manifest.maps.find(map => map.id === mapId)!;
      expect(identity.recordVerifiedAtlasIdentity(manifest, mapId, map.asset.sha256, model.getMapModelEpoch())).toBe(
        true
      );
      return { outcome: { type: "loaded" }, replacementEpoch: model.getMapModelEpoch() };
    }
  );
}
async function moveToLocal() {
  localNav().click();
  await vi.waitFor(() => expect(status()).toContain("导航完成"));
}

describe("navigation UI and retained minimization capability", () => {
  it("shows UUID/coordinates for duplicate names and enables only an associated selected project", async () => {
    expect(localNav().disabled).toBe(true);
    const selected = navigationSelection();
    await ready(selected.files);
    expect(localNav().disabled).toBe(true);
    expect(placeSelect().options).toHaveLength(2);
    expect(placeSelect().options[1].textContent).toContain("10°, 20°");
    expect(placeSelect().options[1].textContent).toContain(selected.raw.places[1].id);
    expect(document.querySelector("[data-atlas-navigation] img")).toBeNull();
    await seedSource();
    refreshIdentity();
    expect(localNav().disabled).toBe(false);
    expect(worldNav().disabled).toBe(true);
  });
  it("uses selected place UUID and exact target File through the receipt API, not raw open", async () => {
    const selected = await readyNavigation();
    await mockRealizedNavigation();
    placeSelect().value = selected.raw.places[1].id;
    await moveToLocal();
    expect(mocks.receipt).toHaveBeenCalledOnce();
    expect(mocks.receipt.mock.calls[0][0]).toBe(selected.local.file);
    expect(mocks.receipt.mock.calls[0][2]).toBe(LOCAL);
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.apply.mock.calls[0][0].x).toBeCloseTo(527.7777777777778);
    expect(mocks.apply.mock.calls[0][0].y).toBeCloseTo(194.44444444444446);
    expect(mocks.apply.mock.calls[0][0].scale).toBe(2);
    expect(backNav().disabled).toBe(false);
    expect(identityText()).toContain(LOCAL);
  });
  it("can minimize to interact with the map and reopen the same authorized session to return", async () => {
    const selected = await readyNavigation();
    await mockRealizedNavigation();
    await moveToLocal();
    const panel = node<HTMLDialogElement>("#atlasProjectPanel");
    const directory = input();
    minimize().click();
    expect(panel.open).toBe(false);
    expect(panel.isConnected).toBe(true);
    showAtlasProject();
    expect(panel.open).toBe(true);
    expect(input()).toBe(directory);
    expect(backNav().disabled).toBe(false);
    backNav().click();
    await vi.waitFor(() => expect(mocks.receipt).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(close().disabled).toBe(false));
    expect(mocks.receipt.mock.calls[1][0]).toBe(selected.world.file);
    expect(mocks.apply.mock.calls.at(-1)?.[0]).toEqual({ x: 321.25, y: 123.5, scale: 1.25 });
    expect(backNav().disabled).toBe(true);
    expect(identityText()).toContain(WORLD);
  });
  it("does not let a delayed native minimize-close event dispose a reopened session", async () => {
    await readyNavigation();
    const panel = node<HTMLDialogElement>("#atlasProjectPanel");
    Object.defineProperty(HTMLDialogElement.prototype, "close", {
      configurable: true,
      value: vi.fn(function (this: HTMLDialogElement) {
        this.removeAttribute("open");
      })
    });
    minimize().click();
    showAtlasProject();
    panel.dispatchEvent(new Event("close"));
    expect(panel.isConnected).toBe(true);
    expect(panel.open).toBe(true);
    expect(placeSelect().options).toHaveLength(2);
  });
  it("keeps all controls locked through real receipt settlement and rejects hidden repeat events", async () => {
    await readyNavigation();
    const pending = deferred<{ outcome: { type: "cancelled" }; replacementEpoch: null }>();
    mocks.receipt.mockReturnValueOnce(pending.promise);
    localNav().click();
    expect(close().disabled).toBe(true);
    expect(minimize().disabled).toBe(true);
    expect(choose().disabled).toBe(true);
    localNav().dispatchEvent(new MouseEvent("click"));
    expect(mocks.receipt).toHaveBeenCalledOnce();
    minimize().dispatchEvent(new MouseEvent("click"));
    expect(node<HTMLDialogElement>("#atlasProjectPanel").open).toBe(true);
    pending.resolve({ outcome: { type: "cancelled" }, replacementEpoch: null });
    await vi.waitFor(() => expect(close().disabled).toBe(false));
    expect(backNav().disabled).toBe(true);
    expect(status()).toContain("已停留");
  });
  it("retains valid return history after cancellation, but explicit close releases it", async () => {
    await readyNavigation();
    await mockRealizedNavigation();
    await moveToLocal();
    mocks.receipt.mockResolvedValueOnce({ outcome: { type: "cancelled" }, replacementEpoch: null });
    worldNav().click();
    await vi.waitFor(() => expect(status()).toContain("已停留"));
    expect(backNav().disabled).toBe(false);
    close().click();
    showAtlasProject();
    expect(backNav().disabled).toBe(true);
    expect(placeSelect().options).toHaveLength(0);
    expect(status()).toContain("尚未选择目录");
  });
  it("clears the prior project return chain on directory re-selection", async () => {
    await readyNavigation();
    await mockRealizedNavigation();
    await moveToLocal();
    const next = navigationSelection();
    selectFiles(next.files);
    await vi.waitFor(() => expect(status()).toContain("目录匹配完成"));
    expect(backNav().disabled).toBe(true);
    expect(mocks.receipt).toHaveBeenCalledOnce();
  });
  it("invalidates history and navigation immediately on an external replacement", async () => {
    await readyNavigation();
    await mockRealizedNavigation();
    await moveToLocal();
    const model = await import("@/services/io/model-status");
    model.markMapModelUnstable();
    window.dispatchEvent(new Event("map:replacing"));
    expect(backNav().disabled).toBe(true);
    expect(localNav().disabled).toBe(true);
    expect(identityText()).toContain("失效");
  });
  it("reports loaded-but-view-failed honestly and never commits a return entry", async () => {
    await readyNavigation();
    await mockRealizedNavigation();
    mocks.apply.mockImplementationOnce(() => {
      throw new Error("renderer failed");
    });
    localNav().click();
    await vi.waitFor(() => expect(status()).toContain("地图采用已完成"));
    expect(status()).toContain("不是自动回滚");
    expect(identityText()).toContain(LOCAL);
    expect(backNav().disabled).toBe(true);
  });
});

describe("read-only source identity in the atlas panel", () => {
  it("starts explicitly unknown; a loaded receipt alone cannot invent a source", async () => {
    expect(identityText()).toContain("未关联");
    await ready();
    mocks.upload.mockResolvedValueOnce({ type: "loaded" });
    mapButton().click();
    await vi.waitFor(() => expect(close().disabled).toBe(false));
    expect(identityText()).toContain("未关联");
  });
  it("keeps source across close/reopen without retaining or inventing a selected directory", async () => {
    const source = await seedSource();
    close().click();
    showAtlasProject();
    expect(identityText()).toContain(source.projectName);
    expect(identityText()).toContain(WORLD);
    expect(identityText()).toContain(source.sourceAssetSha256);
    expect(identityText()).toContain("不证明");
    expect(document.querySelector("[data-atlas-identity] img")).toBeNull();
    expect(status()).toContain("尚未选择目录");
    expect(document.querySelector("tbody tr")).toBeNull();
  });
  it("never labels a reselected same-UUID different revision/hash as the current exact file", async () => {
    await seedSource("原始来源");
    refreshIdentity();
    const data = selection("另一个来源声明");
    data.raw.maps[0].asset.sha256 = "c".repeat(64);
    data.raw.maps[0].geographicRevision = 2;
    data.raw.maps[1].parent!.geographicRevision = 2;
    const manifest = entry("工程/atlas.json", JSON.stringify(data.raw));
    await ready([manifest.file, data.world.file, data.local.file]);
    expect(identityText()).toContain("原始来源");
    expect(identityText()).not.toContain("另一个来源声明");
    expect(node("tbody").textContent).toContain("待双重核验");
    expect(node("tbody").textContent).not.toContain("当前文件");
  });
  it("clears at actual replacement and cannot recover identity from a legacy generated timestamp", async () => {
    await seedSource();
    refreshIdentity();
    const { markMapModelUnstable, markMapModelStable } = await import("@/services/io/model-status");
    markMapModelUnstable();
    window.dispatchEvent(new Event("map:replacing"));
    expect(identityText()).toContain("未关联");
    markMapModelStable();
    window.dispatchEvent(new CustomEvent("map:generated", { detail: { mapId: 42 } }));
    refreshIdentity();
    expect(identityText()).toContain("未关联");
  });
  it("refreshes the actual source after service settlement, not from selected row names or map IDs", async () => {
    await ready();
    mocks.upload.mockImplementationOnce(async () => {
      await seedSource("真实采用记录");
      return { type: "loaded" };
    });
    mapButton().click();
    await vi.waitFor(() => expect(close().disabled).toBe(false));
    expect(identityText()).toContain("真实采用记录");
    expect(identityText()).not.toContain("项目 <Beta>");
  });
  it("only re-reads metadata on manual refresh, never file bytes or another load", async () => {
    const data = selection();
    await ready(data.files);
    await seedSource();
    refreshIdentity();
    expect(identityText()).toContain("采用来源");
    expect(data.manifest.read).toHaveBeenCalledOnce();
    expect(data.world.read).not.toHaveBeenCalled();
    expect(data.local.read).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("releases replacement listeners and cannot mutate a detached source card after closing", async () => {
    await seedSource();
    refreshIdentity();
    const oldCard = node<HTMLElement>("[data-atlas-identity]");
    const previous = oldCard.textContent;
    close().click();
    const { markMapModelUnstable, markMapModelStable } = await import("@/services/io/model-status");
    markMapModelUnstable();
    window.dispatchEvent(new Event("map:replacing"));
    expect(oldCard.textContent).toBe(previous);
    markMapModelStable();
    showAtlasProject();
    expect(identityText()).toContain("未关联");
  });
});

describe("session-owned explicit atlas project panel", () => {
  it("opens with clear empty state and has no automatic map IO", () => {
    expect(node("h3").textContent).toBe("图集项目");
    expect(status()).toContain("尚未选择");
    expect(input().hasAttribute("webkitdirectory")).toBe(true);
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("reads only manifest and forwards exact selected File, frozen snapshot JSON and UUID once", async () => {
    const data = selection();
    await ready(data.files);
    expect(data.manifest.read).toHaveBeenCalledOnce();
    expect(data.world.read).not.toHaveBeenCalled();
    expect(data.local.read).not.toHaveBeenCalled();
    expect(input().value).toBe("");
    expect(document.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(status()).toContain("未读取任何地图");
    mapButton(LOCAL).click();
    expect(mocks.upload).toHaveBeenCalledOnce();
    const [file, json, id] = mocks.upload.mock.calls[0];
    expect(file).toBe(data.local.file);
    expect(id).toBe(LOCAL);
    expect(JSON.parse(json).project.name).toBe(data.raw.project.name);
    await vi.waitFor(() => expect(close().disabled).toBe(false));
    expect(data.local.read).not.toHaveBeenCalled();
  });
  it("renders hostile user names only as text, with isolated map/path labels", async () => {
    const data = selection('<img src=x onerror="window.bad=1"> & \u202e');
    await ready(data.files);
    expect(node("[data-project]").textContent).toContain(data.raw.project.name);
    expect(document.querySelector("img")).toBeNull();
    expect(node("tbody bdi").textContent).toBe("同名 <Alpha>");
    expect(document.querySelectorAll("tbody bdi")).toHaveLength(6);
  });
  it("lists missing and unverified assets without opening or borrowing old capabilities", async () => {
    const data = selection();
    await ready(data.files);
    const raw = fixture();
    raw.maps[0].georeference = { verified: false, evidence: "" };
    await ready([entry("工程/atlas.json", JSON.stringify(raw)).file, data.world.file]);
    expect(mapButton().disabled).toBe(true);
    expect(mapButton(LOCAL).disabled).toBe(true);
    expect(node("tbody").textContent).toContain("缺少文件");
    mapButton().dispatchEvent(new MouseEvent("click"));
    mapButton(LOCAL).dispatchEvent(new MouseEvent("click"));
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("shows all-missing state and empty selection clears the prior project", async () => {
    const data = selection();
    await ready([data.manifest.file]);
    expect(status()).toContain("所有缺失项均不可打开");
    selectFiles([]);
    expect(document.querySelector("tbody tr")).toBeNull();
    expect(status()).toContain("未取得目录文件");
  });
  it.each([false, true])("ignores late old manifest success/failure after a newer selection (%s)", async fails => {
    const slow = deferred<ArrayBuffer>();
    const old = selection("旧项目");
    old.manifest.read.mockReturnValueOnce(slow.promise);
    selectFiles(old.files);
    const fresh = selection("新项目");
    await ready(fresh.files);
    if (fails) slow.reject(new Error("过期错误"));
    else slow.resolve(new TextEncoder().encode(JSON.stringify(old.raw)).buffer);
    await Promise.resolve();
    await Promise.resolve();
    expect(node("[data-project]").textContent).toContain("新项目");
    expect(status()).not.toContain("过期错误");
    mapButton().click();
    expect(mocks.upload.mock.calls[0][0]).toBe(fresh.world.file);
    await vi.waitFor(() => expect(close().disabled).toBe(false));
  });
  it.each([false, true])("close/reopen releases ownership and ignores old input and late read (%s)", async fails => {
    const oldInput = input();
    const data = selection("旧项目");
    const slow = deferred<ArrayBuffer>();
    data.manifest.read.mockReturnValueOnce(slow.promise);
    selectFiles(data.files);
    close().click();
    expect(document.querySelector("dialog")).toBeNull();
    showAtlasProject();
    expect(input()).not.toBe(oldInput);
    oldInput.dispatchEvent(new Event("change"));
    if (fails) slow.reject(new Error("过期错误"));
    else slow.resolve(new TextEncoder().encode(JSON.stringify(data.raw)).buffer);
    await Promise.resolve();
    await Promise.resolve();
    expect(status()).toContain("尚未选择");
    expect(document.querySelector("tbody tr")).toBeNull();
  });
  it("does not resurrect a project after malformed or unreadable manifest", async () => {
    const data = selection();
    await ready(data.files);
    const bad = entry("工程/atlas.json", "{");
    selectFiles([bad.file]);
    await vi.waitFor(() => expect(status()).toContain("无法打开项目"));
    expect(document.querySelector("tbody tr")).toBeNull();
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it.each(["loaded", "busy", "rejected", "cancelled", "failed"] as const)(
    "locks the entire session until %s actually settles",
    async type => {
      await ready();
      const pending = deferred<MapLoadOutcome>();
      mocks.upload.mockImplementation(() => {
        expect(choose().disabled).toBe(true);
        expect(close().disabled).toBe(true);
        expect(mapButton().disabled).toBe(true);
        return pending.promise;
      });
      const panel = node<HTMLDialogElement>("dialog");
      mapButton().click();
      close().click();
      panel.dispatchEvent(new Event("cancel", { cancelable: true }));
      panel.close();
      showAtlasProject();
      selectFiles(selection("不得抢占").files);
      mapButton().click();
      expect(node("dialog")).toBe(panel);
      expect(panel.open).toBe(true);
      expect(document.querySelectorAll("dialog")).toHaveLength(1);
      expect(mocks.upload).toHaveBeenCalledOnce();
      expect(node("[data-project]").textContent).not.toContain("不得抢占");
      pending.resolve(type === "failed" ? { type, error: new Error("采用异常") } : { type });
      await vi.waitFor(() => expect(close().disabled).toBe(false));
      expect(mapButton().disabled).toBe(false);
      if (type === "loaded") expect(status()).toContain("最近一次打开成功");
      else expect(status()).not.toContain("最近一次打开成功");
      if (type === "failed") {
        expect(status()).toContain("当前模型可能混合");
        expect(status()).not.toContain("旧图未变");
      }
      close().click();
      expect(document.querySelector("dialog")).toBeNull();
    }
  );
  it.each([false, true])("unlocks and reports risk when upload throws/rejects (%s)", async rejects => {
    await ready();
    mocks.upload.mockImplementation(() => {
      if (rejects) return Promise.reject(new Error("依赖失败"));
      throw new Error("依赖失败");
    });
    mapButton().click();
    await vi.waitFor(() => expect(close().disabled).toBe(false));
    expect(status()).toContain("载图调用异常");
    expect(status()).toContain("当前模型可能已部分替换");
  });
  it("native Escape/close while idle disposes the session and supports a fresh reopen", () => {
    node("dialog").dispatchEvent(new Event("cancel", { cancelable: true }));
    expect(document.querySelector("dialog")).toBeNull();
    showAtlasProject();
    node<HTMLDialogElement>("dialog").close();
    expect(document.querySelector("dialog")).toBeNull();
    showAtlasProject();
    expect(status()).toContain("尚未选择");
  });
  it("fails closed on modal setup error and permits retry", () => {
    close().click();
    vi.mocked(HTMLDialogElement.prototype.showModal).mockImplementationOnce(() => {
      throw new Error("modal failed");
    });
    showAtlasProject();
    expect(document.querySelector("dialog")).toBeNull();
    expect(mocks.tip).toHaveBeenCalledWith(expect.stringContaining("无法打开图集"), true, "error", 8000);
    showAtlasProject();
    expect(node<HTMLDialogElement>("dialog").open).toBe(true);
  });
});
