import { closeDialogs } from "@/components/dialog/dialog-helpers";
import { tip } from "@/components/tooltips";
import { savedMessage } from "@/services/platform";
import { MAP_FORMAT_VERSION } from "@/services/versioning";
import { getFileName } from "@/utils";

type ExportJsonType = "Full" | "Minimal" | "PackCells" | "GridCells";

const typeMap = {
  Full: getFullDataJson,
  Minimal: getMinimalDataJson,
  PackCells: getPackDataJson,
  GridCells: getGridDataJson
};

function exportToJson(type: ExportJsonType): void {
  if (customization) {
    tip("Data cannot be exported when edit mode is active, please exit the mode and retry", false, "error");
    return;
  }
  closeDialogs("#alert");

  TIME && console.time("exportToJson");
  const mapData = typeMap[type]();
  const blob = new Blob([mapData], { type: "application/json" });
  const URL = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = `${getFileName(type)}.json`;
  link.href = URL;
  link.click();
  tip(savedMessage(link.download), true, "success", 7000);
  window.URL.revokeObjectURL(URL);
  TIME && console.timeEnd("exportToJson");
}

function getFullDataJson(): string {
  const info = getMapInfo();
  const settings = getSettings();
  const packData = getPackCellsData();
  const gridData = getGridCellsData();

  return JSON.stringify({
    info,
    settings,
    mapCoordinates: options.map.geography.coordinates,
    pack: packData,
    grid: gridData,
    nameBases: Names.nameBases
  });
}

function getMinimalDataJson(): string {
  const info = getMapInfo();
  const settings = getSettings();
  const packData = {
    features: pack.features,
    biomes: pack.biomes,
    cultures: pack.cultures,
    burgs: pack.burgs,
    states: pack.states,
    provinces: pack.provinces,
    religions: pack.religions,
    rivers: pack.rivers,
    goods: pack.goods,
    markers: pack.markers,
    markets: pack.markets,
    deals: pack.deals,
    routes: pack.routes,
    zones: pack.zones,
    measurers: pack.measurers,
    journeys: pack.journeys
  };
  return JSON.stringify({
    info,
    settings,
    mapCoordinates: options.map.geography.coordinates,
    pack: packData,
    nameBases: Names.nameBases
  });
}

function getPackDataJson(): string {
  const info = getMapInfo();
  const cells = getPackCellsData();
  return JSON.stringify({ info, cells });
}

function getGridDataJson(): string {
  const info = getMapInfo();
  const cells = getGridCellsData();
  return JSON.stringify({ info, cells });
}

function getMapInfo() {
  return {
    version: MAP_FORMAT_VERSION,
    description: "Azgaar's Fantasy Map Generator output: azgaar.github.io/Fantasy-map-generator",
    exportedAt: new Date().toISOString(),
    mapName: options.map.lore.name,
    width: options.map.graph.width,
    height: options.map.graph.height,
    seed: options.map.seed,
    mapId: mapHistory.at(-1)?.created ?? Date.now()
  };
}

function getSettings() {
  return {
    distanceUnit: options.map.units.distance.unit,
    distanceScale: options.map.units.distance.scale,
    areaUnit: options.map.units.area.unit,
    heightUnit: options.map.units.height.unit,
    heightExponent: options.map.units.height.exponent,
    temperatureScale: options.map.units.temperature.unit,
    populationRate: options.map.units.population.scale,
    urbanization: options.map.units.population.urbanization.rate,
    urbanDensity: options.map.units.population.urbanization.density,
    options,
    mapName: options.map.lore.name,
    stylePreset: options.map.style.preset
  };
}

function getPackCellsData() {
  const data = pack.cells;

  return {
    cells: Array.from(pack.cells.i).map(cellId => ({
      i: cellId,
      v: data.v[cellId],
      c: data.c[cellId],
      p: data.p[cellId],
      g: data.g[cellId],
      h: data.h[cellId],
      area: data.area[cellId],
      f: data.f[cellId],
      t: data.t[cellId],
      haven: data.haven[cellId],
      harbor: data.harbor[cellId],
      fl: data.fl[cellId],
      r: data.r[cellId],
      conf: data.conf[cellId],
      biome: data.biome[cellId],
      s: data.s[cellId],
      pop: data.pop[cellId],
      culture: data.culture[cellId],
      burg: data.burg[cellId],
      routes: data.routes[cellId],
      state: data.state[cellId],
      religion: data.religion[cellId],
      province: data.province[cellId]
    })),
    vertices: Array.from(pack.vertices.p).map((_, vertexId) => ({
      i: vertexId,
      p: pack.vertices.p[vertexId],
      v: pack.vertices.v[vertexId],
      c: pack.vertices.c[vertexId]
    })),
    features: pack.features,
    biomes: pack.biomes,
    cultures: pack.cultures,
    burgs: pack.burgs,
    states: pack.states,
    provinces: pack.provinces,
    religions: pack.religions,
    rivers: pack.rivers,
    goods: pack.goods,
    markers: pack.markers,
    markets: pack.markets,
    deals: pack.deals,
    routes: pack.routes,
    zones: pack.zones,
    measurers: pack.measurers,
    journeys: pack.journeys
  };
}

function getGridCellsData() {
  const dataArrays = grid.cells;

  const gridData = {
    cells: (Array.from(grid.cells.i) as number[]).map((cellId: number) => ({
      i: cellId,
      v: dataArrays.v[cellId],
      c: dataArrays.c[cellId],
      b: dataArrays.b[cellId],
      f: dataArrays.f[cellId],
      t: dataArrays.t[cellId],
      h: dataArrays.h[cellId],
      temp: dataArrays.temp[cellId],
      prec: dataArrays.prec[cellId]
    })),
    vertices: Array.from(grid.vertices.p).map((_: unknown, vertexId: number) => ({
      i: vertexId,
      p: grid.vertices.p[vertexId],
      v: grid.vertices.v[vertexId],
      c: grid.vertices.c[vertexId]
    })),
    spacing: grid.spacing,
    cellsY: grid.cellsY,
    cellsX: grid.cellsX,
    points: grid.points,
    boundary: grid.boundary,
    seed: options.map.seed,
    features: pack.features
  };
  return gridData;
}

export const ExportJson = { exportToJson };
