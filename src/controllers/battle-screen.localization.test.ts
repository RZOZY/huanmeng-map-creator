// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { tip } from "@/components/tooltips";
import type { Marker } from "@/generators/markers-generator";
import type { Regiment } from "@/generators/military-generator";
import { BattleScreen } from "./battle-screen";

const choices = vi.hoisted(() => ({ airBattle: true, defenderResult: false }));

vi.mock("@/components/dialog/dialog-helpers", () => ({ closeDialogs: vi.fn() }));
vi.mock("@/components/dialog/sorting", () => ({ applySorting: vi.fn(), applySortingByHeader: vi.fn() }));
vi.mock("@/components/icons", () => ({ Icons: { html: () => "", href: () => "#sword", glyph: () => "⚔️" } }));
vi.mock("@/components/layers", () => ({ Layers: { draw: vi.fn() } }));
vi.mock("@/components/tooltips", () => ({ tip: vi.fn() }));
vi.mock("@/renderers/draw-military", () => ({ moveRegiment: vi.fn() }));
vi.mock("@/utils", async importOriginal => ({
  ...(await importOriginal<typeof import("@/utils")>()),
  P: (probability: number) =>
    probability >= 1 || (probability === 0.8 && choices.airBattle) || (probability === 0.7 && choices.defenderResult),
  rand: () => 1
}));

const originalNote = "Captain Morgan's Own. https://example.com/record?year=42";
let attacker: Regiment;
let defender: Regiment;
let markers: Marker[];
let dialogTitle: string;
let dialogs: Map<string, DialogOptions>;

interface DialogOptions {
  title?: string;
  close?: () => void;
  buttons?: Record<string, () => void>;
}

function element<T extends HTMLElement = HTMLElement>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Missing ${selector}`);
  return node;
}

function regiment(state: number, count = 100): Regiment {
  return {
    i: 0,
    t: count,
    name: state === 1 ? "Morgan's Own 7" : "Old Guard 9",
    a: count,
    s: 0,
    cell: 0,
    x: 10,
    y: 20,
    bx: 10,
    by: 20,
    u: { infantry: count },
    n: 0,
    type: "melee",
    icon: "sword",
    state,
    px: 10,
    py: 20,
    note: originalNote
  };
}

function open(): void {
  BattleScreen.open(attacker, defender);
}

function changeType(type: string): void {
  element(`#battleBottom [data-type="${type}"]`).click();
}

function changePhase(side: "attackers" | "defenders", phase: string): void {
  element(`#battlePhase_${side} + .battlePhases [data-phase="${phase}"]`).click();
}

function apply(): Marker {
  element("#battleApply").click();
  return markers.at(-1)!;
}

beforeEach(() => {
  vi.clearAllMocks();
  choices.airBattle = true;
  choices.defenderResult = false;
  dialogTitle = "";
  dialogs = new Map();
  document.documentElement.lang = "en";
  document.body.innerHTML = '<div id="dialogs"></div><svg><g id="armies"></g></svg>';
  attacker = regiment(1);
  defender = regiment(2);
  markers = [
    {
      i: 4,
      type: "battlefields",
      icon: "⚔️",
      x: 1,
      y: 2,
      cell: 0,
      name: "Battle of Old Ford 7",
      note: "Legacy siege report: https://example.com/legacy?year=1234"
    }
  ];
  vi.stubGlobal("customization", 0);
  vi.stubGlobal("pack", {
    cells: { burg: [1], culture: [0], r: [0], biome: [0] },
    burgs: [{}, { name: "Old Ford 42", walls: false, citadel: false }],
    states: [
      { i: 0, name: "Neutral" },
      { i: 1, name: "Northland", fullName: "Kingdom of Northland", military: [attacker] },
      { i: 2, name: "Dawn", fullName: "Dawn Republic", military: [defender] }
    ],
    markers
  });
  vi.stubGlobal("Pack", { findCell: () => 0 });
  vi.stubGlobal("Military", { getTotal: (r: Regiment) => String(r.a) });
  vi.stubGlobal("Names", {
    getCulture: () => "Éowen 17",
    getBase: () => "River Watch 23",
    nameBases: ["First", "Second"]
  });
  vi.stubGlobal("options", {
    map: {
      military: {
        units: [
          { name: "infantry", type: "melee", power: 1, icon: "sword" },
          { name: "archers", type: "ranged", power: 1, icon: "bow" },
          { name: "Moon Guard", type: "melee", power: 1, icon: "sword" },
          { name: "fleet", type: "naval", power: 1, icon: "ship" },
          { name: "Sky Guard", type: "aviation", power: 1, icon: "wing" }
        ]
      },
      units: { distance: { scale: 1, unit: "mi" }, population: { scale: 10 } },
      lore: { calendar: { year: 1234, eraShort: "CE" } }
    }
  });
  vi.stubGlobal("$", (selector: string) => ({
    dialog: (options: string | DialogOptions) => {
      if (typeof options === "object") {
        dialogs.set(selector, { ...dialogs.get(selector), ...options });
        if (options.title !== undefined) dialogTitle = options.title;
      } else if (options === "close") dialogs.get(selector)?.close?.();
      else if (options === "destroy") dialogs.delete(selector);
    }
  }));
});

afterEach(() => {
  if (document.getElementById("battleScreen")) element("#battleCancel").click();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Chinese default battle names", () => {
  test.each([
    ["field", "Old Ford 42之战", "野战"],
    ["naval", "Old Ford 42海战", "海战"],
    ["siege", "Old Ford 42围城战", "围城战"],
    ["ambush", "Old Ford 42伏击战", "伏击战"],
    ["landing", "Old Ford 42登陆战", "登陆战"],
    ["air", "Old Ford 42空战", "空战"]
  ])("generates %s names and result types without changing places or internal type keys", (type, expected, label) => {
    open();
    if (type !== "field") changeType(type);
    expect(dialogTitle).toBe(expected);
    expect(element("#battleType").className).toBe(`icon-button-${type}`);
    expect(element(`[data-type="${type}"]`).dataset.type).toBe(type);
    expect(attacker.name).toBe("Morgan's Own 7");
    expect(pack.burgs[1].name).toBe("Old Ford 42");
    expect(apply().note).toContain(`这场${label}的结果为：对峙。`);
  });

  test("localizes the alternate air-battle name", () => {
    choices.airBattle = false;
    open();
    changeType("air");
    expect(dialogTitle).toBe("Old Ford 42空中缠斗");
  });

  test.each([
    ["Culture", "Éowen 17"],
    ["Random", "River Watch 23"]
  ])("keeps the %s-generated place verbatim", (source, place) => {
    open();
    element(`#battleName${source}`).click();
    expect(element<HTMLInputElement>("#battleNamePlace").value).toBe(place);
    expect(element<HTMLInputElement>("#battleNameFull").value).toBe(`${place}之战`);
    expect(dialogTitle).toBe(`${place}之战`);
  });
});

describe("Chinese generated battle results", () => {
  test("appends Chinese reports while preserving user text, old records, unit keys, numbers and URLs", () => {
    const oldMarker = { ...markers[0] };
    attacker.u = { infantry: 100, archers: 40, "Moon Guard": 5 };
    attacker.a = 145;
    const originalUnits = { ...attacker.u };
    open();
    const customName = "My Siege of Dawn 88 https://example.com/battle?id=7";
    const name = element<HTMLInputElement>("#battleNameFull");
    name.value = customName;
    name.dispatchEvent(new Event("change"));
    const marker = apply();

    expect(marker.name).toBe(customName);
    expect(marker.type).toBe("battlefields");
    expect(markers[0]).toEqual(oldMarker);
    expect(attacker.name).toBe("Morgan's Own 7");
    expect(attacker.u).toEqual(originalUnits);
    expect(attacker.note).toBe(
      `${originalNote}<br><br>${customName}（1234 CE）：对峙。该部队毫发无损。初始兵力：100 步兵、40 弓手、5 Moon Guard。`
    );
    expect(marker.note).toContain(
      `${customName}发生于1234 CE。交战双方为Northland的Morgan's Own 7与Dawn的Old Guard 9。`
    );
    expect(marker.note).toContain("这场野战的结果为：对峙。");
    expect(marker.note).toContain("进攻方损失：0%，防守方损失：0%。");
    expect(marker.note).toContain("<br>进攻方初始兵力：100 步兵、40 弓手、5 Moon Guard。");
    expect(marker.note).toContain("<br>防守方初始兵力：100 步兵。");
    expect(tip).toHaveBeenLastCalledWith(`${customName}已结束。这场野战的结果为：对峙`, true, "success", 4000);
  });

  test.each([
    [99, 1, 0.99, "进攻方完胜", "防守方溃退"],
    [80, 20, 0.99, "进攻方决定性胜利", "防守方惨败"],
    [65, 35, 0.99, "进攻方获胜", "防守方战败"],
    [50, 50, 0.99, "僵持", "僵持"],
    [35, 65, 0.99, "进攻方战败", "防守方获胜"],
    [10, 90, 0.99, "进攻方溃退", "防守方完胜"],
    [50, 50, 0.1, "小规模交锋", "小规模交锋"]
  ])("describes the outcome for forces %i:%i and casualty roll %s", (countA, countD, roll, statusA, statusD) => {
    attacker = regiment(1, countA);
    defender = regiment(2, countD);
    open();
    changePhase("attackers", "melee");
    changePhase("defenders", "melee");
    vi.spyOn(Math, "random").mockReturnValue(roll);
    element("#battleRun").click();
    choices.defenderResult = true;
    const marker = apply();
    expect(attacker.note).toContain(`：${statusA}。该部队`);
    expect(defender.note).toContain(`：${statusD}。该部队`);
    expect(marker.note).toContain(`这场野战的结果为：${statusD}。`);
  });

  test.each([
    [100, "全军覆没"],
    [91, "几乎全军覆没"],
    [90, "濒临覆灭"],
    [76, "濒临覆灭"],
    [75, "遭受毁灭性打击"],
    [61, "遭受毁灭性打击"],
    [60, "遭受灾难性损失"],
    [46, "遭受灾难性损失"],
    [45, "遭受严重损失"],
    [31, "遭受严重损失"],
    [30, "遭受重大损失"],
    [21, "遭受重大损失"],
    [20, "损失较大"],
    [11, "损失较大"],
    [10, "损失明显"],
    [6, "损失明显"],
    [5, "损失轻微"],
    [1, "损失轻微"],
    [0, "毫发无损"]
  ])("describes %i percent regiment losses without changing casualty numbers", (losses, status) => {
    open();
    attacker.casualties = { infantry: -losses };
    attacker.survivors = { infantry: 100 - losses };
    const marker = apply();
    expect(attacker.note).toContain(`该部队${status}。`);
    expect(attacker.u).toEqual({ infantry: 100 - losses });
    expect(attacker.a).toBe(100 - losses);
    if (losses) {
      expect(attacker.note).toContain(`伤亡：${losses} 步兵。`);
      expect(marker.note).toContain(`伤亡：${losses} 步兵。`);
    } else expect(attacker.note).not.toContain("伤亡：");
  });

  test.each(["attackers", "defenders"] as const)(
    "describes multiple %s regiments without altering state names",
    side => {
      open();
      const addition = regiment(side === "attackers" ? 2 : 1, 150);
      addition.i = 1;
      addition.name = "Reinforcements 11";
      pack.states[addition.state].military!.push(addition);
      element("#battleAddRegiment").click();
      element(`#regimentSelectorBody [data-s="${addition.state}"][data-i="1"]`).click();
      dialogs.get("#regimentSelectorScreen")!.buttons![`Add to ${side}`]();
      const marker = apply();
      expect(marker.note).toContain(side === "attackers" ? "Northland、Dawn的军团" : "Dawn、Northland的部队");
      expect(marker.note).toContain(`${side === "attackers" ? "进攻方" : "防守方"}初始兵力：250 步兵。`);
      expect(addition.name).toBe("Reinforcements 11");
      expect(pack.states[1].name).toBe("Northland");
      expect(pack.states[2].name).toBe("Dawn");
    }
  );

  test.each([
    ["field", "skirmish", "远程交锋", "melee", "近战"],
    ["field", "retreat", "撤退", "pursue", "追击"],
    ["naval", "shelling", "炮击", "boarding", "登船战"],
    ["naval", "chase", "海上追击", "withdrawal", "海上撤退"],
    ["siege", "blockade", "封锁", "sheltering", "据城防守"],
    ["siege", "bombardment", "轰击", "sortie", "出击"],
    ["siege", "storming", "攻城", "defense", "防御"],
    ["siege", "looting", "劫掠", "surrendering", "投降"],
    ["ambush", "shock", "慌乱", "surprise", "突袭"],
    ["landing", "landing", "登陆", "waiting", "等待"],
    ["landing", "flee", "逃离", "shock", "慌乱"],
    ["air", "maneuvering", "机动", "dogfight", "空中缠斗"]
  ])("describes %s progression: %s → %s; %s → %s", (type, phaseA, labelA, phaseD, labelD) => {
    if (type === "naval" || type === "air") {
      const unit = type === "naval" ? "fleet" : "Sky Guard";
      attacker.u = { [unit]: 100 };
      defender.u = { [unit]: 100 };
      attacker.n = defender.n = type === "naval" ? 1 : 0;
    }
    open();
    if (type !== "field") changeType(type);
    changePhase("attackers", phaseA);
    changePhase("defenders", phaseD);
    expect(element("#battlePhase_attackers").className).toBe(`icon-button-${phaseA}`);
    expect(element("#battlePhase_defenders").className).toBe(`icon-button-${phaseD}`);
    vi.spyOn(Math, "random").mockReturnValue(0);
    element("#battleRun").click();
    expect(apply().note).toContain(`<br><br>交战过程：<br>进攻方：${labelA}，防守方：${labelD}`);
  });

  test("generates Chinese progression with unchanged phase keys and iteration counts", () => {
    open();
    changePhase("attackers", "melee");
    changePhase("defenders", "melee");
    vi.spyOn(Math, "random").mockReturnValue(0);
    element("#battleRun").click();
    element("#battleRun").click();
    expect(element("#battlePhase_attackers").className).toBe("icon-button-melee");
    expect(element('[data-phase="melee"]').dataset.phase).toBe("melee");
    const marker = apply();
    expect(marker.note).toContain("<br><br>交战过程：<br>进攻方：近战，防守方：近战 (x2)");
  });
});
