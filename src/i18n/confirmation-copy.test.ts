// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { burgRemovalCopy, renderProvinceMergeForm, renderStateMergeForm } from "./confirmation-copy";

const states = [
  { i: 2, fullName: "Northern Kingdom", color: "#123456" },
  { i: 9, fullName: "南国", color: "#abcdef" }
];
const provinces = [
  { i: 4, name: "北郡", fullName: "Northern Province", color: "#112233" },
  { i: 12, name: "South", fullName: "", color: "#aabbcc" }
];
const emblem = (id: number) => `<svg class="coaIcon"><use href="#emblem${id}"></use></svg>`;

function parseHtml(html: string): HTMLDivElement {
  const container = document.createElement("div");
  container.innerHTML = html;
  return container;
}

function normalizedText(element: Element): string {
  return element.textContent.replace(/\s+/g, " ").trim();
}

function inputAttributes(form: HTMLFormElement) {
  return [...form.querySelectorAll("input")].map(input => ({
    id: input.id,
    type: input.type,
    name: input.name,
    value: input.value,
    className: input.className,
    checked: input.checked,
    defaultChecked: input.defaultChecked,
    disabled: input.disabled
  }));
}

function expectedInputs(ids: number[], kind: "State" | "Province") {
  const plural = kind === "State" ? "statesToMerge" : "provincesToMerge";
  return ids.flatMap(id => [
    {
      id: "",
      type: "radio",
      name: `ruling${kind}`,
      value: String(id),
      className: "",
      checked: false,
      defaultChecked: false,
      disabled: false
    },
    {
      id: `select${kind}${id}`,
      type: "checkbox",
      name: plural,
      value: String(id),
      className: "checkbox",
      checked: false,
      defaultChecked: false,
      disabled: false
    }
  ]);
}

describe("burgRemovalCopy", () => {
  it.each([0, 1, 23, 1000])("keeps the removal count %i in the Chinese title", count => {
    expect(burgRemovalCopy(count).title).toBe(`删除 ${count} 个城镇`);
  });

  it("renders the complete exclusions and capital warning without runtime translation", () => {
    const message = parseHtml(burgRemovalCopy(23).message);
    expect(normalizedText(message)).toBe(
      "确定要删除除首都和市场中心之外的所有未锁定城镇吗？ 如需删除首都，必须先删除其所属国家"
    );
    expect([...message.querySelectorAll("i")].map(node => node.textContent)).toEqual([
      "未锁定",
      "如需删除首都，必须先删除其所属国家"
    ]);
    expect(message.querySelectorAll("br")).toHaveLength(1);
    expect(message.textContent).not.toMatch(/[A-Za-z]/);
  });
});

describe("renderStateMergeForm", () => {
  it("renders complete Chinese instructions and preserves emphasis and form layout", () => {
    const container = parseHtml(renderStateMergeForm(states, emblem));
    const form = container.querySelector<HTMLFormElement>("#mergeStatesForm")!;
    const description = form.querySelector("p")!;

    expect(normalizedText(description)).toBe(
      "勾选要合并的各国旁的复选框。 使用单选按钮选择将吞并其他国家的主导国家（保留其名称、颜色和首都）。 将鼠标悬停在某一行上，可在地图上高亮该国家。"
    );
    expect(description.textContent).not.toMatch(/[A-Za-z]/);
    expect([...description.querySelectorAll("b")].map(node => node.textContent)).toEqual(["复选框", "单选按钮"]);
    expect(description.querySelector("em")?.textContent).toBe("主导国家");
    expect([...form.children].map(node => node.tagName)).toEqual(["P", "MAIN"]);
    expect(form.style.display).toBe("flex");
    expect(form.style.flexDirection).toBe("column");
    expect(form.querySelector("main")?.style.gridTemplateColumns).toBe("1fr 1fr");
  });

  it("preserves state ids, form names, values, unchecked defaults, labels, colors and emblems", () => {
    const form = parseHtml(renderStateMergeForm(states, emblem)).querySelector("form")!;
    expect(inputAttributes(form)).toEqual(expectedInputs([2, 9], "State"));
    expect([...new FormData(form)]).toEqual([]);

    for (const state of states) {
      const row = form.querySelector<HTMLElement>(`div[data-id="${state.i}"]`)!;
      const label = row.querySelector("label")!;
      expect(row.dataset.tip).toBe(state.fullName);
      expect(row.style.cursor).toBe("default");
      expect(label.htmlFor).toBe(`selectState${state.i}`);
      expect(label.className).toBe("checkbox-label");
      expect(label.textContent).toBe(state.fullName);
      expect(label.querySelector("fill-box")?.getAttribute("fill")).toBe(state.color);
      expect(label.querySelector("fill-box")?.hasAttribute("disabled")).toBe(true);
      expect(label.querySelector("use")?.getAttribute("href")).toBe(`#emblem${state.i}`);
    }
  });

  it("submits the same ruling-state and selected-state keys used by the controller", () => {
    const form = parseHtml(renderStateMergeForm(states, emblem)).querySelector("form")!;
    form.querySelector<HTMLInputElement>('input[name="rulingState"][value="9"]')!.checked = true;
    form.querySelectorAll<HTMLInputElement>('input[name="statesToMerge"]').forEach(input => {
      input.checked = true;
    });

    const data = new FormData(form);
    expect(data.get("rulingState")).toBe("9");
    expect(data.getAll("statesToMerge")).toEqual(["2", "9"]);
  });
});

describe("renderProvinceMergeForm", () => {
  it("renders complete Chinese instructions and preserves emphasis and form layout", () => {
    const form = parseHtml(renderProvinceMergeForm(provinces, emblem)).querySelector("form")!;
    const description = form.querySelector("p")!;

    expect(form.id).toBe("mergeProvincesForm");
    expect(normalizedText(description)).toBe(
      "勾选要合并的各省份旁的复选框。 使用单选按钮选择将合并其他省份的主导省份。 将鼠标悬停在某一行上，可在地图上高亮该省份。"
    );
    expect(description.textContent).not.toMatch(/[A-Za-z]/);
    expect([...description.querySelectorAll("b")].map(node => node.textContent)).toEqual(["复选框", "单选按钮"]);
    expect(description.querySelector("em")?.textContent).toBe("主导省份");
    expect([...form.children].map(node => node.tagName)).toEqual(["P", "MAIN"]);
    expect(form.style.display).toBe("flex");
    expect(form.style.flexDirection).toBe("column");
    expect(form.querySelector("main")?.style.gridTemplateColumns).toBe("1fr 1fr");
  });

  it("preserves province ids, form attributes, name fallback, labels, colors and emblems", () => {
    const form = parseHtml(renderProvinceMergeForm(provinces, emblem)).querySelector("form")!;
    expect(inputAttributes(form)).toEqual(expectedInputs([4, 12], "Province"));
    expect([...new FormData(form)]).toEqual([]);

    for (const province of provinces) {
      const row = form.querySelector<HTMLElement>(`div[data-id="${province.i}"]`)!;
      const label = row.querySelector("label")!;
      expect(row.dataset.tip).toBe(province.fullName || province.name);
      expect(row.style.cursor).toBe("default");
      expect(label.htmlFor).toBe(`selectProvince${province.i}`);
      expect(label.className).toBe("checkbox-label");
      expect(label.textContent).toBe(province.name);
      expect(label.querySelector("fill-box")?.getAttribute("fill")).toBe(province.color);
      expect(label.querySelector("fill-box")?.hasAttribute("disabled")).toBe(true);
      expect(label.querySelector("use")?.getAttribute("href")).toBe(`#emblem${province.i}`);
    }
  });

  it("submits the same ruling-province and selected-province keys used by the controller", () => {
    const form = parseHtml(renderProvinceMergeForm(provinces, emblem)).querySelector("form")!;
    form.querySelector<HTMLInputElement>('input[name="rulingProvince"][value="12"]')!.checked = true;
    form.querySelectorAll<HTMLInputElement>('input[name="provincesToMerge"]').forEach(input => {
      input.checked = true;
    });

    const data = new FormData(form);
    expect(data.get("rulingProvince")).toBe("12");
    expect(data.getAll("provincesToMerge")).toEqual(["4", "12"]);
  });
});
