import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const context = browser.contexts()[0];
const page = context.pages()[0] ?? (await context.waitForEvent("page"));

const external = [];
const errors = [];
const globeLogs = [];
page.on("request", request => {
  const url = request.url();
  if (/^(https?|wss?):\/\/(localhost|127\.0\.0\.1)([:/]|$)/.test(url)) return;
  if (/^(data|blob|app|devtools|chrome-extension):/.test(url)) return;
  if (url.startsWith("about:")) return;
  external.push(url);
});
page.on("pageerror", error => errors.push("pageerror: " + error.message));
page.on("console", message => {
  const text = message.text();
  if (text.includes("[globe]")) globeLogs.push(text);
  if (message.type() === "error") errors.push("console: " + text);
});

await page.waitForFunction(() => (window.mapHistory?.length ?? 0) > 0, undefined, { timeout: 120000 });
const title = await page.title();
const version = await page.evaluate(() => window.VERSION);

await page.evaluate(() => {
  for (const button of document.querySelectorAll(".ui-dialog-titlebar-close")) button.click();
});
await page.evaluate(() => window.Controllers.View3d.open("viewGlobe"));
await page.waitForSelector("#canvas3d", { state: "attached", timeout: 60000 });
await page.waitForFunction(async () => (await window.Controllers.View3d.isOn()) === true, undefined, { timeout: 60000 });

const coverage = () => page.evaluate(() => {
  const canvas = document.getElementById("canvas3d");
  if (!canvas || !canvas.width || !canvas.height) return 0;
  const context = document.createElement("canvas").getContext("2d");
  context.canvas.width = canvas.width;
  context.canvas.height = canvas.height;
  context.drawImage(canvas, 0, 0);
  const cx = Math.floor(canvas.width / 2);
  const cy = Math.floor(canvas.height / 2);
  const radius = Math.floor(Math.min(canvas.width, canvas.height) * 0.2);
  const { data } = context.getImageData(cx - radius, cy - radius, radius * 2, radius * 2);
  let covered = 0;
  let total = 0;
  for (let y = -radius; y < radius; y++)
    for (let x = -radius; x < radius; x++) {
      if (x * x + y * y > radius * radius) continue;
      const i = ((y + radius) * radius * 2 + (x + radius)) * 4;
      total++;
      if (Math.max(data[i], data[i + 1], data[i + 2]) >= 40) covered++;
    }
  return total ? covered / total : -1;
});

let globeCoverage = -1;
const deadline = Date.now() + 30000;
while (Date.now() < deadline) {
  globeCoverage = await coverage();
  if (globeCoverage > 0.99) break;
  await page.waitForTimeout(300);
}

await page.locator("#canvas3d").screenshot({ path: process.env.SMOKE_SHOTS + "/packaged-074-globe.png" });
const box = await page.locator("#canvas3d").boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
for (let index = 0; index < 3; index++) {
  await page.mouse.wheel(0, -200);
  await page.waitForTimeout(400);
}
await page.waitForTimeout(1200);
await page.locator("#canvas3d").screenshot({ path: process.env.SMOKE_SHOTS + "/packaged-074-zoom.png" });

const fillLog = globeLogs.find(line => line.includes("要素填充")) ?? null;
const result = { title, version, globeCoverage: Number(globeCoverage.toFixed(4)), fillLog, externalRequests: external, errors };
writeFileSync(process.env.SMOKE_SHOTS + "/packaged-074.json", JSON.stringify(result, null, 1));
console.log("PACKAGED_RESULT " + JSON.stringify(result));
await browser.close();
