// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  dialogState: { clear: vi.fn() },
  Pins: { clearAll: vi.fn() },
  tip: vi.fn(),
  isElectron: vi.fn(() => false)
}));

vi.mock("@/components/dialog/state", () => ({ dialogState: dependencies.dialogState }));
vi.mock("@/components/pins", () => ({ Pins: dependencies.Pins }));
vi.mock("@/components/tooltips", () => ({ tip: dependencies.tip }));
vi.mock("./platform", () => ({ isElectron: dependencies.isElectron }));

type DialogButton = (this: HTMLElement) => void | Promise<void>;
type AnnouncementDialog = {
  resizable: boolean;
  title: string;
  width: string;
  position: { my: string; at: string; of: string };
  buttons: Record<string, DialogButton>;
};

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

function createHost() {
  const fixture = document.createElement("iframe");
  document.body.replaceChildren(fixture);
  const fixtureWindow = fixture.contentWindow!;
  const openAppOffer = vi.fn();
  Object.assign(fixtureWindow, { Services: { AppOffer: { open: openAppOffer } } });
  vi.stubGlobal("document", fixtureWindow.document);
  document.title = "HuanMeng Map Creator";
  document.body.innerHTML = `<span id="versionText"></span>
    <div id="alert"><div id="alertMessage"><p>Previous announcement</p></div></div>
    <section id="userMap"><input id="mapName" value="My English Map"></section>
    <section id="userNotes"><h2>English Note Name</h2><p>Keep my English note.</p></section>`;
  localStorage.clear();

  const alertElement = document.getElementById("alert")!;
  const alertMessage = document.getElementById("alertMessage")!;
  const mapElement = document.getElementById("userMap")!;
  const noteElement = document.getElementById("userNotes")!;
  const mapMarkup = mapElement.outerHTML;
  const noteMarkup = noteElement.outerHTML;
  const mapState = { name: "My English Map", note: "Keep my English note." };
  const appOptions = { map: mapState };
  const optionsApi = { reset: vi.fn(), set: vi.fn() };
  const storageWrite = vi.spyOn(Storage.prototype, "setItem");
  const storageClear = vi.spyOn(Storage.prototype, "clear");
  const storageRemove = vi.spyOn(Storage.prototype, "removeItem");
  let announcement: AnnouncementDialog | undefined;
  const dialog = vi.fn((value: AnnouncementDialog | "close") => {
    if (value !== "close") announcement = value;
  });
  const jquery = vi.fn((_target: string | HTMLElement) => ({ dialog }));
  const cacheStorage = {
    keys: vi.fn<() => Promise<string[]>>().mockResolvedValue(["map-ui", "map-fonts"]),
    delete: vi.fn<(name: string) => Promise<boolean>>().mockResolvedValue(true)
  };
  const unregisterMap = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);
  const unregisterAssets = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);
  const serviceWorker = {
    getRegistrations: vi.fn().mockResolvedValue([{ unregister: unregisterMap }, { unregister: unregisterAssets }])
  };
  const reload = vi.fn();
  const alert = vi.fn();
  // Observe the owned 6000 ms schedule, not unrelated iframe/import queue jobs.
  const schedule = vi.spyOn(globalThis, "setTimeout");

  vi.stubGlobal("alertMessage", alertMessage);
  vi.stubGlobal("$", jquery);
  vi.stubGlobal("location", { reload });
  vi.stubGlobal("navigator", { serviceWorker });
  vi.stubGlobal("caches", cacheStorage);
  vi.stubGlobal("Options", optionsApi);
  vi.stubGlobal("options", appOptions);
  vi.stubGlobal("alert", alert);
  vi.stubGlobal("VERSION", undefined);
  vi.stubGlobal("cleanupData", undefined);

  return {
    fixture,
    openAppOffer,
    alertElement,
    alertMessage,
    mapElement,
    noteElement,
    mapMarkup,
    noteMarkup,
    mapState,
    appOptions,
    optionsApi,
    storageWrite,
    storageClear,
    storageRemove,
    dialog,
    jquery,
    cacheStorage,
    serviceWorker,
    unregisterMap,
    unregisterAssets,
    reload,
    alert,
    schedule,
    getDialog(): AnnouncementDialog {
      if (!announcement) throw new Error("The announcement dialog has not opened");
      return announcement;
    }
  };
}

const realSetTimeout = globalThis.setTimeout;
let host: ReturnType<typeof createHost>;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
  dependencies.isElectron.mockReturnValue(false);
  host = createHost();
});

afterEach(() => {
  host.fixture.remove();
  vi.clearAllTimers();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  expect(globalThis.setTimeout).toBe(realSetTimeout);
  expect(vi.isFakeTimers()).toBe(false);
});

async function importVersioning(storedVersion: string | null = null) {
  if (storedVersion !== null) localStorage.setItem("version", storedVersion);
  host.storageWrite.mockClear();
  return import("./versioning");
}

function expectNoDataReset(): void {
  expect(host.storageClear).not.toHaveBeenCalled();
  expect(host.storageRemove).not.toHaveBeenCalled();
  expect(dependencies.dialogState.clear).not.toHaveBeenCalled();
  expect(dependencies.Pins.clearAll).not.toHaveBeenCalled();
  expect(host.optionsApi.reset).not.toHaveBeenCalled();
  expect(host.optionsApi.set).not.toHaveBeenCalled();
  expect(options).toBe(host.appOptions);
  expect(options.map).toBe(host.mapState);
  expect(host.mapState).toEqual({ name: "My English Map", note: "Keep my English note." });
}

function expectUserContentUnchanged(): void {
  expect(document.getElementById("userMap")).toBe(host.mapElement);
  expect(document.getElementById("userNotes")).toBe(host.noteElement);
  expect(host.mapElement.outerHTML).toBe(host.mapMarkup);
  expect(host.noteElement.outerHTML).toBe(host.noteMarkup);
  expect(document.querySelector<HTMLInputElement>("#mapName")!.value).toBe("My English Map");
}

describe("version announcement UI", () => {
  it("waits exactly 6000 ms on first launch and states the current version without claiming an update", async () => {
    const versioning = await importVersioning();

    expect(versioning.VERSION).toBe("0.7.6");
    expect(versioning.MAP_FORMAT_VERSION).toBe("1.154.0");
    expect(window.VERSION).toBe(versioning.VERSION);
    expect(window.cleanupData).toBe(versioning.cleanupData);
    expect(document.title).toBe(`HuanMeng Map Creator v${versioning.VERSION}`);
    expect(document.getElementById("versionText")!.innerText).toBe(`v${versioning.VERSION}`);
    expect(host.alert).not.toHaveBeenCalled();
    expect(host.schedule.mock.calls.filter(([, delay]) => delay === 6000)).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(5999);
    expect(host.dialog).not.toHaveBeenCalled();
    expect(host.storageWrite).not.toHaveBeenCalled();
    expect(localStorage.getItem("version")).toBeNull();

    await vi.advanceTimersByTimeAsync(1);
    expect(host.jquery).toHaveBeenCalledExactlyOnceWith("#alert");
    expect(host.dialog).toHaveBeenCalledTimes(1);
    expect(host.alertMessage.textContent).toContain(`HuanMeng Map Creator 当前版本为 ${versioning.VERSION}`);
    expect(host.alertMessage.textContent).toContain("存档保持兼容，加载时会自动升级。");
    expect(host.alertMessage.textContent).not.toContain("已更新至");
    expect(host.alertMessage.textContent).not.toContain("如遇错误");
    expect(host.storageWrite).toHaveBeenCalledExactlyOnceWith("version", versioning.VERSION);
    expect(dependencies.tip).not.toHaveBeenCalled();
    expectNoDataReset();
    expectUserContentUnchanged();
  });

  // VERSION is still 0.x; the existing validator accepts a synthetic negative major for branch coverage.
  it.each(["-1.99.99", "0.6.99"])("delays the existing major/minor update window for %s", async storedVersion => {
    const { VERSION } = await importVersioning(storedVersion);

    await vi.advanceTimersByTimeAsync(5999);
    expect(host.dialog).not.toHaveBeenCalled();
    expect(localStorage.getItem("version")).toBe(storedVersion);
    expect(host.storageWrite).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(host.dialog).toHaveBeenCalledTimes(1);
    expect(host.alertMessage.textContent).toContain(`HuanMeng Map Creator 已更新至 ${VERSION}`);
    expect(host.alertMessage.textContent).toContain("如遇错误，请重新载入页面以更新代码。");
    expect(host.storageWrite).toHaveBeenCalledExactlyOnceWith("version", VERSION);
    expect(dependencies.tip).not.toHaveBeenCalled();
    expectNoDataReset();
  });

  it("only shows the translated patch tip and records the version, without scheduling a window", async () => {
    const { VERSION } = await importVersioning("0.7.5");

    expect(dependencies.tip).toHaveBeenCalledExactlyOnceWith(
      `已更新至 v${VERSION}。如遇错误，请重新载入页面。`,
      true,
      "success",
      6000
    );
    expect(host.storageWrite).toHaveBeenCalledExactlyOnceWith("version", VERSION);
    expect(host.schedule.mock.calls.filter(([, delay]) => delay === 6000)).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(6000);
    expect(host.dialog).not.toHaveBeenCalled();
    expectNoDataReset();
    expectUserContentUnchanged();
  });

  it.each(["0.7.6", "0.7.7", "0.8.0", "1.0.0", "not-a-version"])(
    "does not announce or overwrite an equal, future or invalid stored version %s",
    async storedVersion => {
      await importVersioning(storedVersion);
      expect(host.schedule.mock.calls.filter(([, delay]) => delay === 6000)).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(6000);
      expect(host.dialog).not.toHaveBeenCalled();
      expect(dependencies.tip).not.toHaveBeenCalled();
      expect(host.storageWrite).not.toHaveBeenCalled();
      expect(localStorage.getItem("version")).toBe(storedVersion);
      expectNoDataReset();
    }
  );

  it("keeps Chinese content, brand and changes with the intentional verified-origin URL fix", async () => {
    const { VERSION } = await importVersioning();
    await vi.advanceTimersByTimeAsync(6000);

    expect(host.getDialog()).toEqual({
      resizable: false,
      title: "HuanMeng Map Creator 版本公告",
      width: "28em",
      position: { my: "center center-4em", at: "center", of: "svg" },
      buttons: { 清理缓存并重新载入: expect.any(Function), 关闭公告: expect.any(Function) }
    });
    expect(host.alertMessage.querySelector("strong")!.textContent).toBe(VERSION);
    expect(host.alertMessage.querySelector("ul strong")!.textContent).toBe("近期更新：");
    expect(Array.from(host.alertMessage.querySelectorAll("li"), item => item.textContent)).toEqual([
      "地球仪改为矢量球面：极点不再被挤成放射状花瓣，±180° 经线不再有接缝",
      "地球仪按国家/生物群系逐单元上色，区域地图自动补一张海洋底球",
      "存档格式保持与上一版兼容，旧地图可直接打开并自动升级"
    ]);
    const repository = host.alertMessage.querySelector<HTMLAnchorElement>('a[target="_blank"]')!;
    expect(repository.href).toBe("https://github.com/RZOZY/huanmeng-map-creator");
    expect(repository.textContent).toBe(repository.href);
    expect(repository.target).toBe("_blank");
    expect(repository.parentElement!.textContent).toContain("源代码与问题反馈：");
    expect(host.alertMessage.innerHTML).not.toContain("https://github.com/RZOZY/humeng-map-generator");
    const offer = host.alertMessage.querySelector<HTMLAnchorElement>('a[href="#"]')!;
    expect(offer.textContent).toBe("桌面应用");
    expect(offer.getAttribute("onclick")).toBe("window.Services.AppOffer.open(); return false");
    expect(offer.parentElement!.textContent).toBe("也可使用支持离线运行的桌面应用。");
    expect(offer.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))).toBe(false);
    expect(host.openAppOffer).toHaveBeenCalledTimes(1);
    expectUserContentUnchanged();
  });

  it("omits the browser app offer in Electron and labels the existing reload-only action accurately", async () => {
    dependencies.isElectron.mockReturnValue(true);
    await importVersioning();
    await vi.advanceTimersByTimeAsync(6000);

    expect(host.alertMessage.querySelector('a[href="#"]')).toBeNull();
    expect(host.alertMessage.innerHTML).not.toContain("window.Services.AppOffer.open()");
    expect(Object.keys(host.getDialog().buttons)).toEqual(["重新载入", "关闭公告"]);
    expect(host.alertMessage.textContent).toContain("HuanMeng Map Creator");
  });

  it.each([false, true])(
    "closes with the actual dialog this and no cleanup, reload or map writes (Electron=%s)",
    async electron => {
      dependencies.isElectron.mockReturnValue(electron);
      const { ARROW_TIP_KEY } = await importVersioning();
      await vi.advanceTimersByTimeAsync(6000);
      host.storageWrite.mockClear();

      await host.getDialog().buttons.关闭公告.call(host.alertElement);

      expect(host.jquery).toHaveBeenLastCalledWith(host.alertElement);
      expect(host.dialog).toHaveBeenLastCalledWith("close");
      expect(host.storageWrite).not.toHaveBeenCalled();
      expect(localStorage.getItem(ARROW_TIP_KEY)).toBeNull();
      expect(host.reload).not.toHaveBeenCalled();
      expect(host.cacheStorage.keys).not.toHaveBeenCalled();
      expect(host.cacheStorage.delete).not.toHaveBeenCalled();
      expect(host.serviceWorker.getRegistrations).not.toHaveBeenCalled();
      expect(host.unregisterMap).not.toHaveBeenCalled();
      expect(host.unregisterAssets).not.toHaveBeenCalled();
      expectNoDataReset();
      expectUserContentUnchanged();
    }
  );

  it("runs the real Electron reload callback without touching CacheStorage or Service Workers", async () => {
    dependencies.isElectron.mockReturnValue(true);
    const { VERSION } = await importVersioning();
    await vi.advanceTimersByTimeAsync(6000);
    expect(host.reload).not.toHaveBeenCalled();

    await host.getDialog().buttons.重新载入.call(host.alertElement);

    expect(host.reload).toHaveBeenCalledTimes(1);
    expect(host.cacheStorage.keys).not.toHaveBeenCalled();
    expect(host.cacheStorage.delete).not.toHaveBeenCalled();
    expect(host.serviceWorker.getRegistrations).not.toHaveBeenCalled();
    expect(host.unregisterMap).not.toHaveBeenCalled();
    expect(host.unregisterAssets).not.toHaveBeenCalled();
    expect(host.storageWrite).toHaveBeenCalledExactlyOnceWith("version", VERSION);
    expectNoDataReset();
    expectUserContentUnchanged();
  });

  it("runs the real web clearCache callback, awaiting every deletion and unregister before reload", async () => {
    const deletion = deferred<boolean>();
    const unregister = deferred<boolean>();
    host.cacheStorage.delete.mockImplementation(name => (name === "map-ui" ? deletion.promise : Promise.resolve(true)));
    host.unregisterMap.mockReturnValueOnce(unregister.promise);
    const { VERSION } = await importVersioning();
    await vi.advanceTimersByTimeAsync(6000);
    expect(host.cacheStorage.keys).not.toHaveBeenCalled();

    const completion = host.getDialog().buttons.清理缓存并重新载入.call(host.alertElement);
    await vi.advanceTimersByTimeAsync(0);
    expect(host.cacheStorage.keys).toHaveBeenCalledTimes(1);
    expect(host.cacheStorage.delete.mock.calls).toEqual([["map-ui"], ["map-fonts"]]);
    expect(host.serviceWorker.getRegistrations).not.toHaveBeenCalled();
    expect(host.reload).not.toHaveBeenCalled();

    deletion.resolve(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(host.serviceWorker.getRegistrations).toHaveBeenCalledTimes(1);
    expect(host.unregisterMap).toHaveBeenCalledTimes(1);
    expect(host.unregisterAssets).toHaveBeenCalledTimes(1);
    expect(host.reload).not.toHaveBeenCalled();

    unregister.resolve(true);
    await completion;
    expect(host.reload).toHaveBeenCalledTimes(1);
    expect(host.storageWrite).toHaveBeenCalledExactlyOnceWith("version", VERSION);
    expectNoDataReset();
    expectUserContentUnchanged();
  });

  it.each(["cache keys", "cache delete", "registrations", "unregister"] as const)(
    "preserves the existing rejected %s promise without reloading",
    async operation => {
      const error = new Error(`${operation} unavailable`);
      if (operation === "cache keys") host.cacheStorage.keys.mockRejectedValueOnce(error);
      if (operation === "cache delete") host.cacheStorage.delete.mockRejectedValueOnce(error);
      if (operation === "registrations") host.serviceWorker.getRegistrations.mockRejectedValueOnce(error);
      if (operation === "unregister") host.unregisterMap.mockRejectedValueOnce(error);
      const { VERSION } = await importVersioning();
      await vi.advanceTimersByTimeAsync(6000);

      const completion = host.getDialog().buttons.清理缓存并重新载入.call(host.alertElement);
      await expect(completion).rejects.toBe(error);

      expect(host.reload).not.toHaveBeenCalled();
      expect(host.storageWrite).toHaveBeenCalledExactlyOnceWith("version", VERSION);
      expectNoDataReset();
      expectUserContentUnchanged();
    }
  );

  it("retains web cache deletion and reload when Service Workers are unavailable", async () => {
    vi.stubGlobal("navigator", {});
    await importVersioning();
    await vi.advanceTimersByTimeAsync(6000);

    await host.getDialog().buttons.清理缓存并重新载入.call(host.alertElement);

    expect(host.cacheStorage.delete.mock.calls).toEqual([["map-ui"], ["map-fonts"]]);
    expect(host.serviceWorker.getRegistrations).not.toHaveBeenCalled();
    expect(host.unregisterMap).not.toHaveBeenCalled();
    expect(host.unregisterAssets).not.toHaveBeenCalled();
    expect(host.reload).toHaveBeenCalledTimes(1);
    expectNoDataReset();
  });

  it("preserves legacy parsing and numeric comparison, including the major/minor-only option", async () => {
    const { parseMapVersion, isValidVersion, compareVersions } = await importVersioning("0.7.6");

    expect(parseMapVersion("1.732")).toBe("1.73.2");
    expect(parseMapVersion("0.7b")).toBe("0.7.0");
    expect(parseMapVersion("0.7.6")).toBe("0.7.6");
    expect(isValidVersion("1.2.3")).toBe(true);
    expect(isValidVersion("1.2")).toBe(false);
    expect(compareVersions("1.9.9", "2.0.0")).toEqual({ isEqual: false, isNewer: false, isOlder: true });
    expect(compareVersions("0.7.10", "0.7.9")).toEqual({ isEqual: false, isNewer: true, isOlder: false });
    expect(compareVersions("0.7.5", "0.7.6", { major: true, minor: true, patch: false })).toEqual({
      isEqual: true,
      isNewer: false,
      isOlder: false
    });
    expect(compareVersions(null, "0.7.6")).toEqual({ isEqual: false, isNewer: false, isOlder: false });
  });
});
