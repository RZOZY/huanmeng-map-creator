// @vitest-environment jsdom
import Quill from "quill";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/renderers/overlays/highlight", () => ({ highlightElement: vi.fn() }));
vi.mock("@/components/tooltips", () => ({ tip: vi.fn() }));

const io = vi.hoisted(() => ({
  data: "",
  input: null as HTMLInputElement | null,
  download: vi.fn(),
  fileName: vi.fn((name: string) => name)
}));
vi.mock("@/utils", async importOriginal => ({
  ...(await importOriginal<typeof import("@/utils")>()),
  downloadFile: io.download,
  getFileName: io.fileName,
  createFileInput: (accept: string) => {
    io.input = document.createElement("input");
    io.input.type = "file";
    io.input.accept = accept;
    return io.input;
  },
  uploadFile: (_input: HTMLInputElement, callback: (data: string) => void) => callback(io.data)
}));

import { MapEntities } from "@/components/map-entities";
import { tip } from "@/components/tooltips";
import { Notes } from "@/generators/notes";
import { NotesEditor } from "./notes-editor";

const world = globalThis as unknown as Record<string, unknown>;
const burg = { type: "burg", id: 1 } as const;
const name = "Notes Editor & <b>Remove</b>";
const note = '<p><strong>Link:</strong> <a href="https://example.com/Notes?mode=link#Remove">Enter link:</a></p>';
const rawNote = '<iframe src="https://example.com/map?mode=link" title="Notes Editor"></iframe>\n<p>Remove</p>';
const dialog = vi.fn();

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function editor(): Quill {
  return Quill.find(el("notesLegend")) as Quill;
}

// jsdom has no computed pseudo-elements; check parsed CSSOM rules against actual Quill nodes instead.
function pseudoContent(element: Element, pseudo: "::before" | "::after"): string | undefined {
  const sheet = document.querySelector<HTMLStyleElement>("#notesEditor style")!.sheet!;
  return Array.from(sheet.cssRules)
    .map(rule => rule as CSSStyleRule)
    .filter(rule =>
      rule.selectorText?.split(",").some(selector => {
        const trimmed = selector.trim();
        return trimmed.endsWith(pseudo) && element.matches(trimmed.slice(0, -pseudo.length));
      })
    )
    .map(rule => rule.style.getPropertyValue("content"))
    .filter(Boolean)
    .at(-1);
}

function upload(data: string): void {
  io.data = data;
  el("notesUpload").click();
  io.input!.dispatchEvent(new Event("change"));
}

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML =
    '<div id="dialogs"></div><div id="notesHeader"></div><div id="notesBody"></div>' +
    '<div id="alert"><div id="alertMessage"></div></div>';
  world.pack = {
    burgs: [0, { i: 1, name, note }, { i: 2, name: "Save", note: "" }],
    markers: []
  };
  world.fonts = [{ family: "Almendra SC" }];
  window.$ = vi.fn(() => ({ dialog })) as unknown as typeof window.$;
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("notes editor source localization", () => {
  it("localizes real Quill link preview and editing pseudo-elements without touching the URL", () => {
    NotesEditor.open(burg);
    const quill = editor();
    quill.setSelection(7, 0, "user");
    const tooltip = document.querySelector<HTMLElement>("#notesLegend .ql-tooltip")!;
    const preview = tooltip.querySelector<HTMLAnchorElement>("a.ql-preview")!;
    const action = tooltip.querySelector<HTMLAnchorElement>("a.ql-action")!;
    const remove = tooltip.querySelector<HTMLAnchorElement>("a.ql-remove")!;
    expect(tooltip.classList.contains("ql-hidden")).toBe(false);
    expect(preview.getAttribute("href")).toBe("https://example.com/Notes?mode=link#Remove");
    expect(preview.textContent).toBe("https://example.com/Notes?mode=link#Remove");
    expect(getComputedStyle(tooltip).padding).toBe("6px 10px");
    const previewLabels = [
      pseudoContent(tooltip, "::before"),
      pseudoContent(action, "::after"),
      pseudoContent(remove, "::before")
    ];
    action.click();
    expect(tooltip.dataset.mode).toBe("link");
    expect(tooltip.classList.contains("ql-editing")).toBe(true);
    expect({
      preview: previewLabels,
      edit: [pseudoContent(tooltip, "::before"), pseudoContent(action, "::after")]
    }).toEqual({
      preview: ['"链接："', '"编辑"', '"移除"'],
      edit: ['"输入链接："', '"保存"']
    });
    expect(tooltip.querySelector<HTMLInputElement>("input")!.value).toBe(preview.textContent);
    expect(Notes.get(burg)).toBe(note);
  });

  it("localizes the editable placeholder and leaves format keys, font names and values unchanged", () => {
    Notes.set(burg, "");
    const setNote = vi.spyOn(Notes, "set");
    NotesEditor.open(burg);
    expect(editor().root.dataset.placeholder).toBe(
      "在此编写笔记。将鼠标悬停在地图元素上或点击它时，笔记会显示在笔记框中"
    );
    expect(editor().root.getAttribute("contenteditable")).toBe("true");
    for (const format of ["link", "font", "size", "table", "divider"]) {
      expect(editor().options.registry.query(format)).not.toBeNull();
    }
    expect(document.querySelector('select.ql-font option[value="Almendra SC"]')?.textContent).toBe("Almendra SC");
    expect(document.querySelector('select.ql-size option[value="18px"]')).not.toBeNull();
    expect(document.querySelector('#notesTable option[value="delete-row"]')).not.toBeNull();
    expect(setNote).not.toHaveBeenCalled();
  });

  it("localizes the disabled no-notes placeholder and editor title", () => {
    Notes.set(burg, "");
    NotesEditor.open();
    expect(editor().root.dataset.placeholder).toBe(
      "暂无笔记。请点击地图上的城镇、标记、国家或其他元素，在其编辑器中添加笔记"
    );
    expect(editor().root.getAttribute("contenteditable")).toBe("false");
    expect(dialog).toHaveBeenCalledWith(expect.objectContaining({ title: "笔记编辑器" }));
  });

  it("localizes owned controls while preserving user HTML, names and entity keys on open and refresh", () => {
    const setNote = vi.spyOn(Notes, "set");
    NotesEditor.open(burg);
    NotesEditor.refresh();
    expect(el<HTMLSelectElement>("notesSelect").value).toBe("burg:1");
    expect(el<HTMLSelectElement>("notesSelect").selectedOptions[0].textContent).toBe(name);
    expect(el("notesName").textContent).toBe(name);
    expect(el("notesHeader").textContent).toBe(name);
    expect(el("notesName").children).toHaveLength(0);
    expect(el("notesHeader").children).toHaveLength(0);
    expect(el("notesBody").innerHTML).toBe(note);
    expect(NotesEditor.current()).toEqual({ id: "burg:1", name, legend: note });
    expect(el("notesHead").querySelector("strong")?.textContent).toBe("元素：");
    expect(el("notesSourceToggle").dataset.tip).toBe("以 HTML 源码编辑笔记");
    expect(el("notesSelect").dataset.tip).toBe("选择笔记所属的元素");
    expect(setNote).not.toHaveBeenCalled();
  });

  it("keeps unsupported user HTML byte-for-byte and localizes the rich-text refusal", () => {
    Notes.set(burg, rawNote);
    const setNote = vi.spyOn(Notes, "set");
    NotesEditor.open(burg);
    const source = el<HTMLTextAreaElement>("notesSource");
    expect(source.hidden).toBe(false);
    expect(source.value).toBe(rawNote);
    source.setSelectionRange(0, 7);
    expect(NotesEditor.getSelectionHtml()).toBe("<iframe");
    el("notesSourceToggle").click();
    expect(tip).toHaveBeenLastCalledWith(
      "笔记包含富文本编辑器无法保留的 HTML 标记，因此仍以 HTML 源码模式编辑",
      false,
      "error",
      4000
    );
    expect(source.hidden).toBe(false);
    expect(source.value).toBe(rawNote);
    expect(Notes.get(burg)).toBe(rawNote);
    expect(setNote).not.toHaveBeenCalled();
  });

  it("localizes invalid selection and missing-object confirmation without deleting notes", () => {
    NotesEditor.open(burg);
    el<HTMLSelectElement>("notesSelect").value = "";
    el("notesFocus").click();
    expect(tip).toHaveBeenLastCalledWith("未找到笔记所属的元素", true, "error", 4000);
    el<HTMLSelectElement>("notesSelect").value = "burg:1";
    vi.stubGlobal("pack", { burgs: [0], markers: [] });
    try {
      el("notesFocus").click();
      expect(dialog).toHaveBeenLastCalledWith(
        expect.objectContaining({
          title: "未找到元素",
          buttons: { 移除: expect.any(Function), 取消: expect.any(Function) }
        })
      );
      expect(el("alertMessage").textContent).toBe("未找到笔记所属的元素。是否移除此笔记？");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("localizes the warning for objects without their own map representation", () => {
    NotesEditor.open(burg);
    vi.spyOn(MapEntities, "getPosition").mockReturnValue(undefined);
    el("notesFocus").click();
    expect(tip).toHaveBeenLastCalledWith("此元素不会单独绘制在地图上", false, "warn", 4000);
  });

  it("localizes destructive confirmation without invoking it or changing the note", () => {
    NotesEditor.open(burg);
    el("notesRemove").click();
    expect(dialog).toHaveBeenLastCalledWith(
      expect.objectContaining({
        title: "移除笔记",
        buttons: { 移除: expect.any(Function), 取消: expect.any(Function) }
      })
    );
    expect(el("alertMessage").textContent).toBe("确定要移除所选笔记吗？此操作无法撤销");
    expect(Notes.get(burg)).toBe(note);
  });

  it.each([
    ["not a notes file", "无法加载文件，请检查数据格式", undefined],
    ['type,id,note\nburg,99,"Unchanged English"', "没有笔记能匹配此地图上的元素，未加载任何内容", 6000]
  ])("localizes rejected import feedback: %s", (csv, message, duration) => {
    NotesEditor.open(burg);
    upload(csv);
    expect(tip).toHaveBeenLastCalledWith(
      ...(duration ? [message, false, "error", duration] : [message, false, "error"])
    );
    expect(Notes.get(burg)).toBe(note);
  });

  it.each([
    ["", "已加载 1 条笔记"],
    ['\nburg,99,"Remove"', "已加载 1 条笔记，另有 1 条因所属元素不在地图上而跳过"]
  ])("localizes import counts and preserves CSV keys and raw HTML: %s", (extra, message) => {
    NotesEditor.open(burg);
    upload(`type,id,note\nburg,1,"${rawNote.replaceAll('"', '""')}"${extra}`);
    expect(tip).toHaveBeenLastCalledWith(message, true, "success", 6000);
    expect(Notes.get(burg)).toBe(rawNote);
    expect(el<HTMLTextAreaElement>("notesSource").value).toBe(rawNote);
    expect(NotesEditor.current()).toEqual({ id: "burg:1", name, legend: rawNote });
    NotesEditor.exportCsv();
    expect(io.fileName).toHaveBeenCalledWith("Notes");
    expect(io.download).toHaveBeenLastCalledWith(
      `type,id,note\nburg,1,"${rawNote.replaceAll('"', '""')}"`,
      "Notes.csv"
    );
  });
});
