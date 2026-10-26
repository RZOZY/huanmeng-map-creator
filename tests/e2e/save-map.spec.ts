import { expect, test } from "@playwright/test";
import { waitForMap } from "./wait-for-map";

declare const Services: { Save: { prepareMapData: () => Promise<string> } };
declare const options: { map: { lore: { name: string } } };

declare global {
  interface Window {
    saveTest: {
      directory: FileSystemDirectoryHandle;
      handles: FileSystemFileHandle[];
      picks: number;
      cancel: boolean;
      activations: boolean[];
    };
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto("/?seed=save-picker&width=1280&height=720");
  await waitForMap(page);
  await page.evaluate(async () => {
    const directory = await navigator.storage.getDirectory();
    window.saveTest = { directory, handles: [], picks: 0, cancel: false, activations: [] };
    // Replace only the native dialog; the returned handles perform real browser file writes.
    Object.defineProperty(window, "showSaveFilePicker", {
      configurable: true,
      value: async () => {
        const state = window.saveTest;
        state.picks++;
        state.activations.push(navigator.userActivation.isActive);
        if (state.cancel) throw new DOMException("Cancelled", "AbortError");
        const handle = await directory.getFileHandle(`Chosen-${state.picks}.map`, { create: true });
        state.handles.push(handle);
        return handle;
      }
    });
  });
});

test("Ctrl+S reuses the chosen file and Ctrl+Shift+S switches to a separate copy", async ({ page }) => {
  const initial = await page.evaluate(() => Services.Save.prepareMapData());
  await page.keyboard.press("Control+s");
  await expect(page.locator("#tooltip")).toContainText("地图快照已保存至“Chosen-1.map”，保存期间的后续修改可能尚未保存");
  expect(await page.evaluate(async () => (await window.saveTest.handles[0].getFile()).text())).toBe(initial);

  const edited = await page.evaluate(async () => {
    options.map.lore.name = "Edited after saving";
    return Services.Save.prepareMapData();
  });
  await page.keyboard.press("Control+s");
  await expect
    .poll(() => page.evaluate(async () => (await window.saveTest.handles[0].getFile()).text()))
    .toBe(edited);
  expect(await page.evaluate(() => window.saveTest.picks)).toBe(1);

  await page.keyboard.press("Control+Shift+s");
  await expect(page.locator("#tooltip")).toContainText("地图快照已保存至“Chosen-2.map”，保存期间的后续修改可能尚未保存");
  const copy = await page.evaluate(async () => {
    options.map.lore.name = "Edited copy";
    return Services.Save.prepareMapData();
  });
  await page.keyboard.press("Control+s");
  await expect
    .poll(() => page.evaluate(async () => (await window.saveTest.handles[1].getFile()).text()))
    .toBe(copy);
  expect(await page.evaluate(async () => (await window.saveTest.handles[0].getFile()).text())).toBe(edited);
  expect(await page.evaluate(() => window.saveTest.picks)).toBe(2);
  expect(await page.evaluate(() => window.saveTest.activations)).toEqual([true, true]);
});

test("cancelling Save As retains the destination and loading a map clears it", async ({ page }) => {
  await page.keyboard.press("Control+s");
  await expect(page.locator("#tooltip")).toContainText("地图快照已保存至“Chosen-1.map”，保存期间的后续修改可能尚未保存");
  await page.evaluate(() => {
    window.saveTest.cancel = true;
    document.getElementById("tooltip")!.textContent = "";
  });
  await page.keyboard.press("Control+Shift+s");
  await expect.poll(() => page.evaluate(() => window.saveTest.picks)).toBe(2);
  await expect(page.locator("#tooltip")).not.toContainText(/地图快照已保存至|已发起地图下载/);
  await expect(page.getByText("保存失败", { exact: true })).not.toBeVisible();

  await page.evaluate(() => {
    window.saveTest.cancel = false;
  });
  await page.keyboard.press("Control+s");
  await expect(page.locator("#tooltip")).toContainText("地图快照已保存至“Chosen-1.map”，保存期间的后续修改可能尚未保存");
  expect(await page.evaluate(() => window.saveTest.picks)).toBe(2);

  const data = await page.evaluate(() => Services.Save.prepareMapData());
  await page.locator("#mapToLoad").setInputFiles({
    name: "Reloaded.map",
    mimeType: "text/plain",
    buffer: Buffer.from(data)
  });
  await expect(page.locator("#tooltip")).toContainText("Map is successfully loaded");
  await page.keyboard.press("Control+s");
  await expect(page.locator("#tooltip")).toContainText("地图快照已保存至“Chosen-3.map”，保存期间的后续修改可能尚未保存");
  expect(await page.evaluate(() => window.saveTest.picks)).toBe(3);
});
