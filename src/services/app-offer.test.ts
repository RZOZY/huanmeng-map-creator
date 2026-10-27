// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppOffer } from "./app-offer";

const RELEASES_API = "https://api.github.com/repos/RZOZY/huanmeng-map-creator/releases/latest";
const RELEASES_PAGE = "https://github.com/RZOZY/huanmeng-map-creator/releases/latest";
const VERSION = "0.7.6-rc.1+Build.ABC";
const SUFFIXES = [
  "-win-x64.exe",
  "-win-arm64.exe",
  "-mac-arm64.dmg",
  "-mac-x64.dmg",
  "-linux-x86_64.AppImage",
  "-linux-amd64.deb"
];
const LABELS = [
  "Windows",
  "Windows（ARM 架构）",
  "Mac（Apple silicon 芯片）",
  "Mac（Intel 芯片）",
  "Linux",
  "Debian 或 Ubuntu"
];

type AssetFixture = { name: string; browser_download_url: string; size: number };
type ReleaseFixture = { tag_name: string | number; assets: AssetFixture[] };
type ReleaseResponse = { ok: boolean; json: () => Promise<unknown> };
type BrowserFixture = {
  platform?: string;
  userAgent?: string;
  userAgentData?: {
    mobile?: boolean;
    platform?: string;
    getHighEntropyValues?: (hints: string[]) => Promise<{ architecture?: string }>;
  };
};
type OfferDialog = {
  resizable: boolean;
  title: string;
  width: string;
  position: { my: string; at: string; of: Window };
  buttons: Record<string, (this: HTMLElement) => void>;
};

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

function makeRelease(tag_name: string | number = `v${VERSION}`): ReleaseFixture {
  return {
    tag_name,
    assets: SUFFIXES.map((suffix, index) => ({
      name: `HuanMeng-English-${VERSION}${suffix}`,
      browser_download_url: `https://downloads.example.test/Keep-English${suffix}?token=Original-ABC#asset`,
      size: (42 + index + 0.6) * 1024 * 1024
    }))
  };
}

function response(value: unknown, ok = true) {
  return { ok, json: vi.fn<() => Promise<unknown>>().mockResolvedValue(value) };
}

function createHost() {
  const fixture = document.createElement("iframe");
  document.body.replaceChildren(fixture);
  vi.stubGlobal("document", fixture.contentWindow!.document);
  document.body.innerHTML = `<div id="alert"><div id="alertMessage"><p>Previous English message</p></div></div>
    <section id="userMap"><input id="mapName" value="My English Map"></section>
    <section id="userNotes"><h2>English Note Name</h2><p>Keep my English note.</p></section>`;
  const alertElement = document.getElementById("alert")!;
  const alertMessage = document.getElementById("alertMessage")!;
  const mapElement = document.getElementById("userMap")!;
  const noteElement = document.getElementById("userNotes")!;
  const mapMarkup = mapElement.outerHTML;
  const noteMarkup = noteElement.outerHTML;
  const packModel = Object.freeze({
    name: "My English Map",
    cells: Object.freeze([Object.freeze({ id: 7, biome: 12 })])
  });
  const gridModel = Object.freeze({ seed: "Original-English-Seed", cells: Object.freeze([7]) });
  const appOptions = Object.freeze({ mapName: "My English Map", note: "Keep my English note." });
  localStorage.clear();
  localStorage.setItem("map", "Original English map data");
  const storageWrite = vi.spyOn(Storage.prototype, "setItem");
  const storageRemove = vi.spyOn(Storage.prototype, "removeItem");
  const storageClear = vi.spyOn(Storage.prototype, "clear");
  const openWindow = vi.spyOn(window, "open").mockImplementation(() => null);
  const anchorPrototype = Object.getPrototypeOf(document.createElement("a")) as HTMLAnchorElement;
  const clickLink = vi.spyOn(anchorPrototype, "click").mockImplementation(() => {});
  const saveAs = vi.fn();
  const saveFile = vi.fn();
  const release = makeRelease();
  const fetchRelease = vi.fn<(...args: unknown[]) => Promise<ReleaseResponse>>().mockResolvedValue(response(release));
  const widthDescriptor = Object.getOwnPropertyDescriptor(window, "innerWidth")!;
  let coarse = false;
  const matchMedia = vi.fn((_query: string) => ({ matches: coarse }));
  let openedDialog: OfferDialog | undefined;
  const dialog = vi.fn((value: OfferDialog | "close") => {
    if (value !== "close") openedDialog = value;
  });
  const jquery = vi.fn((_target: string | HTMLElement) => ({ dialog }));
  vi.stubGlobal("$", jquery);
  vi.stubGlobal("alertMessage", alertMessage);
  vi.stubGlobal("fetch", fetchRelease);
  vi.stubGlobal("matchMedia", matchMedia);
  vi.stubGlobal("pack", packModel);
  vi.stubGlobal("grid", gridModel);
  vi.stubGlobal("options", appOptions);
  vi.stubGlobal("saveAs", saveAs);
  vi.stubGlobal("showSaveFilePicker", saveFile);

  function setBrowser(browser: BrowserFixture, width = 1200, coarsePointer = false): void {
    vi.stubGlobal("navigator", { userAgent: "", ...browser });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
    coarse = coarsePointer;
  }
  setBrowser({ platform: "Win32" });

  return {
    fixture,
    alertElement,
    alertMessage,
    mapElement,
    noteElement,
    mapMarkup,
    noteMarkup,
    packModel,
    gridModel,
    appOptions,
    storageWrite,
    storageRemove,
    storageClear,
    openWindow,
    clickLink,
    saveAs,
    saveFile,
    release,
    fetchRelease,
    widthDescriptor,
    matchMedia,
    dialog,
    jquery,
    setBrowser,
    getDialog(): OfferDialog {
      if (!openedDialog) throw new Error("The desktop app dialog has not opened");
      return openedDialog;
    }
  };
}

let host: ReturnType<typeof createHost>;

beforeEach(() => {
  host = createHost();
});

afterEach(() => {
  try {
    // These tests render links but never activate downloads, installation or model writes.
    for (const args of host.fetchRelease.mock.calls) expect(args).toEqual([RELEASES_API]);
    expect(host.openWindow).not.toHaveBeenCalled();
    expect(host.clickLink).not.toHaveBeenCalled();
    expect(host.saveAs).not.toHaveBeenCalled();
    expect(host.saveFile).not.toHaveBeenCalled();
    expect(host.storageWrite).not.toHaveBeenCalled();
    expect(host.storageRemove).not.toHaveBeenCalled();
    expect(host.storageClear).not.toHaveBeenCalled();
    expect(localStorage.getItem("map")).toBe("Original English map data");
    expect(Reflect.get(globalThis, "pack")).toBe(host.packModel);
    expect(Reflect.get(globalThis, "grid")).toBe(host.gridModel);
    expect(Reflect.get(globalThis, "options")).toBe(host.appOptions);
    expect(host.packModel).toEqual({ name: "My English Map", cells: [{ id: 7, biome: 12 }] });
    expect(host.gridModel).toEqual({ seed: "Original-English-Seed", cells: [7] });
    expect(host.appOptions).toEqual({ mapName: "My English Map", note: "Keep my English note." });
    expect(document.getElementById("userMap")).toBe(host.mapElement);
    expect(document.getElementById("userNotes")).toBe(host.noteElement);
    expect(host.mapElement.outerHTML).toBe(host.mapMarkup);
    expect(host.noteElement.outerHTML).toBe(host.noteMarkup);
    expect(document.querySelector<HTMLInputElement>("#mapName")!.value).toBe("My English Map");
  } finally {
    Object.defineProperty(window, "innerWidth", host.widthDescriptor);
    host.fixture.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

function links(): HTMLAnchorElement[] {
  return Array.from(host.alertMessage.querySelectorAll<HTMLAnchorElement>("a"));
}

function primary(): HTMLAnchorElement | null {
  return host.alertMessage.querySelector<HTMLAnchorElement>("b a");
}

function expectPrimary(suffix: string, label: string): void {
  const asset = host.release.assets.find(asset => asset.name.endsWith(suffix))!;
  expect(primary()!.getAttribute("href")).toBe(asset.browser_download_url);
  expect(primary()!.textContent).toBe(`下载版本 ${VERSION}`);
  expect(primary()!.target).toBe("_blank");
  expect(primary()!.parentElement!.parentElement!.textContent).toContain(`根据系统信息推荐 ${label}，请核对系统与架构`);
  expect(host.alertMessage.textContent).toContain("其他系统：");
  expect(links()).toHaveLength(6);
}

function expectReleaseFallback(reason: string): void {
  expect(primary()).toBeNull();
  expect(host.alertMessage.textContent).toContain(reason);
  expect(links()).toHaveLength(1);
  expect(links()[0].textContent).toBe("GitHub 发布页");
  expect(links()[0].getAttribute("href")).toBe(RELEASES_PAGE);
  expect(links()[0].target).toBe("_blank");
  expect(host.alertMessage.textContent).not.toMatch(/尚未发布|没有桌面版|未发布桌面/);
}

// Shared-alert late results after close/replacement are an existing lifecycle risk, not exercised here.
describe("desktop app offer", () => {
  it("returns a promise and renders the Chinese dialog and loading state before the real fetch resolves", async () => {
    const pending = deferred<ReleaseResponse>();
    host.fetchRelease.mockReturnValueOnce(pending.promise);

    const completion = AppOffer.open();

    expect(completion).toBeInstanceOf(Promise);
    expect(host.jquery).toHaveBeenCalledExactlyOnceWith("#alert");
    expect(host.getDialog()).toEqual({
      resizable: false,
      title: "桌面应用",
      width: "30em",
      position: { my: "center", at: "center", of: window },
      buttons: { 关闭: expect.any(Function) }
    });
    expect(host.alertMessage.innerHTML).toBe("<p>正在检查最新版本…</p>");
    expect(host.fetchRelease).toHaveBeenCalledExactlyOnceWith(RELEASES_API);
    pending.resolve(response(host.release));
    await completion;
    expectPrimary("-win-x64.exe", "Windows");
  });

  it("starts release and architecture requests together and awaits both before replacing loading", async () => {
    const pendingRelease = deferred<ReleaseResponse>();
    const pendingArchitecture = deferred<{ architecture?: string }>();
    const getHighEntropyValues = vi.fn(() => pendingArchitecture.promise);
    host.setBrowser({ userAgentData: { platform: "Windows", getHighEntropyValues } });
    host.fetchRelease.mockReturnValueOnce(pendingRelease.promise);
    let settled = false;

    const completion = AppOffer.open().then(() => {
      settled = true;
    });
    expect(host.fetchRelease).toHaveBeenCalledExactlyOnceWith(RELEASES_API);
    expect(getHighEntropyValues).toHaveBeenCalledExactlyOnceWith(["architecture"]);
    pendingRelease.resolve(response(host.release));
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(host.alertMessage.textContent).toBe("正在检查最新版本…");
    pendingArchitecture.resolve({ architecture: "arm" });
    await completion;
    expectPrimary("-win-arm64.exe", "Windows（ARM 架构）");
  });

  it.each([
    {
      label: "explicit mobile data on a wide device",
      browser: { userAgentData: { mobile: true } },
      width: 1200,
      coarse: false
    },
    { label: "narrow coarse-pointer fallback", browser: {}, width: 599, coarse: true }
  ])("shows the handheld explanation with zero requests for $label", async ({ browser, width, coarse }) => {
    const device: BrowserFixture = browser;
    const getHighEntropyValues = vi.fn();
    host.setBrowser({ ...device, userAgentData: { ...device.userAgentData, getHighEntropyValues } }, width, coarse);
    await AppOffer.open();
    expect(host.alertMessage.textContent).toBe("桌面应用面向电脑，目前没有手机或平板版本。");
    expect(host.fetchRelease).not.toHaveBeenCalled();
    expect(getHighEntropyValues).not.toHaveBeenCalled();
    expect(links()).toHaveLength(0);
    if (device.userAgentData?.mobile) expect(host.matchMedia).not.toHaveBeenCalled();
    else expect(host.matchMedia).toHaveBeenCalledExactlyOnceWith("(pointer: coarse)");
  });

  it.each([
    { label: "narrow fine pointer", browser: { platform: "Win32" }, width: 599, coarse: false },
    { label: "600px coarse pointer", browser: { platform: "Win32" }, width: 600, coarse: true },
    {
      label: "explicit desktop overrides narrow coarse pointer",
      browser: { platform: "Win32", userAgentData: { mobile: false } },
      width: 320,
      coarse: true
    }
  ])("keeps desktop downloads for $label", async ({ browser, width, coarse }) => {
    const device: BrowserFixture = browser;
    host.setBrowser(device, width, coarse);
    await AppOffer.open();
    expectPrimary("-win-x64.exe", "Windows");
    expect(host.fetchRelease).toHaveBeenCalledExactlyOnceWith(RELEASES_API);
    if (device.userAgentData) expect(host.matchMedia).not.toHaveBeenCalled();
  });

  it.each([
    { architecture: undefined, suffix: "-win-x64.exe", label: "Windows" },
    { architecture: "x86", suffix: "-win-x64.exe", label: "Windows" },
    { architecture: "arm", suffix: "-win-arm64.exe", label: "Windows（ARM 架构）" },
    { architecture: "arm64", suffix: "-win-x64.exe", label: "Windows" }
  ])("retains Windows selection for architecture=$architecture", async ({ architecture, suffix, label }) => {
    const getHighEntropyValues = vi.fn().mockResolvedValue({ architecture });
    host.setBrowser({ userAgentData: { platform: "Windows", getHighEntropyValues } });
    await AppOffer.open();
    expect(getHighEntropyValues).toHaveBeenCalledExactlyOnceWith(["architecture"]);
    expectPrimary(suffix, label);
  });

  it("defaults a Mac without UA data to Apple silicon even when Safari reports Intel", async () => {
    host.setBrowser({ platform: "MacIntel", userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X) Safari" });
    await AppOffer.open();
    expectPrimary("-mac-arm64.dmg", "Mac（Apple silicon 芯片）");
  });

  it.each([
    { architecture: undefined, suffix: "-mac-x64.dmg", label: "Mac（Intel 芯片）" },
    { architecture: "x86", suffix: "-mac-x64.dmg", label: "Mac（Intel 芯片）" },
    { architecture: "arm", suffix: "-mac-arm64.dmg", label: "Mac（Apple silicon 芯片）" }
  ])("retains Mac UA architecture=$architecture selection", async ({ architecture, suffix, label }) => {
    const getHighEntropyValues = vi.fn().mockResolvedValue({ architecture });
    host.setBrowser({ userAgentData: { platform: "macOS", getHighEntropyValues } });
    await AppOffer.open();
    expectPrimary(suffix, label);
  });

  it("keeps the Intel Mac default when UA data exists without the optional entropy method", async () => {
    host.setBrowser({ platform: "MacIntel", userAgentData: { mobile: false } });
    await AppOffer.open();
    expectPrimary("-mac-x64.dmg", "Mac（Intel 芯片）");
  });

  it.each(["Linux x86_64", "X11", "CrOS"])(
    'recommends AppImage and preserves the Debian alternative for "%s"',
    async platform => {
      host.setBrowser({ platform });
      await AppOffer.open();
      expectPrimary("-linux-x86_64.AppImage", "Linux");
      const debian = links().find(link => link.textContent === "Debian 或 Ubuntu")!;
      expect(debian.getAttribute("href")).toBe(host.release.assets[5].browser_download_url);
    }
  );

  it("retains the existing Linux x86_64 recommendation even when UA data reports ARM", async () => {
    const getHighEntropyValues = vi.fn().mockResolvedValue({ architecture: "arm" });
    host.setBrowser({ userAgentData: { platform: "Linux", getHighEntropyValues } });
    await AppOffer.open();
    expectPrimary("-linux-x86_64.AppImage", "Linux");
  });

  it.each([
    { platform: "Windows", suffix: "-win-x64.exe", label: "Windows" },
    { platform: "macOS", suffix: "-mac-x64.dmg", label: "Mac（Intel 芯片）" },
    { platform: "Linux", suffix: "-linux-x86_64.AppImage", label: "Linux" }
  ])(
    "falls back without failing when the $platform UA entropy request rejects",
    async ({ platform, suffix, label }) => {
      const getHighEntropyValues = vi.fn().mockRejectedValue(new Error("UA permission denied"));
      host.setBrowser({ userAgentData: { platform, getHighEntropyValues } });
      await expect(AppOffer.open()).resolves.toBeUndefined();
      expectPrimary(suffix, label);
    }
  );

  it("uses the user agent string when both platform fields are absent", async () => {
    host.setBrowser({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" });
    await AppOffer.open();
    expectPrimary("-win-x64.exe", "Windows");
  });

  it("prefers UA-data platform over navigator.platform without changing the Mac default", async () => {
    host.setBrowser({ platform: "Win32", userAgentData: { platform: "macOS" } });
    await AppOffer.open();
    expectPrimary("-mac-x64.dmg", "Mac（Intel 芯片）");
  });

  it.each([
    { label: "unknown OS", browser: { platform: "FreeBSD" } },
    { label: "missing platform fields", browser: {} },
    {
      label: "empty UA platform keeps nullish semantics",
      browser: { platform: "Win32", userAgentData: { platform: "" } }
    }
  ])("lists all downloads without inventing a recommendation for $label", async ({ browser }) => {
    host.setBrowser(browser);
    await AppOffer.open();
    expect(primary()).toBeNull();
    expect(links().map(link => link.textContent)).toEqual(LABELS);
    expect(host.alertMessage.textContent).toContain("下载入口：");
    expect(host.alertMessage.textContent).not.toContain("根据系统信息推荐");
  });

  it.each(["HTTP", "network", "JSON", "invalid assets"])(
    "renders the release-page fallback after %s failure",
    async failure => {
      const reply = response(host.release, failure !== "HTTP");
      if (failure === "network") host.fetchRelease.mockRejectedValueOnce(new Error("Network unavailable"));
      else {
        if (failure === "JSON") reply.json.mockRejectedValueOnce(new SyntaxError("Invalid JSON"));
        if (failure === "invalid assets") reply.json.mockResolvedValueOnce({ tag_name: "v1.0.0", assets: null });
        host.fetchRelease.mockResolvedValueOnce(reply);
      }
      await expect(AppOffer.open()).resolves.toBeUndefined();
      expectReleaseFallback("暂时无法加载下载列表");
      if (failure === "HTTP") expect(reply.json).not.toHaveBeenCalled();
    }
  );

  it.each(["empty", "portable ZIP only", "unrelated suffix"])(
    "does not claim an existing release is unpublished when assets are %s",
    async assets => {
      if (assets === "empty") host.release.assets = [];
      else {
        host.release.assets = [
          {
            name: assets === "portable ZIP only" ? "HuanMeng-0.7.6-win-x64.zip" : "HuanMeng-linux-x86_64.appimage",
            browser_download_url: "https://downloads.example.test/Untranslated-English-asset.zip",
            size: 123456
          }
        ];
      }
      await AppOffer.open();
      expectReleaseFallback("该版本未提供此处可识别的安装包");
      expect(host.alertMessage.textContent).not.toContain("暂时无法加载");
    }
  );

  it("lists other matched systems when the recommended Windows artifact is missing", async () => {
    host.release.assets = host.release.assets.slice(1);
    await AppOffer.open();
    expect(primary()).toBeNull();
    expect(links()).toHaveLength(5);
    expect(links().map(link => link.textContent)).toEqual(LABELS.slice(1));
    expect(host.alertMessage.textContent).toContain("下载入口：");
    expect(host.alertMessage.textContent).not.toContain("该版本未提供");
  });

  it("keeps a primary-only release without inventing an alternatives section", async () => {
    host.release.assets = host.release.assets.slice(0, 1);
    await AppOffer.open();
    expect(primary()!.getAttribute("href")).toBe(host.release.assets[0].browser_download_url);
    expect(links()).toHaveLength(1);
    expect(host.alertMessage.textContent).not.toMatch(/其他系统|下载入口：|该版本未提供/);
  });

  it("renders exact remote asset URLs, targets, version and rounded size without rewriting user content", async () => {
    await AppOffer.open();
    expect(primary()!.textContent).toBe(`下载版本 ${VERSION}`);
    expect(primary()!.parentElement!.parentElement!.textContent).toContain("(43 MB)");
    expect(links().map(link => link.getAttribute("href"))).toEqual(
      host.release.assets.map(asset => asset.browser_download_url)
    );
    expect(links().every(link => link.target === "_blank" && !link.hasAttribute("download"))).toBe(true);
    expect(
      links()
        .slice(1)
        .map(link => link.textContent)
    ).toEqual(LABELS.slice(1));
    expect(host.release.tag_name).toBe(`v${VERSION}`);
    expect(host.release.assets[0].name).toBe(`HuanMeng-English-${VERSION}-win-x64.exe`);
    expect(host.release.assets[0].size).toBe(42.6 * 1024 * 1024);
  });

  it.each([
    { tag: "release-English-2026", version: "release-English-2026" },
    { tag: "V0.7.6", version: "V0.7.6" },
    { tag: 42, version: "42" }
  ])("preserves existing string conversion and lowercase-v-only stripping for $tag", async ({ tag, version }) => {
    host.release.tag_name = tag;
    await AppOffer.open();
    expect(primary()!.textContent).toBe(`下载版本 ${version}`);
    expect(host.release.tag_name).toBe(tag);
  });

  it("explains storage, migration and conditional offline, update and OS safety limits", async () => {
    await AppOffer.open();
    const text = host.alertMessage.textContent!;
    expect(text).toContain("电脑上的独立窗口程序");
    expect(text).toContain("更新方式和离线可用范围取决于安装包与发布配置");
    expect(text).toContain("联网功能仍需网络");
    expect(text).toContain("此处仅提供下载入口，不会启用自动安装");
    expect(text).toContain("请按浏览器提示保存，并参照发布页说明安装或运行");
    expect(text).toContain("桌面应用与此页面分别保存地图和设置");
    expect(host.alertMessage.querySelector("i")!.textContent).toBe(".map");
    expect(text).toContain("再在桌面应用中加载");
    expect(text).toContain("如果 Windows 或 macOS 显示安全提示");
    expect(text).toContain("请先核验下载来源与发布说明中的签名信息");
    expect(text).toContain("来源或签名无法确认时，请停止安装或运行");
    expect(text).not.toMatch(/More info|Run anyway|未知发布者|右键|自动安装更新|完整离线/);
  });

  it("requests the known release route once per deliberate opening rather than caching it", async () => {
    await AppOffer.open();
    await AppOffer.open();
    expect(host.fetchRelease.mock.calls).toEqual([[RELEASES_API], [RELEASES_API]]);
    expectPrimary("-win-x64.exe", "Windows");
  });

  it("calls the real close callback with the dialog element as this and no extra request", async () => {
    await AppOffer.open();
    host.getDialog().buttons.关闭.call(host.alertElement);
    expect(host.jquery).toHaveBeenLastCalledWith(host.alertElement);
    expect(host.dialog).toHaveBeenLastCalledWith("close");
    expect(host.dialog).toHaveBeenCalledTimes(2);
    expect(host.fetchRelease).toHaveBeenCalledExactlyOnceWith(RELEASES_API);
  });
});
