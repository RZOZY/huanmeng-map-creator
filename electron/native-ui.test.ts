import type { MenuItemConstructorOptions } from "electron";
import { describe, expect, it, vi } from "vitest";
import {
  createApplicationMenu,
  createContextMenu,
  createQuitDialog,
  createUpdateAvailableDialog,
  createUpdateErrorDialog,
  createUpdateReadyDialog
} from "./native-ui";

function describeMenu(items: MenuItemConstructorOptions[]): string[] {
  return items.flatMap(item => [
    item.type === "separator" ? "---" : `${item.role ?? "menu"}: ${item.label}`,
    ...(Array.isArray(item.submenu) ? describeMenu(item.submenu).map(label => `  ${label}`) : [])
  ]);
}

function submenu(item: MenuItemConstructorOptions): MenuItemConstructorOptions[] {
  if (!Array.isArray(item.submenu)) throw new Error("Expected a menu template");
  return item.submenu;
}

const actions = { openWiki: vi.fn(), openDiscord: vi.fn() };
const viewMenu = [
  "menu: 视图",
  "  resetZoom: 实际大小",
  "  zoomIn: 放大",
  "  zoomOut: 缩小",
  "  ---",
  "  togglefullscreen: 切换全屏",
  "  toggleDevTools: 切换开发者工具"
];

function expectNativeRoles(items: MenuItemConstructorOptions[]): void {
  for (const item of items) {
    expect(item.accelerator).toBeUndefined();
    if (item.role) expect(item.click).toBeUndefined();
    expect(["reload", "forceReload"]).not.toContain(item.role);
    if (Array.isArray(item.submenu)) expectNativeRoles(item.submenu);
  }
}

describe("native application menus", () => {
  it("labels every Windows/Linux entry and retains its original role", () => {
    const menu = createApplicationMenu(false, actions);
    expect(describeMenu(menu)).toEqual([
      "menu: 文件",
      "  quit: 退出",
      "editMenu: 编辑",
      "  undo: 撤销",
      "  redo: 重做",
      "  ---",
      "  cut: 剪切",
      "  copy: 复制",
      "  paste: 粘贴",
      "  delete: 删除",
      "  ---",
      "  selectAll: 全选",
      ...viewMenu,
      "windowMenu: 窗口",
      "  minimize: 最小化",
      "  zoom: 缩放窗口",
      "  close: 关闭",
      "help: 帮助",
      "  menu: 使用文档",
      "  menu: Discord 社区",
      "  ---",
      "  about: 关于 HuanMeng Map Creator"
    ]);
    expectNativeRoles(menu);
  });

  it("retains all macOS app, substitutions, speech and window roles with explicit labels", () => {
    const menu = createApplicationMenu(true, actions);
    expect(describeMenu(menu)).toEqual([
      "appMenu: HuanMeng Map Creator",
      "  about: 关于 HuanMeng Map Creator",
      "  ---",
      "  services: 服务",
      "  ---",
      "  hide: 隐藏 HuanMeng Map Creator",
      "  hideOthers: 隐藏其他应用",
      "  unhide: 显示全部",
      "  ---",
      "  quit: 退出 HuanMeng Map Creator",
      "editMenu: 编辑",
      "  undo: 撤销",
      "  redo: 重做",
      "  ---",
      "  cut: 剪切",
      "  copy: 复制",
      "  paste: 粘贴",
      "  pasteAndMatchStyle: 粘贴并匹配样式",
      "  delete: 删除",
      "  selectAll: 全选",
      "  ---",
      "  menu: 文本替换",
      "    showSubstitutions: 显示替换选项",
      "    ---",
      "    toggleSmartQuotes: 智能引号",
      "    toggleSmartDashes: 智能破折号",
      "    toggleTextReplacement: 文本替换",
      "  menu: 语音",
      "    startSpeaking: 开始朗读",
      "    stopSpeaking: 停止朗读",
      ...viewMenu,
      "windowMenu: 窗口",
      "  minimize: 最小化",
      "  zoom: 缩放窗口",
      "  ---",
      "  front: 全部置于前台",
      "help: 帮助",
      "  menu: 使用文档",
      "  menu: Discord 社区"
    ]);
    expectNativeRoles(menu);
  });

  it.each([false, true])("wires help callbacks without changing their destinations (macOS: %s)", isMac => {
    const menu = createApplicationMenu(isMac, actions);
    const help = submenu(menu[4]);
    expect(help[0].click).toBe(actions.openWiki);
    expect(help[1].click).toBe(actions.openDiscord);
  });
});

describe("native context menus", () => {
  it.each([
    {
      editable: true,
      selection: "",
      expected: ["cut: 剪切", "copy: 复制", "paste: 粘贴", "---", "menu: 检查元素"]
    },
    { editable: false, selection: "Map", expected: ["copy: 复制", "---", "menu: 检查元素"] },
    { editable: false, selection: "", expected: ["menu: 检查元素"] }
  ])("labels the editable=$editable, selection='$selection' menu", ({ editable, selection, expected }) => {
    const inspect = vi.fn();
    const menu = createContextMenu(editable, selection, inspect);
    expect(describeMenu(menu)).toEqual(expected);
    expect(menu.at(-1)?.click).toBe(inspect);
    expectNativeRoles(menu);
  });
});

describe("native dialogs", () => {
  it("keeps cancel as both the default and dismiss action for quitting", () => {
    expect(createQuitDialog()).toEqual({
      type: "question",
      buttons: ["退出", "取消"],
      defaultId: 1,
      cancelId: 1,
      title: "退出确认",
      message: "确定退出 HuanMeng Map Creator 吗？",
      detail: "退出前请先另存地图文件。尚未保存的更改可能丢失。"
    });
  });

  it.each([
    {
      canSelfInstall: true,
      buttons: ["下载", "稍后"],
      detail: "更新将在后台下载，您可以继续编辑地图。"
    },
    {
      canSelfInstall: false,
      buttons: ["打开下载页面", "稍后"],
      detail: "请下载新版本并覆盖安装当前版本。"
    }
  ])("labels the update offer (self install: $canSelfInstall)", ({ canSelfInstall, buttons, detail }) => {
    expect(createUpdateAvailableDialog("0.8.0-beta.1", canSelfInstall)).toEqual({
      type: "info",
      defaultId: 0,
      cancelId: 1,
      title: "发现新版本",
      message: "HuanMeng Map Creator 0.8.0-beta.1 已发布",
      buttons,
      detail
    });
  });

  it("preserves technical error details and offers a Chinese manual-download action", () => {
    const detail = "ERR_CONNECTION_RESET: https://example.com/latest.yml (C:\\App\\update.exe)";
    expect(createUpdateErrorDialog(new Error(detail))).toEqual({
      type: "warning",
      buttons: ["打开下载页面", "关闭"],
      defaultId: 0,
      cancelId: 1,
      title: "更新失败",
      message: "无法安装更新",
      detail: `${detail}\n\n您可以手动下载并安装新版本。`
    });
  });

  it("keeps deferred installation as the dismiss action and warns to save before restarting", () => {
    expect(createUpdateReadyDialog("0.8.0")).toEqual({
      type: "info",
      buttons: ["立即重启", "退出时安装"],
      defaultId: 0,
      cancelId: 1,
      title: "更新已就绪",
      message: "HuanMeng Map Creator 0.8.0 已准备好安装",
      detail: "请先保存地图再重启：应用将关闭以安装更新。"
    });
  });
});
