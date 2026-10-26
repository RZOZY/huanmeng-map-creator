// Save the whole .map project to storage, machine or cloud
import { closeDialogs } from "@/components/dialog/dialog-helpers";
import { Layers } from "@/components/layers";
import { tip } from "@/components/tooltips";
import { GraphOverride } from "@/generators/graph-override";
import { Notes } from "@/generators/notes";
import { Services } from "@/services";
import { getUsedFonts } from "@/services/fonts";
import { MAP_FORMAT_VERSION } from "@/services/versioning";
import { ensureEl, escapeHtml, getFileName, parseError, rn } from "@/utils";
import { beginMapIO, isMapIOBusy } from "./map-io";
import { isMapModelStable } from "./model-status";
import { type SaveOutcome, saveToFileSystem } from "./save-to-file";

export type MapSaveOutcome =
  | SaveOutcome
  | { type: "rejected"; reason: "edit-mode" }
  | { type: "stored"; target: "browser" | "dropbox" }
  | { type: "failed"; error: unknown };

type Writer = () => Promise<MapSaveOutcome>;

const toStorage = (): Promise<MapSaveOutcome> =>
  save(() => storeSnapshot("browser", () => writeToStorage(prepareCheckedMapData())));
const toMachine = (saveAs = false): Promise<MapSaveOutcome> =>
  save(() => saveToFileSystem(prepareCheckedMapData, `${getFileName()}.map`, saveAs));
const toDropbox = (): Promise<MapSaveOutcome> =>
  save(() => storeSnapshot("dropbox", () => Services.Cloud.save(`${getFileName()}.map`, prepareCheckedMapData())));

class SaveRejectedError extends Error {
  constructor(readonly reason: "edit-mode" | "unstable-model") {
    super(reason);
  }
}

function prepareCheckedMapData(): string {
  if (!isMapModelStable()) throw new SaveRejectedError("unstable-model");
  if (customization) throw new SaveRejectedError("edit-mode");
  return prepareMapData();
}

async function storeSnapshot(target: "browser" | "dropbox", write: () => Promise<unknown>): Promise<MapSaveOutcome> {
  const lease = beginMapIO("save");
  if (!lease) return { type: "busy" };
  try {
    await write();
    return { type: "stored", target };
  } finally {
    lease.release();
  }
}

async function save(write: Writer): Promise<MapSaveOutcome> {
  let outcome: MapSaveOutcome;
  if (isMapIOBusy()) outcome = { type: "busy" };
  else if (!isMapModelStable()) outcome = { type: "rejected", reason: "unstable-model" };
  else if (customization) outcome = { type: "rejected", reason: "edit-mode" };
  else {
    runSaveSideEffect(() => closeDialogs("#alert"));
    try {
      outcome = await write();
    } catch (error) {
      outcome =
        error instanceof SaveRejectedError ? { type: "rejected", reason: error.reason } : { type: "failed", error };
    }
  }
  runSaveSideEffect(() => {
    if (outcome.type === "failed") showSaveError(outcome.error, write);
    else notifySaveOutcome(outcome);
  });
  return outcome;
}

function runSaveSideEffect(effect: () => void): void {
  try {
    effect();
  } catch (error) {
    try {
      ERROR && console.error("地图保存界面提示失败", error);
    } catch {
      // Feedback must not change the persistence result.
    }
  }
}

function showSaveError(error: unknown, write: Writer): void {
  const saveError = error instanceof Error ? error : new Error(String(error));
  alertMessage.innerHTML = `保存地图时发生错误。请保留当前地图，修复问题后重试。<p id="errorBox">${parseError(saveError)}</p>`;
  $("#alert").dialog({
    resizable: false,
    title: "保存失败",
    width: "28em",
    buttons: {
      重试: function (this: HTMLElement) {
        runSaveSideEffect(() => $(this).dialog("close"));
        return save(write);
      },
      关闭: function (this: HTMLElement) {
        runSaveSideEffect(() => $(this).dialog("close"));
      }
    },
    position: { my: "center", at: "center", of: "svg" }
  });
}

function prepareMapData(): string {
  const date = new Date();
  const dateString = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  const license = "File can be loaded in azgaar.github.io/Fantasy-Map-Generator";
  const params = [
    MAP_FORMAT_VERSION,
    license,
    dateString,
    options.map.seed,
    options.map.graph.width,
    options.map.graph.height,
    mapHistory.at(-1)?.created ?? Date.now() // the map id: when the map on screen was created
  ].join("|");

  const settings = JSON.stringify(options.map); // what the map is; the requests and preferences stay out
  const measurers = JSON.stringify(pack.measurers ?? []);
  const journeys = JSON.stringify(pack.journeys ?? []);
  const fonts = JSON.stringify(
    getUsedFonts(
      ensureEl("map") as Element as SVGSVGElement,
      Notes.list().map(entry => entry.note)
    )
  );
  const layers = JSON.stringify(Layers.state);
  const graphOverride = JSON.stringify(GraphOverride.state);

  // save svg
  const cloneEl = ensureEl("map").cloneNode(true) as SVGSVGElement;

  // reset transform values to default
  cloneEl.setAttribute("width", String(options.map.graph.width));
  cloneEl.setAttribute("height", String(options.map.graph.height));
  cloneEl.querySelector("#viewbox")?.removeAttribute("transform");

  // relief icons are stored in pack.relief, the layer holds only the currently visible ones
  const cloneTerrain = cloneEl.querySelector("#terrain");
  if (cloneTerrain) cloneTerrain.innerHTML = "";

  for (const group of Array.from(cloneEl.querySelectorAll("#emblems > g"))) group.innerHTML = "";

  const cloneRuler = cloneEl.querySelector("#ruler");
  if (cloneRuler) cloneRuler.innerHTML = ""; // always remove rulers
  const cloneTradeAnimation = cloneEl.querySelector("#tradeAnimation");
  if (cloneTradeAnimation) cloneTradeAnimation.innerHTML = ""; // always remove transient trade animations
  cloneEl.querySelector("#journeyOverlay")?.remove(); // transient journey path-editing handles
  cloneEl.querySelector("#journeyTravel")?.remove(); // transient journey travel animation

  const serializedSVG = new XMLSerializer().serializeToString(cloneEl);

  const { spacing, cellsX, cellsY, boundary, points, features } = grid;
  const gridGeneral = JSON.stringify({ spacing, cellsX, cellsY, boundary, points, features });
  const packFeatures = JSON.stringify(pack.features);
  const biomes = JSON.stringify(pack.biomes);
  const cultures = JSON.stringify(pack.cultures);
  const states = JSON.stringify(pack.states);
  const burgs = JSON.stringify(pack.burgs);
  const religions = JSON.stringify(pack.religions);
  const provinces = JSON.stringify(pack.provinces);
  const rivers = JSON.stringify(pack.rivers);
  const relief = JSON.stringify(pack.relief || []);
  const markers = JSON.stringify(pack.markers);
  const cellRoutes = JSON.stringify(pack.cells.routes);
  const routes = JSON.stringify(pack.routes);
  const zones = JSON.stringify(pack.zones);
  const ice = JSON.stringify(pack.ice);
  const goods = JSON.stringify(pack.goods);
  const markets = JSON.stringify(pack.markets || []);
  const deals = JSON.stringify(pack.deals || []);
  const labels = JSON.stringify(pack.addedLabels || []);
  const styleData = JSON.stringify(styles);

  // store name array only if not the same as default
  const defaultNameBases = Names.getNameBases();
  const namesData = Names.nameBases
    .map((b, i) => {
      const names = defaultNameBases[i] && defaultNameBases[i].b === b.b ? "" : b.b;
      return `${b.name}|${b.min}|${b.max}|${b.d}|${b.m}|${names}`;
    })
    .join("/");

  // round population to save space
  const pop = Array.from(pack.cells.pop).map(p => rn(p, 4));

  // data format as below
  const mapData = [
    params,
    settings,
    "", // deprecated separate mapCoordinates, now options.map.geography.coordinates
    biomes,
    "", // deprecated notes array, now a note field on the entity it describes
    serializedSVG,
    gridGeneral,
    grid.cells.h,
    grid.cells.prec,
    grid.cells.f,
    grid.cells.t,
    grid.cells.temp,
    packFeatures,
    cultures,
    states,
    burgs,
    pack.cells.biome,
    pack.cells.burg,
    pack.cells.conf,
    pack.cells.culture,
    pack.cells.fl,
    pop,
    pack.cells.r,
    [], // deprecated pack.cells.road
    pack.cells.s,
    pack.cells.state,
    pack.cells.religion,
    pack.cells.province,
    [], // deprecated pack.cells.crossroad
    religions,
    provinces,
    namesData,
    rivers,
    "", // rulers are deprecated, use pack.measurers instead
    fonts,
    markers,
    cellRoutes,
    routes,
    zones,
    ice,
    pack.cells.good,
    goods,
    markets,
    deals,
    pack.cells.market,
    "", // deprecated custom good icons, now options.map.customIcons
    measurers,
    labels,
    styleData,
    relief,
    layers,
    graphOverride,
    journeys
  ].join("\r\n");
  return mapData;
}

// save map file to indexedDB
async function writeToStorage(mapData: string, showTip = false): Promise<void> {
  if (!isMapModelStable()) throw new Error("地图尚未完整载入或生成，已停止写入恢复副本");
  const blob = new Blob([mapData], { type: "text/plain" });
  await ldb.set("lastMap", blob);
  if (showTip) runSaveSideEffect(() => tip("地图快照已写入本地恢复副本", false, "success"));
}

export function notifySaveOutcome(outcome: MapSaveOutcome): void {
  if (outcome.type === "cancelled" || outcome.type === "failed") return;
  if (outcome.type === "busy") {
    tip("正在读取、保存或生成地图，请完成后重试", true, "warn", 5000);
    return;
  }
  if (outcome.type === "rejected") {
    const message =
      outcome.reason === "edit-mode"
        ? "地图正处于高度图编辑模式，请完成编辑后再保存"
        : "当前地图载入或生成未完整结束，请重新打开已保存的地图后再保存";
    tip(message, true, "warn", 8000);
    return;
  }
  if (outcome.type === "invalidated") {
    tip("保存期间地图已被替换，无法确认此保存对应当前地图。请保留当前图并重新保存", true, "warn", 12000);
    return;
  }
  if (outcome.type === "saved") {
    tip(`地图快照已保存至“${escapeHtml(outcome.filename)}”，保存期间的后续修改可能尚未保存`, true, "success", 8000);
    return;
  }
  if (outcome.type === "stored") {
    tip(
      outcome.target === "browser" ? "地图快照已写入本地恢复副本" : "地图快照已上传至 Dropbox",
      true,
      "success",
      8000
    );
    return;
  }
  let message = "已发起地图下载，请确认下载完成并保留当前地图";
  const noticeKey = "savePickerFallbackNoticeShown";
  try {
    if (!localStorage.getItem(noticeKey)) {
      message += "。文件位置由浏览器或系统下载设置决定";
      localStorage.setItem(noticeKey, "true");
    }
  } catch {
    // Storage preferences must never prevent download feedback.
  }
  tip(message, true, "warn", 12000);
}

export const Save = { toStorage, toMachine, toDropbox, prepareMapData, writeToStorage };
