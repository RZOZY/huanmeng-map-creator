/**
 * 版本约定（HuanMeng Map Creator）
 * ------------------------------
 * 这里有两个版本号，用途完全不同，不要合并：
 *
 * 1. VERSION —— 产品自己的版本号（语义化 major.minor.patch）。只用于界面展示、"已更新"提示
 *    与桌面端更新检查。改动产品功能就抬高它。
 *    VERSION 是唯一真源：提交钩子会把它复制到 package.json / package-lock.json。
 *
 * 2. MAP_FORMAT_VERSION —— .map 存档格式的版本，记录"这份存档兼容到哪一代格式"。保存
 *    （save.ts、export-json.ts）、加载（load.ts）以及 services/io/auto-update.ts 的迁移判断
 *    都以它为准。**只有真正改动 .map 结构时才抬高它，并同时补一条迁移。**
 *    踩过的坑：产品版本从 1.154.0 降到 0.6.0 时若两者还绑在一起，旧存档会被判成
 *    "来自更新版本"而直接拒绝加载。
 *
 * 面向终端用户的变化写进下面的 latestPublicChanges。
 */

import { dialogState } from "@/components/dialog/state";
import { Pins } from "@/components/pins";
import { tip } from "@/components/tooltips";
import { isElectron } from "./platform";

export const VERSION = "0.7.5";

/** .map 存档格式版本：与产品版本无关，改动存档结构时才抬（现在是兼容上游 1.154.0 的那一代） */
export const MAP_FORMAT_VERSION = "1.154.0";

// new changes on top
const latestPublicChanges = [
  "地球仪改为矢量球面：极点不再被挤成放射状花瓣，±180° 经线不再有接缝",
  "地球仪按国家/生物群系逐单元上色，区域地图自动补一张海洋底球",
  "存档格式保持与上一版兼容，旧地图可直接打开并自动升级"
];

export function parseMapVersion(version: string): string {
  let [major, minor, patch] = version.split(".");

  if (patch === undefined) {
    // e.g. 1.732
    const compactVersion = minor!;
    minor = compactVersion.slice(0, 2);
    patch = compactVersion.slice(2);
  }

  // e.g. 0.7b
  const majorN = parseInt(major!, 10) || 0;
  const minorN = parseInt(minor, 10) || 0;
  const patchN = parseInt(patch, 10) || 0;

  return `${majorN}.${minorN}.${patchN}`;
}

export function isValidVersion(versionString: string | null | undefined): boolean {
  if (!versionString) return false;
  const [major, minor, patch] = versionString.split(".");
  return !Number.isNaN(Number(major)) && !Number.isNaN(Number(minor)) && !Number.isNaN(Number(patch));
}

export type VersionComparison = { isEqual: boolean; isNewer: boolean; isOlder: boolean };

export function compareVersions(
  version1: string | null | undefined,
  version2: string | null | undefined,
  options: { major?: boolean; minor?: boolean; patch?: boolean } = { major: true, minor: true, patch: true }
): VersionComparison {
  if (!isValidVersion(version1) || !isValidVersion(version2)) return { isEqual: false, isNewer: false, isOlder: false };

  let [major1, minor1, patch1] = version1!.split(".").map(Number) as [number, number, number];
  let [major2, minor2, patch2] = version2!.split(".").map(Number) as [number, number, number];

  if (!options.major) major1 = major2 = 0;
  if (!options.minor) minor1 = minor2 = 0;
  if (!options.patch) patch1 = patch2 = 0;

  const isEqual = major1 === major2 && minor1 === minor2 && patch1 === patch2;
  const isNewer = major1 > major2 || (major1 === major2 && (minor1 > minor2 || (minor1 === minor2 && patch1 > patch2)));
  const isOlder = major1 < major2 || (major1 === major2 && (minor1 < minor2 || (minor1 === minor2 && patch1 < patch2)));

  return { isEqual, isNewer, isOlder };
}

export async function clearCache(): Promise<void> {
  if (!isElectron()) {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map(cacheName => caches.delete(cacheName)));

    const registrations = (await navigator.serviceWorker?.getRegistrations()) ?? [];
    await Promise.all(registrations.map(registration => registration.unregister()));
  }

  location.reload();
}

export const ARROW_TIP_KEY = "fmg-disable-click-arrow-tooltip";

export async function cleanupData(): Promise<void> {
  localStorage.clear();
  dialogState.clear();
  localStorage.setItem("version", VERSION);

  Options.reset();
  Pins.clearAll();
  localStorage.setItem(ARROW_TIP_KEY, "true");
  await clearCache();
}

function showUpdateWindow(storedVersion: string | null): void {
  localStorage.setItem("version", VERSION);

  const repository = "https://github.com/RZOZY/humeng-map-generator";

  alertMessage.innerHTML = /* html */ `HuanMeng Map Creator is updated up to version <strong>${VERSION}</strong>. Save files stay compatible and are auto-upgraded on load.
    ${storedVersion ? "<span>In case of errors reload the page to update the code.</span>" : ""}

    <ul>
      <strong>Latest changes:</strong>
      ${latestPublicChanges.map(change => `<li>${change}</li>`).join("")}
    </ul>

    ${isElectron() ? "" : `<p>Also available as a <a href="#" onclick="window.Services.AppOffer.open(); return false">desktop app</a> that works offline.</p>`}

    <p>Source and bug reports: <a href="${repository}" target="_blank">${repository}</a></p>`;

  $("#alert").dialog({
    resizable: false,
    title: "HuanMeng Map Creator update",
    width: "28em",
    position: { my: "center center-4em", at: "center", of: "svg" },
    buttons: {
      "Clear cache": () => clearCache(),
      "Don't show again": function (this: HTMLElement) {
        $(this).dialog("close");
      }
    }
  });
}

function announceVersion(): void {
  if (parseMapVersion(VERSION) !== VERSION) alert("versioning: Invalid format or parsing function");

  document.title += ` v${VERSION}`;
  const loadingScreenVersion = document.getElementById("versionText");
  if (loadingScreenVersion) loadingScreenVersion.innerText = `v${VERSION}`;

  const storedVersion = localStorage.getItem("version");
  if (!storedVersion) {
    setTimeout(() => showUpdateWindow(null), 6000);
    return;
  }

  if (compareVersions(storedVersion, VERSION, { major: true, minor: true, patch: false }).isOlder) {
    setTimeout(() => showUpdateWindow(storedVersion), 6000);
  } else if (compareVersions(storedVersion, VERSION).isOlder) {
    localStorage.setItem("version", VERSION);
    tip(`Updated to v${VERSION}. Reload the page if you get errors`, true, "success", 6000);
  }
}

announceVersion();

declare global {
  // biome-ignore lint/suspicious/noRedeclare: exposed on window for legacy JS
  var VERSION: string;
  // biome-ignore lint/suspicious/noRedeclare: exposed on window for legacy JS
  var cleanupData: () => Promise<void>;
}

// temp legacy compatibility
window.VERSION = VERSION;
window.cleanupData = cleanupData;
