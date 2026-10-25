import type { MenuItemConstructorOptions, MessageBoxOptions } from "electron";

const PRODUCT_NAME = "HuanMeng Map Creator";

interface HelpActions {
  openWiki: () => void;
  openDiscord: () => void;
}

// Explicit labels keep native menus Chinese without replacing Electron's platform roles or shortcuts.
export function createApplicationMenu(isMac: boolean, actions: HelpActions): MenuItemConstructorOptions[] {
  return [
    isMac
      ? {
          role: "appMenu",
          label: PRODUCT_NAME,
          submenu: [
            { role: "about", label: `关于 ${PRODUCT_NAME}` },
            { type: "separator" },
            { role: "services", label: "服务" },
            { type: "separator" },
            { role: "hide", label: `隐藏 ${PRODUCT_NAME}` },
            { role: "hideOthers", label: "隐藏其他应用" },
            { role: "unhide", label: "显示全部" },
            { type: "separator" },
            { role: "quit", label: `退出 ${PRODUCT_NAME}` }
          ]
        }
      : { label: "文件", submenu: [{ role: "quit", label: "退出" }] },
    {
      role: "editMenu",
      label: "编辑",
      submenu: [
        { role: "undo", label: "撤销" },
        { role: "redo", label: "重做" },
        { type: "separator" },
        { role: "cut", label: "剪切" },
        { role: "copy", label: "复制" },
        { role: "paste", label: "粘贴" },
        ...(isMac
          ? ([
              { role: "pasteAndMatchStyle", label: "粘贴并匹配样式" },
              { role: "delete", label: "删除" },
              { role: "selectAll", label: "全选" },
              { type: "separator" },
              {
                label: "文本替换",
                submenu: [
                  { role: "showSubstitutions", label: "显示替换选项" },
                  { type: "separator" },
                  { role: "toggleSmartQuotes", label: "智能引号" },
                  { role: "toggleSmartDashes", label: "智能破折号" },
                  { role: "toggleTextReplacement", label: "文本替换" }
                ]
              },
              {
                label: "语音",
                submenu: [
                  { role: "startSpeaking", label: "开始朗读" },
                  { role: "stopSpeaking", label: "停止朗读" }
                ]
              }
            ] satisfies MenuItemConstructorOptions[])
          : ([
              { role: "delete", label: "删除" },
              { type: "separator" },
              { role: "selectAll", label: "全选" }
            ] satisfies MenuItemConstructorOptions[]))
      ]
    },
    {
      label: "视图",
      submenu: [
        { role: "resetZoom", label: "实际大小" },
        { role: "zoomIn", label: "放大" },
        { role: "zoomOut", label: "缩小" },
        { type: "separator" },
        { role: "togglefullscreen", label: "切换全屏" },
        { role: "toggleDevTools", label: "切换开发者工具" }
      ]
    },
    {
      role: "windowMenu",
      label: "窗口",
      submenu: [
        { role: "minimize", label: "最小化" },
        { role: "zoom", label: "缩放窗口" },
        ...(isMac
          ? ([{ type: "separator" }, { role: "front", label: "全部置于前台" }] satisfies MenuItemConstructorOptions[])
          : ([{ role: "close", label: "关闭" }] satisfies MenuItemConstructorOptions[]))
      ]
    },
    {
      role: "help",
      label: "帮助",
      submenu: [
        { label: "使用文档", click: actions.openWiki },
        { label: "Discord 社区", click: actions.openDiscord },
        ...(isMac
          ? []
          : ([
              { type: "separator" },
              { role: "about", label: `关于 ${PRODUCT_NAME}` }
            ] satisfies MenuItemConstructorOptions[]))
      ]
    }
  ];
}

export function createContextMenu(
  isEditable: boolean,
  selectionText: string,
  inspect: () => void
): MenuItemConstructorOptions[] {
  const template: MenuItemConstructorOptions[] = [];
  if (isEditable) {
    template.push(
      { role: "cut", label: "剪切" },
      { role: "copy", label: "复制" },
      { role: "paste", label: "粘贴" },
      { type: "separator" }
    );
  } else if (selectionText) {
    template.push({ role: "copy", label: "复制" }, { type: "separator" });
  }
  template.push({ label: "检查元素", click: inspect });
  return template;
}

export function createQuitDialog(): MessageBoxOptions {
  return {
    type: "question",
    buttons: ["退出", "取消"],
    defaultId: 1,
    cancelId: 1,
    title: "退出确认",
    message: `确定退出 ${PRODUCT_NAME} 吗？`,
    detail: "退出前请先另存地图文件。尚未保存的更改可能丢失。"
  };
}

export function createUpdateErrorDialog(error: Error): MessageBoxOptions {
  return {
    type: "warning",
    buttons: ["打开下载页面", "关闭"],
    defaultId: 0,
    cancelId: 1,
    title: "更新失败",
    message: "无法安装更新",
    detail: `${error.message}\n\n您可以手动下载并安装新版本。`
  };
}

export function createUpdateAvailableDialog(version: string, canSelfInstall: boolean): MessageBoxOptions {
  return {
    type: "info",
    defaultId: 0,
    cancelId: 1,
    title: "发现新版本",
    message: `${PRODUCT_NAME} ${version} 已发布`,
    buttons: canSelfInstall ? ["下载", "稍后"] : ["打开下载页面", "稍后"],
    detail: canSelfInstall ? "更新将在后台下载，您可以继续编辑地图。" : "请下载新版本并覆盖安装当前版本。"
  };
}

export function createUpdateReadyDialog(version: string): MessageBoxOptions {
  return {
    type: "info",
    buttons: ["立即重启", "退出时安装"],
    defaultId: 0,
    cancelId: 1,
    title: "更新已就绪",
    message: `${PRODUCT_NAME} ${version} 已准备好安装`,
    detail: "请先保存地图再重启：应用将关闭以安装更新。"
  };
}
