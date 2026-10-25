import type { MessageBoxOptions } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUpdateAvailableDialog, createUpdateErrorDialog, createUpdateReadyDialog } from "./native-ui";

const mocks = vi.hoisted(() => {
  const listeners = new Map<string, (payload: unknown) => void>();
  return {
    listeners,
    app: { isPackaged: true },
    windows: [] as { isDestroyed: () => boolean }[],
    showMessageBox:
      vi.fn<(...args: [MessageBoxOptions] | [unknown, MessageBoxOptions]) => Promise<{ response: number }>>(),
    openExternal: vi.fn(),
    updater: {
      autoDownload: true,
      on: vi.fn((event: string, listener: (payload: unknown) => void) => listeners.set(event, listener)),
      downloadUpdate: vi.fn<() => Promise<string[]>>(),
      checkForUpdates: vi.fn<() => Promise<null>>(),
      quitAndInstall: vi.fn()
    }
  };
});

vi.mock("electron", () => ({
  app: mocks.app,
  BrowserWindow: { getAllWindows: () => mocks.windows },
  dialog: { showMessageBox: mocks.showMessageBox },
  shell: { openExternal: mocks.openExternal }
}));
vi.mock("electron-updater", () => ({ autoUpdater: mocks.updater }));

async function loadUpdater(platform: NodeJS.Platform = "win32", appImage = "") {
  vi.stubGlobal("process", { ...process, platform, env: { ...process.env, APPIMAGE: appImage } });
  try {
    return await import("./updater");
  } finally {
    vi.unstubAllGlobals();
  }
}

async function emit(event: string, payload: Error | { version: string }): Promise<void> {
  const listener = mocks.listeners.get(event);
  if (!listener) throw new Error(`Missing updater listener: ${event}`);
  listener(payload);
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  vi.clearAllMocks();
  mocks.listeners.clear();
  mocks.windows = [];
  mocks.app.isPackaged = true;
  mocks.updater.autoDownload = true;
  mocks.updater.checkForUpdates.mockResolvedValue(null);
  mocks.updater.downloadUpdate.mockResolvedValue([]);
  mocks.showMessageBox.mockResolvedValue({ response: 1 });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("native updater dialogs", () => {
  it("does not register updates or timers for development builds", async () => {
    mocks.app.isPackaged = false;
    const { initUpdater } = await loadUpdater();
    initUpdater(vi.fn());
    expect(mocks.updater.on).not.toHaveBeenCalled();
    expect(mocks.showMessageBox).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps scheduled background check errors silent", async () => {
    const { initUpdater } = await loadUpdater();
    initUpdater(vi.fn());
    expect(mocks.updater.autoDownload).toBe(false);
    expect([...mocks.listeners.keys()]).toEqual(["error", "update-available", "update-downloaded"]);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(mocks.updater.checkForUpdates).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.updater.checkForUpdates).toHaveBeenCalledTimes(1);
    await emit("error", new Error("ERR_CONNECTION_RESET"));
    expect(mocks.showMessageBox).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000 - 30_000);
    expect(mocks.updater.checkForUpdates).toHaveBeenCalledTimes(2);
  });

  it("passes the Chinese download prompt to the first live owner and honors Later", async () => {
    const destroyed = { isDestroyed: () => true };
    const window = { isDestroyed: () => false };
    mocks.windows = [destroyed, window];
    const { initUpdater } = await loadUpdater();
    initUpdater(vi.fn());
    await emit("update-available", { version: "0.8.0" });
    expect(mocks.showMessageBox).toHaveBeenCalledExactlyOnceWith(window, createUpdateAvailableDialog("0.8.0", true));
    expect(mocks.updater.downloadUpdate).not.toHaveBeenCalled();
    expect(mocks.openExternal).not.toHaveBeenCalled();
  });

  it.each([0, 1])("shows the Chinese download failure and honors response %s without a window", async response => {
    mocks.windows = [{ isDestroyed: () => true }];
    const { initUpdater } = await loadUpdater();
    initUpdater(vi.fn());
    mocks.showMessageBox.mockResolvedValueOnce({ response: 0 });
    await emit("update-available", { version: "0.8.0" });
    expect(mocks.updater.downloadUpdate).toHaveBeenCalledTimes(1);
    mocks.showMessageBox.mockResolvedValueOnce({ response });
    const error = new Error("ENOENT C:\\App\\update.exe");
    await emit("error", error);
    expect(mocks.showMessageBox).toHaveBeenLastCalledWith(createUpdateErrorDialog(error));
    if (response === 0) {
      expect(mocks.openExternal).toHaveBeenCalledExactlyOnceWith(
        "https://github.com/Azgaar/Fantasy-Map-Generator/releases/latest"
      );
    } else {
      expect(mocks.openExternal).not.toHaveBeenCalled();
    }
  });

  it("makes later background errors silent again after a user-started download", async () => {
    const { initUpdater } = await loadUpdater();
    initUpdater(vi.fn());
    mocks.showMessageBox.mockResolvedValueOnce({ response: 0 });
    await emit("update-available", { version: "0.8.0" });
    expect(mocks.updater.downloadUpdate).toHaveBeenCalledTimes(1);
    mocks.showMessageBox.mockClear();
    await vi.advanceTimersByTimeAsync(30_000);
    await emit("error", new Error("offline"));
    expect(mocks.showMessageBox).not.toHaveBeenCalled();
  });

  it.each(["darwin", "linux"] as const)("offers manual downloads on %s and honors both choices", async platform => {
    const { initUpdater } = await loadUpdater(platform);
    initUpdater(vi.fn());
    await emit("update-available", { version: "0.8.0" });
    expect(mocks.showMessageBox).toHaveBeenLastCalledWith(createUpdateAvailableDialog("0.8.0", false));
    expect(mocks.openExternal).not.toHaveBeenCalled();
    mocks.showMessageBox.mockResolvedValueOnce({ response: 0 });
    await emit("update-available", { version: "0.8.0" });
    expect(mocks.openExternal).toHaveBeenCalledExactlyOnceWith(
      "https://github.com/Azgaar/Fantasy-Map-Generator/releases/latest"
    );
    expect(mocks.updater.downloadUpdate).not.toHaveBeenCalled();
  });

  it("retains self-install for Linux AppImage builds", async () => {
    const { initUpdater } = await loadUpdater("linux", "/opt/HuanMeng.AppImage");
    initUpdater(vi.fn());
    mocks.showMessageBox.mockResolvedValueOnce({ response: 0 });
    await emit("update-available", { version: "0.8.0" });
    expect(mocks.showMessageBox).toHaveBeenLastCalledWith(createUpdateAvailableDialog("0.8.0", true));
    expect(mocks.updater.downloadUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.openExternal).not.toHaveBeenCalled();
  });

  it.each([0, 1])("uses the Chinese ready dialog and honors restart response %s", async response => {
    const { initUpdater } = await loadUpdater();
    const allowClose = vi.fn();
    initUpdater(allowClose);
    mocks.showMessageBox.mockResolvedValueOnce({ response });
    await emit("update-downloaded", { version: "0.8.0" });
    expect(mocks.showMessageBox).toHaveBeenCalledExactlyOnceWith(createUpdateReadyDialog("0.8.0"));
    if (response === 0) {
      expect(allowClose).toHaveBeenCalledTimes(1);
      expect(mocks.updater.quitAndInstall).toHaveBeenCalledTimes(1);
      expect(allowClose.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.updater.quitAndInstall.mock.invocationCallOrder[0]
      );
    } else {
      expect(allowClose).not.toHaveBeenCalled();
      expect(mocks.updater.quitAndInstall).not.toHaveBeenCalled();
    }
  });
});
