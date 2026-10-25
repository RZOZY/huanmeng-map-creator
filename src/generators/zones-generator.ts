import { max, mean } from "d3";
import { requireColor } from "@/utils/colorUtils";
import { requireName } from "@/utils/validationUtils";
import { gauss, P, ra, rand, rw } from "../utils";
import { Population } from "./population-generator";

declare global {
  var Zones: ZonesModule;
}

/** 区域类型只是内部键，界面显示走这张中文对照表 */
export const ZONE_TYPE_ZH: Record<string, string> = {
  Invasion: "入侵",
  Rebels: "叛乱",
  Proselytism: "传教",
  Crusade: "十字军",
  Disease: "疫病",
  Disaster: "灾害",
  Eruption: "喷发",
  Avalanche: "雪崩",
  Fault: "断层",
  Flood: "洪水",
  Tsunami: "海啸"
};

/** 取得区域类型的中文显示名；没有对照时原样返回 */
export function zoneTypeZh(type: string): string {
  return ZONE_TYPE_ZH[type] ?? type;
}

/** 把界面上的中文类型名转回内部英文键；自定义名称原样返回 */
export function zoneTypeEn(value: string): string {
  const hit = Object.entries(ZONE_TYPE_ZH).find(([, zh]) => zh === value);
  return hit ? hit[0] : value;
}

export interface Zone {
  i: number;
  name: string;
  type: string;
  cells: number[];
  color: string;
  hidden?: boolean;
  note?: string;
}

type ZoneGenerator = (usedCells: Uint8Array) => void;

interface ZoneConfig {
  quantity: number;
  generate: ZoneGenerator;
}

class ZonesModule {
  private config: Record<string, ZoneConfig>;

  constructor() {
    this.config = {
      invasion: { quantity: 2, generate: u => this.addInvasion(u) },
      rebels: { quantity: 1.5, generate: u => this.addRebels(u) },
      proselytism: { quantity: 1.6, generate: u => this.addProselytism(u) },
      crusade: { quantity: 1.6, generate: u => this.addCrusade(u) },
      disease: { quantity: 1.4, generate: u => this.addDisease(u) },
      disaster: { quantity: 1, generate: u => this.addDisaster(u) },
      eruption: { quantity: 1, generate: u => this.addEruption(u) },
      avalanche: { quantity: 0.8, generate: u => this.addAvalanche(u) },
      fault: { quantity: 1, generate: u => this.addFault(u) },
      flood: { quantity: 1, generate: u => this.addFlood(u) },
      tsunami: { quantity: 1, generate: u => this.addTsunami(u) }
    };
  }

  /** Rename a zone; its name is its description */
  rename(zoneId: number, name: string): void {
    this.living(zoneId).name = requireName(name);
  }

  /** Set a zone's color */
  recolor(zoneId: number, color: string): void {
    this.living(zoneId).color = requireColor(color);
  }

  /** Set a zone's type, a free label such as Invasion or Disease */
  setType(zoneId: number, type: string): void {
    this.living(zoneId).type = requireName(type);
  }

  /** Hide or show a zone */
  setHidden(zoneId: number, hidden: boolean): void {
    const zone = this.living(zoneId);
    if (hidden) zone.hidden = true;
    else delete zone.hidden;
  }

  /** Add a zone over a list of cell ids; returns its id */
  add(name: string, type: string, cells: number[]): number {
    const i = pack.zones.length ? Math.max(...pack.zones.map(zone => zone.i)) + 1 : 0;
    const zone = { i, name: requireName(name), type: requireName(type), color: `url(#hatch${i % 42})`, cells: [] };
    pack.zones.push(zone);
    this.setCells(i, cells);
    return i;
  }

  /** Set the cells a zone covers, as a list of cell ids */
  setCells(zoneId: number, cells: number[]): void {
    const count = pack.cells.i.length;
    if (
      !Array.isArray(cells) ||
      !cells.length ||
      cells.some(cell => !Number.isInteger(cell) || cell < 0 || cell >= count)
    )
      throw new Error(`The cells must be a non-empty list of cell ids from 0 to ${count - 1}`);
    this.living(zoneId).cells = [...new Set(cells)];
  }

  /** Set the rural and urban population of a zone's land, in people: its cells and burgs scale to the totals */
  setPopulation(zoneId: number, rural: number, urban: number): void {
    const cells = new Set(this.living(zoneId).cells);
    Population.setArea(
      Population.landCells(cell => cells.has(cell)),
      Population.burgIds(burg => cells.has(burg.cell)),
      rural,
      urban
    );
  }

  /** Remove a zone */
  remove(zoneId: number): void {
    this.living(zoneId);
    pack.zones = pack.zones.filter(zone => zone.i !== zoneId);
  }

  private living(zoneId: number): Zone {
    const zone = pack.zones.find(({ i }) => i === zoneId);
    if (!zone) throw new Error(`Zone ${zoneId} does not exist`);
    return zone;
  }

  regenerate(globalModifier = 1): void {
    this.generate(globalModifier);
  }

  generate(globalModifier = 1) {
    const usedCells = new Uint8Array(pack.cells.i.length);
    pack.zones = [];

    Object.values(this.config).forEach(type => {
      const expectedNumber = type.quantity * globalModifier;
      let number = gauss(expectedNumber, expectedNumber / 2, 0, 100);
      while (number--) type.generate(usedCells);
    });
  }

  private addInvasion(usedCells: Uint8Array) {
    const { cells, states } = pack;

    const ongoingConflicts = states
      .filter(s => s.i && !s.removed && s.campaigns)
      .flatMap(s => s.campaigns!)
      .filter(c => !c.end);
    if (!ongoingConflicts.length) return;
    const { defender, attacker } = ra(ongoingConflicts);

    const borderCells = cells.i.filter(cellId => {
      if (usedCells[cellId]) return false;
      if (cells.state[cellId] !== defender) return false;
      return cells.c[cellId].some(c => cells.state[c] === attacker);
    });

    const startCell = ra(borderCells);
    if (startCell === undefined) return;

    const invasionCells: number[] = [];
    const queue = [startCell];
    const maxCells = rand(5, 30);

    while (queue.length) {
      const cellId = P(0.4) ? queue.shift()! : queue.pop()!;
      invasionCells.push(cellId);
      if (invasionCells.length >= maxCells) break;

      cells.c[cellId].forEach(neibCellId => {
        if (usedCells[neibCellId]) return;
        if (cells.state[neibCellId] !== defender) return;
        usedCells[neibCellId] = 1;
        queue.push(neibCellId);
      });
    }

    const subtype = rw({
      入侵: 5,
      占领: 4,
      征服: 3,
      进犯: 2,
      干涉: 2,
      突袭: 1,
      劫掠: 1,
      侵入: 1,
      闯入: 1,
      攻势: 1,
      洗劫: 1,
      掠夺: 1,
      袭击: 1,
      遭遇战: 1
    });
    const name = `${states[attacker].name}${subtype}`;

    pack.zones.push({
      i: pack.zones.length,
      name,
      type: "Invasion",
      cells: invasionCells,
      color: "url(#hatch1)"
    });
  }

  private addRebels(usedCells: Uint8Array) {
    const { cells, states } = pack;

    const state = ra(states.filter(s => s.i && !s.removed && s.neighbors?.some(Boolean)));
    if (!state) return;

    const neibStateId = ra(state.neighbors!.filter((n: number) => n && !states[n].removed));
    if (!neibStateId) return;

    const cellsArray: number[] = [];
    const queue: number[] = [];
    const borderCellId = cells.i.find(
      i => cells.state[i] === state.i && cells.c[i].some(c => cells.state[c] === neibStateId)
    );
    if (borderCellId) queue.push(borderCellId);
    const maxCells = rand(10, 30);

    while (queue.length) {
      const cellId = queue.shift()!;
      cellsArray.push(cellId);
      if (cellsArray.length >= maxCells) break;

      cells.c[cellId].forEach(neibCellId => {
        if (usedCells[neibCellId]) return;
        if (cells.state[neibCellId] !== state.i) return;
        usedCells[neibCellId] = 1;
        if (neibCellId % 4 !== 0 && !cells.c[neibCellId].some(c => cells.state[c] === neibStateId)) return;
        queue.push(neibCellId);
      });
    }

    const rebels = rw({
      叛军: 5,
      暴动: 2,
      哗变: 1,
      起义军: 1,
      叛乱: 1,
      叛党: 1,
      反抗军: 1,
      革命党: 1,
      暴民: 1,
      分裂派: 1,
      独立派: 1,
      阴谋团: 1
    });

    const name = `${states[neibStateId].name}${rebels}`;
    pack.zones.push({
      i: pack.zones.length,
      name,
      type: "Rebels",
      cells: cellsArray,
      color: "url(#hatch3)"
    });
  }

  private addProselytism(usedCells: Uint8Array) {
    const { cells, religions } = pack;

    const organizedReligions = religions.filter(r => r.i && !r.removed && r.type === "Organized");
    const religion = ra(organizedReligions);
    if (!religion) return;

    const targetBorderCells = cells.i.filter(
      i =>
        cells.h[i] >= 20 &&
        cells.pop[i] &&
        cells.religion[i] !== religion.i &&
        cells.c[i].some(c => cells.religion[c] === religion.i)
    );
    const startCell = ra(targetBorderCells);
    if (!startCell) return;

    const targetReligionId = cells.religion[startCell];
    const proselytismCells: number[] = [];
    const queue = [startCell];
    const maxCells = rand(10, 30);

    while (queue.length) {
      const cellId = queue.shift()!;
      proselytismCells.push(cellId);
      if (proselytismCells.length >= maxCells) break;

      cells.c[cellId].forEach(neibCellId => {
        if (usedCells[neibCellId]) return;
        if (cells.religion[neibCellId] !== targetReligionId) return;
        if (cells.h[neibCellId] < 20 || !cells.pop[neibCellId]) return;
        usedCells[neibCellId] = 1;
        queue.push(neibCellId);
      });
    }

    const name = `${religion.name}传教`;
    pack.zones.push({
      i: pack.zones.length,
      name,
      type: "Proselytism",
      cells: proselytismCells,
      color: "url(#hatch6)"
    });
  }

  private addCrusade(usedCells: Uint8Array) {
    const { cells, religions } = pack;

    const heresies = religions.filter(r => !r.removed && r.type === "Heresy");
    if (!heresies.length) return;

    const heresy = ra(heresies);
    const crusadeCells = cells.i.filter(i => !usedCells[i] && cells.religion[i] === heresy.i);
    if (!crusadeCells.length) return;
    for (const i of crusadeCells) {
      usedCells[i] = 1;
    }

    const name = `${heresy.name}讨伐`;
    pack.zones.push({
      i: pack.zones.length,
      name,
      type: "Crusade",
      cells: Array.from(crusadeCells),
      color: "url(#hatch6)"
    });
  }

  private addDisease(usedCells: Uint8Array) {
    const { cells, burgs } = pack;

    const burg = ra(burgs.filter(b => !usedCells[b.cell] && b.i && !b.removed));
    if (!burg) return;

    const cellsArray: number[] = [];
    const cost: number[] = [];
    const maxCells = rand(20, 40);

    const queue = new FlatQueue();
    queue.push({ e: burg.cell, p: 0 }, 0);

    while (queue.length) {
      const next = queue.pop();
      if (cells.burg[next.e] || cells.pop[next.e]) cellsArray.push(next.e);
      usedCells[next.e] = 1;

      cells.c[next.e].forEach(nextCellId => {
        const c = Routes.getRoute(next.e, nextCellId) ? 5 : 100;
        const p = next.p + c;
        if (p > maxCells) return;

        if (!cost[nextCellId] || p < cost[nextCellId]) {
          cost[nextCellId] = p;
          queue.push({ e: nextCellId, p }, p);
        }
      });
    }

    const colorName = this.getDiseaseName("color");
    const animalName = this.getDiseaseName("animal");
    const adjectiveName = this.getDiseaseName("adjective");

    const model = rw({ color: 2, animal: 1, adjective: 1 });
    const prefix = model === "color" ? colorName : model === "animal" ? animalName : adjectiveName;

    const disease = rw({
      热病: 5,
      瘟疫: 3,
      咳疾: 3,
      流感: 2,
      痘疮: 2,
      霍乱: 2,
      伤寒: 2,
      麻风: 1,
      天花: 1,
      疫病: 1,
      痨病: 1,
      瘴气: 1,
      水肿: 1
    });
    const name = `${prefix}${disease}`;

    pack.zones.push({
      i: pack.zones.length,
      name,
      type: "Disease",
      cells: cellsArray,
      color: "url(#hatch12)"
    });
  }

  private getDiseaseName(model: "color" | "animal" | "adjective"): string {
    if (model === "color")
      return ra([
        "琥珀",
        "天青",
        "黑",
        "蓝",
        "褐",
        "绯红",
        "翠",
        "金",
        "绿",
        "灰",
        "橙",
        "粉",
        "紫",
        "红",
        "宝石红",
        "猩红",
        "银",
        "紫罗兰",
        "白",
        "黄"
      ]);
    if (model === "animal")
      return ra([
        "猿",
        "熊",
        "鸟",
        "野猪",
        "猫",
        "牛",
        "鹿",
        "犬",
        "狐",
        "山羊",
        "马",
        "狮",
        "猪",
        "鼠",
        "渡鸦",
        "羊",
        "蜘蛛",
        "虎",
        "蝰蛇",
        "狼",
        "蠕虫",
        "巨蛇"
      ]);
    return ra([
      "盲目",
      "血腥",
      "残暴",
      "燃烧",
      "致命",
      "宿命",
      "狂怒",
      "巨大",
      "阴沉",
      "可怖",
      "无形",
      "致死",
      "喧响",
      "必死",
      "野蛮",
      "严酷",
      "寂静",
      "未知",
      "有毒",
      "凶恶"
    ]);
  }

  private addDisaster(usedCells: Uint8Array) {
    const { cells, burgs } = pack;

    const burg = ra(burgs.filter(b => !usedCells[b.cell] && b.i && !b.removed));
    if (!burg) return;
    usedCells[burg.cell] = 1;

    const cellsArray: number[] = [];
    const cost: number[] = [];
    const maxCells = rand(5, 25);

    const queue = new FlatQueue();
    queue.push({ e: burg.cell, p: 0 }, 0);

    while (queue.length) {
      const next = queue.pop();
      if (cells.burg[next.e] || cells.pop[next.e]) cellsArray.push(next.e);
      usedCells[next.e] = 1;

      cells.c[next.e].forEach(e => {
        const c = rand(1, 10);
        const p = next.p + c;
        if (p > maxCells) return;

        if (!cost[e] || p < cost[e]) {
          cost[e] = p;
          queue.push({ e, p }, p);
        }
      });
    }

    const type = rw({
      饥荒: 5,
      旱灾: 3,
      地震: 3,
      粮荒: 1,
      龙卷风: 1,
      野火: 1,
      风暴: 1,
      枯萎病: 1
    });
    const name = `${burg.name!}${type}`;
    pack.zones.push({
      i: pack.zones.length,
      name,
      type: "Disaster",
      cells: cellsArray,
      color: "url(#hatch5)"
    });
  }

  private addEruption(usedCells: Uint8Array) {
    const { cells, markers } = pack;

    const volcanoe = markers.find(m => m.type === "volcanoes" && !usedCells[m.cell]);
    if (!volcanoe) return;
    usedCells[volcanoe.cell] = 1;

    if (volcanoe.note) volcanoe.note = volcanoe.note.replace("Active volcano", "Erupting volcano");
    const name = volcanoe.name ? `${volcanoe.name}喷发` : "火山喷发";

    const cellsArray: number[] = [];
    const queue = [volcanoe.cell];
    const maxCells = rand(10, 30);

    while (queue.length) {
      const cellId = P(0.5) ? queue.shift()! : queue.pop()!;
      cellsArray.push(cellId);
      if (cellsArray.length >= maxCells) break;

      cells.c[cellId].forEach(neibCellId => {
        if (usedCells[neibCellId] || cells.h[neibCellId] < 20) return;
        usedCells[neibCellId] = 1;
        queue.push(neibCellId);
      });
    }

    pack.zones.push({
      i: pack.zones.length,
      name,
      type: "Eruption",
      cells: cellsArray,
      color: "url(#hatch7)"
    });
  }

  private addAvalanche(usedCells: Uint8Array) {
    const { cells } = pack;

    const routeCells = cells.i.filter(i => !usedCells[i] && Routes.isConnected(i) && cells.h[i] >= 70);
    if (!routeCells.length) return;

    const startCell = ra(routeCells);
    usedCells[startCell] = 1;

    const cellsArray: number[] = [];
    const queue = [startCell];
    const maxCells = rand(3, 15);

    while (queue.length) {
      const cellId = P(0.3) ? queue.shift()! : queue.pop()!;
      cellsArray.push(cellId);
      if (cellsArray.length >= maxCells) break;

      cells.c[cellId].forEach(neibCellId => {
        if (usedCells[neibCellId] || cells.h[neibCellId] < 65) return;
        usedCells[neibCellId] = 1;
        queue.push(neibCellId);
      });
    }

    const name = `${Names.getCultureShort(cells.culture[startCell])}雪崩`;
    pack.zones.push({
      i: pack.zones.length,
      name,
      type: "Avalanche",
      cells: cellsArray,
      color: "url(#hatch5)"
    });
  }

  private addFault(usedCells: Uint8Array) {
    const cells = pack.cells;

    const elevatedCells = cells.i.filter(i => !usedCells[i] && cells.h[i] > 50 && cells.h[i] < 70);
    if (!elevatedCells.length) return;

    const startCell = ra(elevatedCells);
    usedCells[startCell] = 1;

    const cellsArray: number[] = [];
    const queue = [startCell];
    const maxCells = rand(3, 15);

    while (queue.length) {
      const cellId = queue.pop()!;
      if (cells.h[cellId] >= 20) cellsArray.push(cellId);
      if (cellsArray.length >= maxCells) break;

      cells.c[cellId].forEach(neibCellId => {
        if (usedCells[neibCellId] || cells.r[neibCellId]) return;
        usedCells[neibCellId] = 1;
        queue.push(neibCellId);
      });
    }

    const name = `${Names.getCultureShort(cells.culture[startCell])}断层`;
    pack.zones.push({
      i: pack.zones.length,
      name,
      type: "Fault",
      cells: cellsArray,
      color: "url(#hatch2)"
    });
  }

  private addFlood(usedCells: Uint8Array) {
    const cells = pack.cells;

    const fl = cells.fl.filter(Boolean);
    const meanFlux = mean(fl) ?? 0;
    const maxFlux = max(fl) ?? 0;
    const fluxThreshold = (maxFlux - meanFlux) / 2 + meanFlux;

    const bigRiverCells = cells.i.filter(
      i => !usedCells[i] && cells.h[i] < 50 && cells.r[i] && cells.fl[i] > fluxThreshold && cells.burg[i]
    );
    if (!bigRiverCells.length) return;

    const startCell = ra(bigRiverCells);
    usedCells[startCell] = 1;

    const riverId = cells.r[startCell];
    const cellsArray: number[] = [];
    const queue = [startCell];
    const maxCells = rand(5, 30);

    while (queue.length) {
      const cellId = queue.pop()!;
      cellsArray.push(cellId);
      if (cellsArray.length >= maxCells) break;

      cells.c[cellId].forEach(neibCellId => {
        if (
          usedCells[neibCellId] ||
          cells.h[neibCellId] < 20 ||
          cells.r[neibCellId] !== riverId ||
          cells.h[neibCellId] > 50 ||
          cells.fl[neibCellId] < meanFlux
        )
          return;
        usedCells[neibCellId] = 1;
        queue.push(neibCellId);
      });
    }

    const name = `${pack.burgs[cells.burg[startCell]].name!}洪水`;
    pack.zones.push({
      i: pack.zones.length,
      name,
      type: "Flood",
      cells: cellsArray,
      color: "url(#hatch13)"
    });
  }

  private addTsunami(usedCells: Uint8Array) {
    const { cells, features } = pack;

    const coastalCells = cells.i.filter(
      i => !usedCells[i] && cells.t[i] === -1 && features[cells.f[i]].type !== "lake"
    );
    if (!coastalCells.length) return;

    const startCell = ra(coastalCells);
    usedCells[startCell] = 1;

    const cellsArray: number[] = [];
    const queue = [startCell];
    const maxCells = rand(10, 30);

    while (queue.length) {
      const cellId = queue.shift()!;
      if (cells.t[cellId] === 1) cellsArray.push(cellId);
      if (cellsArray.length >= maxCells) break;

      cells.c[cellId].forEach(neibCellId => {
        if (usedCells[neibCellId]) return;
        if (cells.t[neibCellId] > 2) return;
        if (pack.features[cells.f[neibCellId]].type === "lake") return;
        usedCells[neibCellId] = 1;
        queue.push(neibCellId);
      });
    }

    const name = `${Names.getCultureShort(cells.culture[startCell])}海啸`;
    pack.zones.push({
      i: pack.zones.length,
      name,
      type: "Tsunami",
      cells: cellsArray,
      color: "url(#hatch13)"
    });
  }
}

// biome-ignore lint/suspicious/noRedeclare: legacy seam
export const Zones = new ZonesModule();
window.Zones = Zones;
