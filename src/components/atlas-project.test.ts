// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MapLoadOutcome } from "@/services/io/load-operation";

const mocks = vi.hoisted(() => ({ upload: vi.fn(), tip: vi.fn() }));
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
  document.body.replaceChildren();
  if (oldShowModal) Object.defineProperty(HTMLDialogElement.prototype, "showModal", oldShowModal);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  if (oldClose) Object.defineProperty(HTMLDialogElement.prototype, "close", oldClose);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
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
