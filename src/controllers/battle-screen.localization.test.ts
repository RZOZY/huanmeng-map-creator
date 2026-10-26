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

describe("Chinese battle-screen chrome", () => {
  test("renders translated side labels, controls and battle-type tips in the real dialog", () => {
    open();
    expect([...document.querySelectorAll("#battleBody > div > span")].map(node => node.textContent)).toEqual([
      "进攻方",
      "防守方"
    ]);
    const tips: Record<string, string> = {
      battlePower_attackers: "进攻方在当前阶段的战斗力，决定造成的伤害",
      battlePower_defenders: "防守方在当前阶段的战斗力，决定造成的伤害",
      battleDie_attackers: "进攻方的随机因子，点击重新掷骰",
      battleDie_defenders: "防守方的随机因子，点击重新掷骰",
      battleType: "战斗类型，点击更改",
      battleNameShow: "设置战斗名称",
      battleNameHide: "隐藏战斗名称设置",
      battleNamePlace: "输入地点名称",
      battleNameFull: "输入完整战斗名称",
      battleNameCulture: "根据文化生成地点和战斗名称",
      battleNameRandom: "随机生成地点和战斗名称",
      battleAddRegiment: "向战斗中添加部队",
      battleRoll: "掷骰以更新随机因子",
      battleRun: "推进一轮战斗",
      battleApply: "结束战斗：应用当前结果并关闭窗口",
      battleCancel: "取消战斗：撤销结果并关闭窗口",
      battleWiki: "打开战斗模拟教程"
    };
    for (const [id, text] of Object.entries(tips)) expect(element(`#${id}`).dataset.tip).toBe(text);
    for (const [side, label] of [
      ["attackers", "进攻方"],
      ["defenders", "防守方"]
    ]) {
      const meter = element<HTMLMeterElement>(`#battleMorale_${side}`);
      expect(meter.dataset.tip).toBe(`${label}士气：${meter.value}`);
      expect([meter.min, meter.max, meter.low, meter.high, meter.optimum]).toEqual([0, 100, 33, 66, 80]);
    }
    expect(
      [...document.querySelectorAll<HTMLElement>(".battleTypes button")].map(node => [
        node.dataset.type,
        node.dataset.tip
      ])
    ).toEqual([
      ["field", "野战：常规战斗"],
      ["naval", "海战：舰船之间的战斗"],
      ["siege", "围城战：封锁并攻打城镇"],
      ["ambush", "伏击战：发动突袭"],
      ["landing", "登陆战：两栖进攻"],
      ["air", "空战：航空单位的机动作战"]
    ]);
    element("#battleNameShow").click();
    expect(element("#battleNameSection").style.display).toBe("inline-block");
    expect(element<HTMLInputElement>("#battleNameFull").value).toBe("Old Ford 42之战");
    element("#battleNameHide").click();
    expect(element("#battleNameSection").style.display).toBe("none");
  });

  test("translates force headers and rows without rewriting custom units, army names or quantities", () => {
    const unitNames = ["infantry", "archers", "cavalry", "artillery", "fleet", "moon_guard 77"];
    options.map.military.units = unitNames.map(name => ({ ...options.map.military.units[0], name }));
    attacker.bx = defender.bx = 7;
    attacker.by = defender.by = 16;
    open();
    for (const table of ["battleAttackers", "battleDefenders"]) {
      expect(
        [...element(`#${table}`).querySelectorAll("th[data-tip]")].map(node => node.getAttribute("data-tip"))
      ).toEqual(["步兵", "弓手", "骑兵", "炮兵", "舰船", "moon_guard 77", "总兵力"]);
      expect(element(`#${table} th:last-child`).textContent).toBe("总计");
      expect(element(`#${table} .battleSurvivors td:nth-child(2)`).textContent).toBe("距基地：5 mi");
      expect(element(`#${table} .battleSurvivors td:nth-child(2)`).dataset.tip).toBe("补给线长度，影响士气");
      for (const [row, text, count] of [
        ["battleInitial", "初始兵力", "100"],
        ["battleCasualties", "伤亡", "0"],
        ["battleSurvivors", "幸存兵力", "100"]
      ]) {
        const cells = [...element(`#${table} .${row}`).querySelectorAll<HTMLElement>("td")].slice(2);
        expect(cells.map(cell => cell.dataset.tip)).toEqual(Array(7).fill(text));
        expect(cells.at(-1)!.textContent).toBe(count);
      }
    }
    expect(element("#battleAttackers .regiment").textContent).toBe("Morgan's Own 7");
    expect(element("#battleDefenders .battleCasualties td:nth-child(2)").textContent).toBe("Dawn Republic");
    expect(options.map.military.units.map(unit => unit.name)).toEqual(unitNames);
    expect(attacker.u).toEqual({ infantry: 100 });
  });

  const phaseTips: Record<string, string> = {
    skirmish: "远程交锋阶段：远程单位占优",
    melee: "近战阶段：近战单位占优",
    pursue: "追击阶段：骑乘单位占优",
    retreat: "撤退阶段：单位战斗力降低",
    shelling: "炮击阶段：舰炮轰击敌方舰队",
    boarding: "登船战阶段：近战单位登上敌舰作战",
    chase: "海上追击阶段：舰船追击敌方舰队，偶尔开炮",
    withdrawal: "海上撤退阶段：舰船尝试摆脱敌方舰队",
    blockade: "封锁阶段：准备或维持封锁",
    bombardment: "轰击阶段：攻城器械攻击敌方",
    storming: "攻城阶段：强攻敌方城镇，近战单位占优",
    looting: "劫掠阶段：洗劫城镇，单位战斗力提高",
    sheltering: "据城防守阶段：在城墙后隐蔽待命",
    sortie: "出击阶段：从被围城镇出击，近战单位占优",
    defense: "防御阶段：远程和近战单位占优",
    surrendering: "投降阶段：放弃防御，单位战斗力降低",
    shock: "慌乱阶段：单位战斗力降低",
    surprise: "突袭阶段：单位战斗力提高，远程单位占优",
    landing: "登陆阶段：两栖进攻，单位易受有备防御的打击",
    flee: "逃离阶段：单位战斗力降低",
    waiting: "等待阶段：无法追击逃离的舰船",
    maneuvering: "机动阶段：单位战斗力降低",
    dogfight: "空中缠斗阶段：单位战斗力提高"
  };

  test.each([
    ["field", "attackers", ["skirmish", "melee", "pursue", "retreat"]],
    ["field", "defenders", ["skirmish", "melee", "pursue", "retreat"]],
    ["naval", "attackers", ["shelling", "boarding", "chase", "withdrawal"]],
    ["naval", "defenders", ["shelling", "boarding", "chase", "withdrawal"]],
    ["siege", "attackers", ["blockade", "bombardment", "storming", "looting", "retreat"]],
    ["siege", "defenders", ["sheltering", "sortie", "bombardment", "defense", "surrendering", "pursue"]],
    ["ambush", "attackers", ["shock", "melee", "pursue", "retreat"]],
    ["ambush", "defenders", ["surprise", "melee", "pursue", "retreat"]],
    ["landing", "attackers", ["landing", "melee", "pursue", "flee"]],
    ["landing", "defenders", ["shock", "defense", "melee", "waiting", "pursue", "retreat"]],
    ["air", "attackers", ["maneuvering", "dogfight", "pursue", "retreat"]],
    ["air", "defenders", ["maneuvering", "dogfight", "pursue", "retreat"]]
  ] as const)("clones Chinese %s phase tips and selects them for %s", (type, side, phases) => {
    open();
    if (type !== "field") changeType(type);
    const expectedTips = phases.map(phase => {
      if (type === "air" && phase === "pursue") return "追击阶段：单位战斗力提高";
      if (type === "landing" && side === "defenders") {
        if (phase === "shock") return "慌乱阶段：单位尚未做好防御准备";
        if (phase === "defense") return "防御阶段：有备防御，单位战斗力提高";
        if (phase === "pursue") return "追击阶段：尝试拦截逃离的进攻方，骑乘单位占优";
      }
      return phaseTips[phase];
    });
    const buttons = [...element(`#battlePhase_${side} + .battlePhases`).querySelectorAll<HTMLButtonElement>("button")];
    expect(buttons.map(button => button.dataset.phase)).toEqual(phases);
    expect(buttons.map(button => button.dataset.tip)).toEqual(expectedTips);
    buttons.forEach((button, index) => {
      button.click();
      expect(element(`#battlePhase_${side}`).dataset.tip).toBe(expectedTips[index]);
      expect(element(`#battlePhase_${side}`).className).toBe(`icon-button-${phases[index]}`);
    });
    expect(element("#battleType").className).toBe(`icon-button-${type}`);
    expect(attacker.u).toEqual({ infantry: 100 });
  });

  test("renders Chinese reinforcement headers and preserves sorting keys and custom names", () => {
    open();
    element("#battleAddRegiment").click();
    const dialog = dialogs.get("#regimentSelectorScreen")!;
    expect(dialog.title).toBe("向战斗中添加部队");
    expect(Object.keys(dialog.buttons!)).toEqual(["加入进攻方", "加入防守方", "取消"]);
    expect(
      [...element("#regimentSelectorHeader").children].map(node => [
        (node as HTMLElement).dataset.sortby,
        node.textContent!.trim(),
        (node as HTMLElement).dataset.tip
      ])
    ).toEqual([
      ["state", "国家", "点击按国家名称排序"],
      ["regiment", "部队", "点击按部队名称排序"],
      ["total", "总计", "点击按总兵力排序"],
      ["distance", "距离", "点击按距战场的距离排序"]
    ]);
    const row = element('#regimentSelectorBody [data-s="1"][data-i="0"]');
    expect(row.dataset.tip).toBe("点击选择部队");
    expect(row.textContent).toContain("Northland");
    expect(row.textContent).toContain("Morgan's Own 7");
    expect([...row.querySelectorAll("div")].slice(-2).map(node => node.textContent)).toEqual(["100", "0 mi"]);
    dialog.buttons!.取消();
    expect(element("#regimentSelectorBody").children).toHaveLength(0);
    expect(element("#battleScreen")).toBeTruthy();
  });

  test.each([0, 1])("requests selection in Chinese before reinforcement action %i", index => {
    open();
    element("#battleAddRegiment").click();
    Object.values(dialogs.get("#regimentSelectorScreen")!.buttons!)[index]();
    expect(tip).toHaveBeenLastCalledWith("请先选择一支部队", false, "error");
    expect(element("#regimentSelectorBody").children).toHaveLength(2);
  });

  test("rejects an already participating regiment with a Chinese message", () => {
    open();
    element("#battleAddRegiment").click();
    const row = element('#regimentSelectorBody [data-s="1"][data-i="0"]');
    row.click();
    expect(tip).toHaveBeenLastCalledWith("该部队已在战斗中", false, "error");
    expect(row.classList.contains("selected")).toBe(false);
  });

  test.each([
    ["attackers", "进攻方军队已被消灭"],
    ["defenders", "防守方军队已被消灭"]
  ])("warns in Chinese when %s have no strength without mutating forces or logs", (side, message) => {
    if (side === "attackers") attacker.u = { infantry: 0 };
    else defender.u = { infantry: 0 };
    const unitsA = { ...attacker.u };
    const unitsD = { ...defender.u };
    open();
    expect(element(`#battlePower_${side}`).textContent).toBe("0");
    element("#battleRun").click();
    expect(tip).toHaveBeenLastCalledWith(message, false, "warn");
    expect(attacker.u).toEqual(unitsA);
    expect(defender.u).toEqual(unitsD);
    expect(attacker.note).toBe(originalNote);
    expect(defender.note).toBe(originalNote);
    expect(markers).toHaveLength(1);
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
      dialogs.get("#regimentSelectorScreen")!.buttons![side === "attackers" ? "加入进攻方" : "加入防守方"]();
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
