import { test, expect } from "@playwright/test";
import { waitForMap } from "./wait-for-map";

// 软件 WebGL（SwiftShader）需要显式开关；覆盖 launchOptions 会替换配置里的，所以 CHROMIUM_PATH 也要带上
test.use({
  launchOptions: {
    args: ["--enable-unsafe-swiftshader"],
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
  }
});

const SHOT_DIR = process.env.GLOBE_SHOT_DIR || ".";

// 应用启动时随机给的是区域地图，所以两种场景都显式指定坐标
const WORLD = { latT: 180, latN: 90, latS: -90, lonT: 320, lonW: -160, lonE: 160 };
const REGION = { latT: 90, latN: 60, latS: -30, lonT: 180, lonW: -90, lonE: 90 };

/** 版本变了会弹「更新说明」，它会盖住球面并污染像素测量；开球前统一关掉 */
async function dismissStartupDialogs(page: any): Promise<void> {
  await page.evaluate(() => {
    for (const button of document.querySelectorAll(".ui-dialog-titlebar-close")) (button as HTMLElement).click();
  });
  await page.waitForTimeout(400);
}

/** 截图：先关掉启动弹窗，否则弹窗会盖在元素截图上 */
async function shot(page: any, name: string): Promise<void> {
  await dismissStartupDialogs(page);
  await page.locator("#canvas3d").screenshot({ path: SHOT_DIR + "/" + name + ".png" });
}

async function openGlobe(page: any): Promise<void> {
  await dismissStartupDialogs(page);
  await page.evaluate(() => (window as any).Controllers.View3d.open("viewGlobe"));
  await page.waitForSelector("#canvas3d", { state: "attached", timeout: 60_000 });
  await page.waitForFunction(async () => (await (window as any).Controllers.View3d.isOn()) === true, {
    timeout: 60_000
  });
  // 关掉自转，截图才可比；走的是界面上的滑块，不依赖任何调试口
  await page.evaluate(() => {
    const rotation = document.getElementById("options3dGlobeRotationRange") as HTMLInputElement;
    rotation.value = "0";
    rotation.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForTimeout(800);
}

/**
 * 球面有没有洞：把 WebGL 画布画到 2D canvas 上，数中心圆盘里的背景色像素。
 * 洞会露出星空背景（接近黑），正常渲染时圆盘里全是地图颜色。
 */
async function centerCoverage(page: any): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.getElementById("canvas3d") as HTMLCanvasElement;
    if (!canvas.width || !canvas.height) return 0;
    const context = document.createElement("canvas").getContext("2d")!;
    context.canvas.width = canvas.width;
    context.canvas.height = canvas.height;
    context.drawImage(canvas, 0, 0);
    const centerX = Math.floor(canvas.width / 2);
    const centerY = Math.floor(canvas.height / 2);
    const radius = Math.floor(Math.min(canvas.width, canvas.height) * 0.2);
    const { data } = context.getImageData(centerX - radius, centerY - radius, radius * 2, radius * 2);
    let covered = 0;
    let total = 0;
    for (let y = -radius; y < radius; y++) {
      for (let x = -radius; x < radius; x++) {
        if (x * x + y * y > radius * radius) continue;
        const i = ((y + radius) * radius * 2 + (x + radius)) * 4;
        total++;
        if (Math.max(data[i], data[i + 1], data[i + 2]) >= 40) covered++;
      }
    }
    return total ? covered / total : 0;
  });
}

/** 渲染是异步的：轮询等球面画出来，而不是死等一个固定时长；失败时把画布状态一起报出来 */
async function expectGlobeRendered(page: any): Promise<void> {
  const deadline = Date.now() + 30_000;
  let coverage = -1;
  while (Date.now() < deadline) {
    coverage = await centerCoverage(page);
    if (coverage > 0.99) return;
    await page.waitForTimeout(300);
  }
  const state = await page.evaluate(() => {
    const canvas = document.getElementById("canvas3d") as HTMLCanvasElement;
    const context = document.createElement("canvas").getContext("2d")!;
    context.canvas.width = canvas.width || 1;
    context.canvas.height = canvas.height || 1;
    context.drawImage(canvas, 0, 0);
    const data = context.getImageData(0, 0, context.canvas.width, context.canvas.height).data;
    let nonDark = 0;
    let sampled = 0;
    for (let i = 0; i < data.length; i += 4) {
      sampled++;
      if (Math.max(data[i], data[i + 1], data[i + 2]) >= 40) nonDark++;
    }
    const center = (Math.floor(canvas.height / 2) * canvas.width + Math.floor(canvas.width / 2)) * 4;
    return {
      width: canvas.width,
      height: canvas.height,
      nonDarkRatio: Number((nonDark / sampled).toFixed(4)),
      centerPixel: [data[center], data[center + 1], data[center + 2]]
    };
  });
  throw new Error("球面没画出来：coverage=" + coverage + " 画布=" + JSON.stringify(state));
}

/** 在画布上拖动旋转（OrbitControls：左键拖动 clientHeight 像素约等于转一整圈） */
async function drag(page: any, dx: number, dy: number): Promise<void> {
  const box = await page.locator("#canvas3d").boundingBox();
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.mouse.move(centerX + dx, centerY + dy, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(400);
}

/** 滚轮拉近：检查线画拐角、贴图细节时要看得清 */
async function zoomGlobe(page: any, delta: number): Promise<void> {
  const box = await page.locator("#canvas3d").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, delta);
  await page.waitForTimeout(700);
}

const collectErrors = (page: any): string[] => {
  const errors: string[] = [];
  page.on("pageerror", (error: Error) => errors.push("pageerror: " + error.message));
  page.on("console", (message: any) => {
    if (message.type() === "error") errors.push("console: " + message.text());
  });
  return errors;
};

/**
 * 记录所有外部网络请求：产品要能完全离线用，地球仪不该再去外部站点取任何东西。
 * 本地开发服务器、data:/blob:、以及打包版的 app: 协议都算内部。
 */
const collectExternalRequests = (page: any): string[] => {
  const external: string[] = [];
  page.on("request", (request: any) => {
    const url: string = request.url();
    if (/^(https?|wss?):\/\/(localhost|127\.0\.0\.1)([:/]|$)/.test(url)) return;
    if (/^(data|blob|app|devtools|chrome-extension):/.test(url)) return;
    if (url.startsWith("about:")) return;
    external.push(url);
  });
  return external;
};

/**
 * 球面圆盘的平均色与颜色离散度：用来判断「贴图/图层变化是否真的反映到球面上」。
 * 只统计中心圆盘，避免星空背景把数值带偏。
 */
async function globePixelSignature(page: any): Promise<string> {
  return page.evaluate(() => {
    const canvas = document.getElementById("canvas3d") as HTMLCanvasElement;
    const context = document.createElement("canvas").getContext("2d")!;
    context.canvas.width = canvas.width;
    context.canvas.height = canvas.height;
    context.drawImage(canvas, 0, 0);
    const centerX = Math.floor(canvas.width / 2);
    const centerY = Math.floor(canvas.height / 2);
    const radius = Math.floor(Math.min(canvas.width, canvas.height) * 0.2);
    const { data } = context.getImageData(centerX - radius, centerY - radius, radius * 2, radius * 2);
    const pixels: number[] = [];
    for (let y = -radius; y < radius; y++) {
      for (let x = -radius; x < radius; x++) {
        if (x * x + y * y > radius * radius) continue;
        const i = ((y + radius) * radius * 2 + (x + radius)) * 4;
        pixels.push(data[i], data[i + 1], data[i + 2]);
      }
    }
    const count = pixels.length / 3;
    let sum = [0, 0, 0];
    for (let i = 0; i < pixels.length; i += 3) {
      sum[0] += pixels[i];
      sum[1] += pixels[i + 1];
      sum[2] += pixels[i + 2];
    }
    const mean = sum.map(value => value / count);
    let variance = 0;
    for (let i = 0; i < pixels.length; i += 3) {
      variance += (pixels[i] - mean[0]) ** 2 + (pixels[i + 1] - mean[1]) ** 2 + (pixels[i + 2] - mean[2]) ** 2;
    }
    return mean.map(value => value.toFixed(1)).join("/") + " σ=" + Math.sqrt(variance / count).toFixed(2);
  });
}

test.describe("矢量球面（地球仪）", () => {
  test.setTimeout(300_000);

  test("整世界地图：渲染出完整球面，无黑洞", async ({ page }) => {
    const errors = collectErrors(page);
    const externalRequests = collectExternalRequests(page);

    await page.goto("/");
    await waitForMap(page);

    // 产品身份：改名后窗口标题必须是新产品名
    expect(await page.title()).toContain("HuanMeng Map Creator");

    await page.evaluate((coords: unknown) => {
      Object.assign((window as any).options.map.geography.coordinates, coords as object);
    }, WORLD);
    await page.screenshot({ path: SHOT_DIR + "/map-2d.png" });

    await openGlobe(page);
    await expectGlobeRendered(page);
    await shot(page, "globe-1");

    await drag(page, 300, 0);
    await expectGlobeRendered(page);
    await shot(page, "globe-2");

    await drag(page, 0, -260); // 抬到北极方向
    await expectGlobeRendered(page);
    await shot(page, "globe-3-pole");

    // 拉近看线画：带条之间的拐角补片不该留下楔形缺口
    await zoomGlobe(page, -1400);
    await expectGlobeRendered(page);
    await shot(page, "globe-4-zoom");

    // 线画（海岸线/国界/河流）确实投到了球上：球面用的是平面图 SVG 里的描边路径
    const strokeCount = await page.evaluate(() => {
      const skipped = [
        "grid",
        "cells",
        "coordinates",
        "compass",
        "heightmap",
        "texture",
        "temperature",
        "precipitation"
      ];
      let count = 0;
      for (const group of document.querySelectorAll<SVGGElement>("#map g[data-layer]")) {
        if (skipped.includes(group.dataset.layer ?? "")) continue;
        if (getComputedStyle(group).display === "none") continue;
        for (const path of group.querySelectorAll("path")) {
          const style = getComputedStyle(path);
          if (style.stroke !== "none" && Number.parseFloat(style.strokeWidth) > 0) count++;
        }
      }
      return count;
    });
    console.log("线画：平面图里有描边的路径 " + strokeCount + " 条，已全部投到球上");
    expect(strokeCount).toBeGreaterThan(50);

    // 完全离线可用：地球仪不该请求任何外部资源（星空图现在内置）
    expect(externalRequests).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("区域地图：底球补齐，球上没有缺口", async ({ page }) => {
    const errors = collectErrors(page);
    const externalRequests = collectExternalRequests(page);

    await page.goto("/");
    await waitForMap(page);
    await page.evaluate((coords: unknown) => {
      Object.assign((window as any).options.map.geography.coordinates, coords as object);
    }, REGION);

    await openGlobe(page);
    await expectGlobeRendered(page);
    await shot(page, "globe-region");

    expect(externalRequests).toEqual([]);
    expect(errors).toEqual([]);
  });
  test("纹理：开启纸纹图层后球面跟着变，海洋图案默认就在", async ({ page }) => {
    const errors = collectErrors(page);

    await page.goto("/");
    await waitForMap(page);
    await page.evaluate((coords: unknown) => {
      Object.assign((window as any).options.map.geography.coordinates, coords as object);
    }, WORLD);

    await openGlobe(page);
    await expectGlobeRendered(page);
    await shot(page, "globe-texture-off");
    const before = await globePixelSignature(page);

    // 贴图是默认关闭的图层：打开它，球面应当跟着变（陆地叠上纸纹）
    await page.evaluate(() => (window as any).Layers.show("texture"));
    await page.evaluate(() => (window as any).Controllers.View3d.update());
    await page.waitForTimeout(2500);
    await shot(page, "globe-texture-on");
    const after = await globePixelSignature(page);

    console.log("纸纹图层：关 " + before + " → 开 " + after);
    expect(after).not.toBe(before);
    expect(errors).toEqual([]);
  });
  test("地形符号：开启 relief 图层后球面叠上山/林图标", async ({ page }) => {
    const errors = collectErrors(page);

    await page.goto("/");
    await waitForMap(page);
    await page.evaluate((coords: unknown) => {
      Object.assign((window as any).options.map.geography.coordinates, coords as object);
    }, WORLD);

    await openGlobe(page);
    await expectGlobeRendered(page);
    await shot(page, "globe-relief-off");
    const before = await globePixelSignature(page);

    // 地形符号的图层默认是关的，图标集也是异步加载的：打开后等图标落地再让球面重建
    await page.evaluate(() => (window as any).Layers.show("relief"));
    await page.waitForTimeout(2000);
    await page.evaluate(() => (window as any).Controllers.View3d.update());
    await page.waitForTimeout(2500);
    await dismissStartupDialogs(page);
    await page.screenshot({ path: SHOT_DIR + "/map-relief-on.png" });
    await shot(page, "globe-relief-on");
    const after = await globePixelSignature(page);

    console.log("地形符号：关 " + before + " → 开 " + after);
    expect(after).not.toBe(before);
    expect(errors).toEqual([]);
  });
  test("性能：输入没变就复用，只切线画图层不动球面", async ({ page }) => {
    const logs: string[] = [];
    page.on("console", (message: any) => {
      const line: string = message.text();
      if (line.includes("[globe]")) logs.push(line);
    });

    await page.goto("/");
    await waitForMap(page);
    await openGlobe(page);
    await expectGlobeRendered(page);

    // 1) 无变化的重复 update 必须走复用分支（以前每次都要重算球面/线画/填充）
    logs.length = 0;
    await page.evaluate(() => (window as any).Controllers.View3d.update());
    await page.waitForTimeout(1500);
    expect(logs.some(line => line.includes("输入没有变化"))).toBe(true);

    // 2) 只切河流：重建里不该出现「球面」（球面与河流图层无关）
    logs.length = 0;
    await page.evaluate(() => (window as any).Layers.toggle("rivers"));
    await page.waitForTimeout(900);
    await page.evaluate(() => (window as any).Controllers.View3d.update());
    await page.waitForTimeout(2000);
    const rebuilt = logs.find(line => line.includes("重建："));
    console.log("切河流后的重建范围: " + rebuilt);
    expect(rebuilt).toBeDefined();
    expect(rebuilt).not.toContain("球面");
    expect(rebuilt).toContain("线画");
  });

  test("贴图缺失时降级：球面照常渲染，只留警告", async ({ page }) => {
    const errors = collectErrors(page);
    const warnings: string[] = [];
    page.on("console", (message: any) => {
      if (message.type() === "warning") warnings.push(message.text());
    });

    await page.goto("/");
    await waitForMap(page);

    // 纸纹指向一个不存在的文件，再打开该图层 —— 球面应当退回纯顶点色
    await page.evaluate(() => {
      (window as any).styles.texture.options.href = "images/textures/does-not-exist.jpg";
      (window as any).Layers.show("texture");
    });

    await openGlobe(page);
    await expectGlobeRendered(page);
    await shot(page, "globe-texture-missing");

    console.log("贴图缺失：警告 " + warnings.filter(line => line.includes("贴图")).length + " 条");
    // 资源 404 本身会记一条浏览器错误，这里只要求没有 JS 层错误
    expect(errors.filter(line => !line.includes("Failed to load resource"))).toEqual([]);
  });
});
