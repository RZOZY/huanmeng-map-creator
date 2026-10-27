// The Desktop App dialog: what the app is and which file this visitor needs
import { isMobile } from "./platform";

const RELEASES_API = "https://api.github.com/repos/RZOZY/huanmeng-map-creator/releases/latest";
const RELEASES_PAGE = "https://github.com/RZOZY/huanmeng-map-creator/releases/latest";

type Os = "windows" | "mac" | "linux";
type Asset = { name: string; browser_download_url: string; size: number };
type Release = { version: string; assets: Asset[] };
type NavigatorWithAgentData = Navigator & {
  userAgentData?: {
    mobile?: boolean;
    platform?: string;
    getHighEntropyValues?: (hints: string[]) => Promise<{ architecture?: string }>;
  };
};

/** Recognized installer suffixes; retain each format's architecture spelling. */
const DOWNLOADS: { os: Os; label: string; suffix: string }[] = [
  { os: "windows", label: "Windows", suffix: "-win-x64.exe" },
  { os: "windows", label: "Windows（ARM 架构）", suffix: "-win-arm64.exe" },
  { os: "mac", label: "Mac（Apple silicon 芯片）", suffix: "-mac-arm64.dmg" },
  { os: "mac", label: "Mac（Intel 芯片）", suffix: "-mac-x64.dmg" },
  { os: "linux", label: "Linux", suffix: "-linux-x86_64.AppImage" },
  { os: "linux", label: "Debian 或 Ubuntu", suffix: "-linux-amd64.deb" }
];

const INTRO = /* html */ `<p>桌面应用将地图生成器打包为电脑上的独立窗口程序。
  更新方式和离线可用范围取决于安装包与发布配置，联网功能仍需网络；此处仅提供下载入口，不会启用自动安装。</p>`;

async function open(): Promise<void> {
  $("#alert").dialog({
    resizable: false,
    title: "桌面应用",
    width: "30em",
    position: { my: "center", at: "center", of: window },
    buttons: {
      关闭: function (this: HTMLElement) {
        $(this).dialog("close");
      }
    }
  });

  alertMessage.innerHTML = "<p>正在检查最新版本…</p>";
  alertMessage.innerHTML = await renderOffer();
}

/** A narrow desktop window is not a phone: ask the device before trusting the viewport width */
function isHandheld(): boolean {
  const mobile = (navigator as NavigatorWithAgentData).userAgentData?.mobile;
  return mobile ?? (isMobile() && matchMedia("(pointer: coarse)").matches);
}

/** Which file this visitor needs, so that nobody has to know what an architecture is */
async function detectTarget(): Promise<string | undefined> {
  const agent = (navigator as NavigatorWithAgentData).userAgentData;
  const signature = `${agent?.platform ?? navigator.platform ?? ""} ${navigator.userAgent}`;

  const os: Os | undefined = /win/i.test(signature)
    ? "windows"
    : /mac/i.test(signature)
      ? "mac"
      : /linux|x11|cros/i.test(signature)
        ? "linux"
        : undefined;
  if (!os) return undefined;

  let arm = false;
  try {
    const { architecture } = (await agent?.getHighEntropyValues?.(["architecture"])) ?? {};
    arm = architecture === "arm";
  } catch {
    // Chromium-only API, other browsers fall back to the defaults below
  }
  // Safari reports Intel even on Apple silicon, so an undetectable Mac gets the ARM build, the common one since 2020
  if (os === "mac" && !agent) arm = true;

  if (os === "windows") return arm ? "-win-arm64.exe" : "-win-x64.exe";
  if (os === "mac") return arm ? "-mac-arm64.dmg" : "-mac-x64.dmg";
  return "-linux-x86_64.AppImage";
}

/** Opening the dialog is a deliberate, one-off action, so it always asks GitHub for the current release */
async function loadRelease(): Promise<Release | undefined> {
  try {
    const response = await fetch(RELEASES_API);
    if (!response.ok) return undefined;

    const { tag_name, assets } = await response.json();
    return {
      version: String(tag_name).replace(/^v/, ""),
      assets: assets.map(({ name, browser_download_url, size }: Asset) => ({ name, browser_download_url, size }))
    };
  } catch {
    return undefined;
  }
}

function renderDownloads(release: Release, target: string | undefined): string {
  const find = (suffix: string) => release.assets.find(({ name }) => name.endsWith(suffix));
  const primary = target ? find(target) : undefined;
  const primaryLabel = DOWNLOADS.find(({ suffix }) => suffix === target)?.label;

  const others = DOWNLOADS.filter(({ suffix }) => suffix !== target)
    .map(({ label, suffix }) => ({ label, asset: find(suffix) }))
    .filter(({ asset }) => asset)
    .map(({ label, asset }) => `<a href="${asset!.browser_download_url}" target="_blank">${label}</a>`)
    .join(" &middot; ");
  if (!primary && !others) return "";

  const main = primary
    ? /* html */ `<p>根据系统信息推荐 ${primaryLabel}，请核对系统与架构：
        <b><a href="${primary.browser_download_url}" target="_blank">下载版本 ${release.version}</a></b>
        (${Math.round(primary.size / 1024 / 1024)} MB)。请按浏览器提示保存，并参照发布页说明安装或运行。</p>`
    : "";

  const rest = others ? `<p>${primary ? "其他系统" : "下载入口"}：${others}。</p>` : "";
  return `${main}${rest}`;
}

async function renderOffer(): Promise<string> {
  if (isHandheld()) return "<p>桌面应用面向电脑，目前没有手机或平板版本。</p>";

  const [release, target] = await Promise.all([loadRelease(), detectTarget()]);
  const downloads = release ? renderDownloads(release, target) : "";

  if (!downloads) {
    const reason = release ? "该版本未提供此处可识别的安装包" : "暂时无法加载下载列表";
    return `<span>${reason}，请到 <a href="${RELEASES_PAGE}" target="_blank">GitHub 发布页</a> 查看已发布文件。</span>`;
  }

  return /* html */ `${INTRO}${downloads}
    <p>桌面应用与此页面分别保存地图和设置，页面中的内容不会自动出现在应用中。
    要迁移地图，请先保存为 <i>.map</i> 文件，再在桌面应用中加载。</p>
    <p>如果 Windows 或 macOS 显示安全提示，请先核验下载来源与发布说明中的签名信息；
    来源或签名无法确认时，请停止安装或运行。</p>`;
}

export const AppOffer = { open };
