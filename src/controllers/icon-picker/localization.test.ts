// @vitest-environment jsdom

import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { type IconSetId, IconSets } from "@/components/icon-sets";
import { Icons } from "@/components/icons";
import { IconPicker } from ".";
import { matchesIconQuery, pickerIconName, pickerLabel } from "./localization";
import "@/generators/relief-generator";
import "@/generators/burgs-generator";
import "@/generators/goods-generator";
import "@/generators/emblems-generator";

interface DialogSettings {
  title?: string;
  close?: () => void;
  buttons?: Record<string, () => void>;
}

const dialogs = new Map<HTMLElement, DialogSettings>();

beforeEach(() => {
  dialogs.clear();
  options.map.customIcons = [];
  document.body.innerHTML = '<div id="dialogs"></div><div id="tooltip"></div>';
  vi.spyOn(Icons, "html").mockImplementation(id => `<svg><use href="#${id}"/></svg>`);
  vi.spyOn(Icons, "retry").mockResolvedValue(undefined);
  vi.stubGlobal("$", (element: HTMLElement) => ({
    dialog(settings: DialogSettings | string) {
      if (settings === "close") dialogs.get(element)?.close?.();
      else if (settings === "destroy") dialogs.delete(element);
      else if (typeof settings !== "string") {
        element.classList.add("ui-dialog-content");
        element.setAttribute("aria-label", settings.title ?? "");
        dialogs.set(element, settings);
      }
    }
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

function open(current = "goods-wood", live = false) {
  const onPick = vi.fn();
  IconPicker.open({ current, onPick, live });
  const dialog = document.getElementById("iconPicker")!;
  const search = dialog.querySelector<HTMLInputElement>(".search")!;
  return {
    dialog,
    onPick,
    search,
    show: (source: string) => dialog.querySelector<HTMLElement>(`nav [data-source="${source}"]`)!.click(),
    query: (value: string) => {
      search.value = value;
      search.dispatchEvent(new Event("input"));
      return [...dialog.querySelectorAll<HTMLElement>(".panel [data-icon]")].map(button => button.dataset.icon);
    }
  };
}

test("the rendered picker exposes Chinese names, title, accessible labels and search guidance", () => {
  const { dialog, search } = open();
  expect(dialog.getAttribute("aria-label")).toBe("选择图标");
  expect(Object.keys(dialogs.get(dialog)!.buttons!)).toEqual(["应用", "取消"]);
  expect(search.placeholder).toBe("搜索内置图标（支持中英文）");
  expect(search.getAttribute("aria-label")).toBe("搜索内置图标");
  expect(search.title).toBe("按名称或分类搜索内置图标和表情，支持中英混合检索");
  expect(dialog.querySelector(".current .name")!.textContent).toBe("木材");
  expect(dialog.querySelector(".current .from")!.textContent).toBe("商品");
  const tile = dialog.querySelector<HTMLElement>('[data-icon="goods-wood"]')!;
  expect(tile.title).toBe("木材");
  expect(tile.getAttribute("aria-label")).toBe("木材");
  expect(tile.dataset.tip).toBe("木材");
  const war = [...dialog.querySelectorAll<HTMLElement>("nav [data-source]")].find(
    button => button.dataset.source === "glyph/War & power"
  );
  expect(war?.textContent).toMatch(/^战争与权力/);
  expect(dialog.querySelector('nav [data-source="charges-beasts"]')!.textContent).toMatch(/^兽类/);
});

test("Chinese, mixed-language and original English queries find real tiles without changing their keys", () => {
  const { query, dialog } = open();
  expect(query("木材")).toEqual(["goods-tropicalTimber", "goods-wood"]);
  expect(query("  商品  WOOD  ")).toEqual(["goods-wood"]);
  expect(query("木材wood")).toEqual(["goods-wood"]);
  expect(query("木材 ＷＯＯＤ")).toEqual(["goods-wood"]);
  expect(query("Timber")).toEqual(["goods-tropicalTimber"]);
  expect(query("anchor")).toEqual(["glyph-2693", "ports-anchor", "charges-seafaring-anchor"]);
  expect(query("锚 anchor")).toEqual(["ports-anchor"]);
  expect(query("纹章 lion")).toContain("charges-beasts-lionRampant");
  const snow = query("雪山 colored");
  expect(snow).toHaveLength(6);
  expect(snow).toContain("relief-colored-mountSnow-2");
  expect(dialog.querySelector<HTMLElement>('[data-icon="relief-colored-mountSnow-2"]')!.title).toBe("雪山 2");
  expect(query("does not exist <img src=x>")).toEqual([]);
  expect(dialog.querySelector(".empty")!.textContent).toBe(
    "未找到名称或分类匹配“does not exist <img src=x>”的内置图标。"
  );
  expect(dialog.querySelector(".empty img")).toBeNull();
  query("");
  expect(dialog.querySelector<HTMLElement>("nav .active")!.dataset.source).toBe("goods");
});

test("Chinese names still select the original id only on Apply, while live Cancel restores the original", () => {
  const chosen = open();
  chosen.query("铁 iron");
  chosen.dialog.querySelector<HTMLElement>('[data-icon="goods-iron"]')!.click();
  expect(chosen.dialog.querySelector(".current .name")!.textContent).toBe("铁");
  expect(chosen.onPick).not.toHaveBeenCalled();
  dialogs.get(chosen.dialog)!.buttons!.应用();
  expect(chosen.onPick).toHaveBeenCalledExactlyOnceWith("goods-iron");

  const live = open("goods-wood", true);
  live.dialog.querySelector<HTMLElement>('[data-icon="goods-iron"]')!.click();
  expect(live.onPick).toHaveBeenLastCalledWith("goods-iron");
  dialogs.get(live.dialog)!.buttons!.取消();
  expect(live.onPick).toHaveBeenLastCalledWith("goods-wood");
});

test.each([
  ["goods", 72],
  ["ports", 2],
  ["relief-simple", 18],
  ["relief-colored", 34],
  ["relief-gray", 34],
  ["relief-illustrated", 34],
  ["relief-stickers", 34]
] as const)("the bounded %s catalog renders Chinese title and aria for all %i actual files", (set, count) => {
  const { dialog, show } = open();
  show(set);
  const tiles = [...dialog.querySelectorAll<HTMLButtonElement>(".choices [data-icon]")];
  expect(tiles).toHaveLength(count);
  expect(tiles.map(tile => tile.dataset.icon)).toEqual(
    IconSets.files(set as IconSetId).map(file => IconSets.symbolId(set, file))
  );
  for (const tile of tiles) {
    expect(tile.title, tile.dataset.icon).toMatch(/\p{Script=Han}/u);
    expect(tile.getAttribute("aria-label"), tile.dataset.icon).toBe(tile.title);
    expect(tile.dataset.tip, tile.dataset.icon).toBe(tile.title);
  }
});

test("new or foreign catalog names are not guessed from familiar substrings", () => {
  expect(pickerIconName("goods-new-art", "new art", null, Relief.types)).toBe("New art");
  expect(pickerIconName("relief-foreign-mount-1", "foreign mount", null, Relief.types)).toBe("Foreign mount");
  expect(pickerIconName("relief-simple-mount-99", "mount 99", null, Relief.types)).toBe("Mount 99");
  expect(pickerLabel("Unknown Artist")).toBe("Unknown Artist");
  expect(pickerLabel("constructor")).toBe("constructor");
  expect(pickerIconName("goods-constructor", "constructor", null, Relief.types)).toBe("Constructor");
  expect(matchesIconQuery('"quoted"', ['a "quoted" icon'])).toBe(true);
});

test("uncovered artwork retains original names and user text and custom picture data are never translated", () => {
  const foreign = open("charges-beasts-lionRampant");
  expect(foreign.dialog.querySelector(".current .name")!.textContent).toBe("Lion Rampant");
  expect(foreign.dialog.querySelector<HTMLElement>('[data-icon="charges-beasts-lionRampant"]')!.title).toBe(
    "Lion Rampant"
  );

  const text = 'wood 木材 <hero> "custom"';
  const glyph = Icons.glyph(text);
  const typed = open(glyph, true);
  expect(typed.dialog.querySelector(".current .name")!.textContent).toBe(text);
  const input = typed.dialog.querySelector<HTMLInputElement>(".glyphText input")!;
  expect(input.getAttribute("aria-label")).toBe("自定义文字");
  expect(input.value).toBe(text);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  expect(typed.onPick).toHaveBeenLastCalledWith(glyph);
  expect(Icons.glyphText(glyph)).toBe(text);

  const picture = {
    id: "custom-1234abcd",
    kind: "svg" as const,
    content: "<svg><text>wood 用户标签</text></svg>",
    viewBox: "0 0 100 100"
  };
  options.map.customIcons = [picture];
  const snapshot = JSON.stringify(options.map.customIcons);
  const custom = open(picture.id);
  expect(custom.dialog.querySelector<HTMLInputElement>(".customAdd input")!.placeholder).toBe("粘贴图片链接");
  expect(custom.dialog.querySelector<HTMLElement>('[data-action="remove"]')!.getAttribute("aria-label")).toBe(
    "移除图标"
  );
  expect(custom.dialog.querySelector<HTMLElement>('[data-icon="custom-1234abcd"]')!.title).toBe("自定义图标");
  custom.query("木材");
  custom.query("");
  expect(JSON.stringify(options.map.customIcons)).toBe(snapshot);
});
