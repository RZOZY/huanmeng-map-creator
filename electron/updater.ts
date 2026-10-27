// Self-update is enabled only for packaged builds with an update configuration.

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { MessageBoxOptions } from "electron";
import { app, BrowserWindow, dialog, shell } from "electron";
import { autoUpdater } from "electron-updater";
import { createUpdateAvailableDialog, createUpdateErrorDialog, createUpdateReadyDialog } from "./native-ui";

const RELEASES_URL = "https://github.com/RZOZY/huanmeng-map-creator/releases/latest";
const FIRST_CHECK_DELAY = 30_000;
const CHECK_INTERVAL = 6 * 60 * 60 * 1000;
const CAN_SELF_INSTALL = process.platform === "win32" || Boolean(process.env.APPIMAGE);

let reportErrors = false;
function ask(options: MessageBoxOptions): Promise<number> {
  const window = BrowserWindow.getAllWindows().find(candidate => !candidate.isDestroyed());
  const result = window ? dialog.showMessageBox(window, options) : dialog.showMessageBox(options);
  return result.then(({ response }) => response);
}

function onError(error: Error): void {
  console.error("Update failed:", error);
  if (!reportErrors) return;

  ask(createUpdateErrorDialog(error)).then(response => {
    if (response === 0) shell.openExternal(RELEASES_URL);
  });
}

/**
 * @param allowClose closes the window without the quit confirmation, so the installer can restart the app
 */
export function initUpdater(allowClose: () => void): void {
  if (!app.isPackaged || !existsSync(join(process.resourcesPath, "app-update.yml"))) return;

  autoUpdater.autoDownload = false; // downloading is the user's call, the installers are large
  autoUpdater.on("error", onError);

  autoUpdater.on("update-available", ({ version }) => {
    ask(createUpdateAvailableDialog(version, CAN_SELF_INSTALL)).then(response => {
      if (response !== 0) return;
      if (!CAN_SELF_INSTALL) {
        shell.openExternal(RELEASES_URL);
        return;
      }
      reportErrors = true;
      autoUpdater.downloadUpdate();
    });
  });

  autoUpdater.on("update-downloaded", ({ version }) => {
    ask(createUpdateReadyDialog(version)).then(response => {
      if (response !== 0) return; // autoInstallOnAppQuit installs it on the next exit
      allowClose();
      autoUpdater.quitAndInstall();
    });
  });

  const check = () => {
    reportErrors = false; // a background check is silent again, whatever the previous attempt did
    autoUpdater.checkForUpdates().catch(() => {}); // the "error" event already reports it
  };

  setTimeout(check, FIRST_CHECK_DELAY);
  setInterval(check, CHECK_INTERVAL);
}
