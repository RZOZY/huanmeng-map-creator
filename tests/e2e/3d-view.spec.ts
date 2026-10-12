import { test, expect } from "@playwright/test";
import { waitForMap } from "./wait-for-map";

// software WebGL (SwiftShader) requires an explicit opt-in in recent Chromium. Overriding
// launchOptions replaces the config's, so the CHROMIUM_PATH escape hatch has to ride along here too
test.use({
  launchOptions: {
    args: ["--enable-unsafe-swiftshader"],
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
  }
});

test.describe("3D view with eroded terrain", () => {
  // map generation + 3D view + software-WebGL bake can be slow under full-suite load
  test.setTimeout(180_000);

  test("bakes erosion detail and renders without errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(`pageerror: ${error.message}`));

    await page.goto("/");
    await waitForMap(page);

    const hasWebGL = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
    });
    test.skip(!hasWebGL, "WebGL is not available in this environment");

    // enter the 3D mesh view through the same entry point the UI menu uses
    await page.evaluate(() => (window as any).Controllers.View3d.open("viewMesh"));
    await page.waitForSelector("#canvas3d", { state: "attached", timeout: 60000 });
    await page.waitForFunction(async () => (await (window as any).Controllers.View3d.isOn()) === true, {
      timeout: 60000
    });

    // enable eroded terrain via the settings checkbox (dialog opens with the view)
    await page.waitForSelector("#options3dErosion", { state: "attached" });
    await page.evaluate(() => (document.getElementById("options3dErosion") as HTMLInputElement).click());

    // the bake must complete and cache the dense height field
    await page.waitForFunction(async () => await (window as any).Controllers.View3d.isCached(), {
      timeout: 60000
    });

    // labels and icons sample the baked field: heights must be finite numbers
    const centerHeight = await page.evaluate(() => {
      const { width: w, height: h } = (window as any).options.map.graph;
      return (window as any).Controllers.View3d.heightAt(w / 2, h / 2, 50);
    });
    expect(Number.isFinite(centerHeight)).toBe(true);

    // no page errors during view creation, bake, or re-render
    expect(errors).toEqual([]);
  });
});

test.describe("3D globe with the equirectangular map texture", () => {
  test.setTimeout(180_000);

  test("projects the map texture onto the globe without errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(`pageerror: ${error.message}`));
    page.on("console", message => {
      if (message.type() === "error") errors.push(`console: ${message.text()}`);
    });

    await page.goto("/");
    await waitForMap(page);

    const hasWebGL = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
    });
    test.skip(!hasWebGL, "WebGL is not available in this environment");

    await page.evaluate(() => (window as any).Controllers.View3d.open("viewGlobe"));
    await page.waitForSelector("#canvas3d", { state: "attached", timeout: 60000 });
    await page.waitForFunction(async () => (await (window as any).Controllers.View3d.isOn()) === true, {
      timeout: 60000
    });

    // 球面用的是导出的地图纹理，导出 + 上球是异步的
    await page.waitForTimeout(8000);

    const coverage = await page.evaluate(() => {
      const canvas = document.getElementById("canvas3d") as HTMLCanvasElement;
      if (!canvas || !canvas.width || !canvas.height) return 0;
      const context = document.createElement("canvas").getContext("2d")!;
      context.canvas.width = canvas.width;
      context.canvas.height = canvas.height;
      context.drawImage(canvas, 0, 0);
      const cx = Math.floor(canvas.width / 2);
      const cy = Math.floor(canvas.height / 2);
      const radius = Math.floor(Math.min(canvas.width, canvas.height) * 0.2);
      const { data } = context.getImageData(cx - radius, cy - radius, radius * 2, radius * 2);
      let covered = 0;
      let total = 0;
      for (let y = -radius; y < radius; y++) {
        for (let x = -radius; x < radius; x++) {
          if (x * x + y * y > radius * radius) continue;
          const index = ((y + radius) * radius * 2 + (x + radius)) * 4;
          total++;
          if (Math.max(data[index], data[index + 1], data[index + 2]) >= 40) covered++;
        }
      }
      return total ? covered / total : -1;
    });

    console.log("贴图球盘面覆盖率: " + coverage.toFixed(3));
    expect(coverage).toBeGreaterThan(0.9);
    expect(errors).toEqual([]);
  });
});
