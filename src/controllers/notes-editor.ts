import type Quill from "quill";
import { confirmationDialog, destroyDialog } from "@/components/dialog/dialog-helpers";
import { ENTITY_TYPES, type EntityRef, MapEntities } from "@/components/map-entities";
import { tip } from "@/components/tooltips";
import { viewport } from "@/components/viewport";
import { type NoteEntry, Notes } from "@/generators/notes";
import { highlightElement } from "@/renderers/overlays/highlight";
import { downloadFile, getFileName, speak, uploadFile } from "@/utils";
import { createFileInput, ensureEl, findEl } from "../utils";
import {
  canEditAsRichText,
  createRichTextEditor,
  getEditorHtml,
  runTableAction,
  setEditorHtml,
  TOOLBAR_HTML
} from "./notes-rich-text";

let quill: Quill | null = null;
let lastSelection: { index: number; length: number } | null = null;
let windowed: { width: number; height: number; top: string; left: string } | null = null;
let legendsInput: HTMLInputElement | null = null;

/** Open the editor on the given entity, or on the first note when called with no reference */
function open(ref?: EntityRef): void {
  renderDialog();

  const notesSelect = ensureEl<HTMLSelectElement>("notesSelect");
  const notesPin = ensureEl("notesPin");

  const entries = Notes.list();
  fillSelect(notesSelect, entries, ref);

  if (options.app.notesPinned) notesPin.classList.add("pressed");
  else notesPin.classList.remove("pressed");

  quill = createRichTextEditor(
    ensureEl("notesLegend"),
    ensureEl("notesToolbar"),
    updateLegend,
    fonts.map(font => font.family)
  );

  quill.root.dataset.placeholder = "在此编写笔记。将鼠标悬停在地图元素上或点击它时，笔记会显示在笔记框中";

  quill.on("selection-change", range => {
    if (range) lastSelection = { index: range.index, length: range.length };
  });

  const selected = ref || entries[0]?.ref;
  if (selected) {
    notesSelect.value = MapEntities.key(selected);
    showNote(selected);
  } else {
    ensureEl("notesName").textContent = "";
    quill.root.dataset.placeholder = "暂无笔记。请点击地图上的城镇、标记、国家或其他元素，在其编辑器中添加笔记";
    quill.disable();
    lastSelection = null;
    window.dispatchEvent(new Event("notes:context-changed"));
  }

  $("#notesEditor").dialog({
    title: "笔记编辑器",
    width: viewport.width * 0.8,
    height: viewport.height * 0.75,
    position: { my: "center", at: "center", of: "svg" },
    close: closeNotesEditor
  });
}

/** Notes grouped by entity type, plus the requested entity when it has no note yet */
function fillSelect(select: HTMLSelectElement, entries: NoteEntry[], ref?: EntityRef): void {
  select.innerHTML = "";

  const requestedKey = ref && MapEntities.key(ref);
  const listed = new Set(entries.map(entry => entry.key));

  for (const type of ENTITY_TYPES) {
    const typeEntries = entries.filter(entry => entry.ref.type === type);
    if (ref?.type === type && requestedKey && !listed.has(requestedKey))
      typeEntries.unshift({ ref, key: requestedKey, note: "" });
    if (!typeEntries.length) continue;

    const group = document.createElement("optgroup");
    group.label = MapEntities.getTypeLabel(type);
    for (const entry of typeEntries) group.append(new Option(MapEntities.getName(entry.ref) || entry.key, entry.key));
    select.append(group);
  }
}

const STYLES = /* html */ `
    <style>
      /* jQuery UI sets the dialog content height inline; the layout column fills it, the editor takes the rest */
      #notesLayout { display: flex; flex-direction: column; height: 100%; width: auto; }
      #notesHead { display: flex; align-items: center; gap: 0.4em; flex-shrink: 0; margin-bottom: 5px; }
      #notesHead select { flex: 0 1 12em; min-width: 5em; }
      #notesHead input { flex: 0 1 18em; min-width: 5em; }
      #notesFooter { display: flex; gap: 3px; flex-shrink: 0; margin-top: 5px; }
      #notesToolbar { display: flex; flex-wrap: wrap; align-items: center; flex-shrink: 0; gap: 2px 9px; padding: 4px 6px; background: #f6f5f8; border-radius: 3px 3px 0 0; }
      #notesToolbar[hidden] { display: none; }
      /* nothing to format while no note is selected */
      #notesToolbar:has(+ #notesLegend.ql-disabled) { opacity: 0.45; pointer-events: none; }
      #notesToolbar .ql-formats { display: flex; align-items: center; flex-shrink: 0; margin: 0; }
      #notesToolbar button, #notesToolbar .ql-color-picker, #notesToolbar .ql-icon-picker { width: 26px; height: 26px; }
      #notesToolbar button { padding: 4px; border-radius: 4px; transition: background-color 0.1s; }
      #notesToolbar .ql-picker { height: 26px; color: #333; }
      #notesToolbar .ql-picker-label { border-radius: 4px; }
      #notesToolbar button:hover, #notesToolbar .ql-picker-label:hover, #notesToolbar .ql-expanded .ql-picker-label { background: #ece9f3; }
      #notesToolbar button.ql-active, #notesToolbar .ql-picker-label.ql-active { background: #e0d9f0; box-shadow: inset 0 0 0 1px #c4b8e0; }
      /* Quill tints hover and active blue, which fights the app's violet accent */
      #notesToolbar :is(button:hover, button.ql-active, .ql-picker-label:hover, .ql-active) .ql-stroke { stroke: #5e4fa2; }
      #notesToolbar :is(button:hover, button.ql-active, .ql-picker-label:hover, .ql-active) .ql-fill { fill: #5e4fa2; }
      #notesToolbar button:focus-visible, #notesToolbar .ql-picker-label:focus-visible { outline: 2px solid #5e4fa2; outline-offset: -2px; }
      #notesToolbar .ql-symbol, #notesToolbar .ql-divider { font-size: 17px; line-height: 17px; color: #444; }
      #notesToolbar :is(.ql-symbol, .ql-divider):hover { color: #5e4fa2; }
      #notesToolbar .ql-font { width: 112px; margin-right: 3px; }
      #notesToolbar .ql-size { width: 76px; }
      /* Quill previews each size by its own name, which the inline-style values are not */
      #notesToolbar .ql-size .ql-picker-item[data-value="10px"]::before { font-size: 10px; }
      #notesToolbar .ql-size .ql-picker-item[data-value="18px"]::before { font-size: 18px; }
      #notesToolbar .ql-size .ql-picker-item[data-value="32px"]::before { font-size: 32px; }
      #notesToolbar .notes-table { width: 68px; }
      #notesToolbar :is(.ql-font, .ql-size, .notes-table) .ql-picker-label { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; padding-right: 18px; font-weight: 400; background: white; border: 1px solid #dedbe2; }
      #notesToolbar .ql-font .ql-picker-label::before, #notesToolbar .ql-font .ql-picker-item::before, #notesToolbar .notes-table .ql-picker-label::before, #notesToolbar .notes-table .ql-picker-item::before { content: attr(data-label); }
      /* Fixed menus escape the dialog's own scroll box */
      #notesToolbar .ql-picker-options { position: fixed; /* Quill sizes the menu with min-width: 100%, which once fixed is 100% of the viewport */
        min-width: 0; z-index: 2000; max-height: 45vh; overflow-y: auto; margin-top: 3px; padding: 4px; border-radius: 4px; box-shadow: 0 4px 14px #00000026; }
      #notesToolbar .ql-picker-item { border-radius: 3px; }
      #notesToolbar .ql-picker-item:hover { background: #ece9f3; }
      #notesToolbar .ql-font .ql-picker-options, #notesToolbar .notes-table .ql-picker-options { min-width: 180px; }
      .notes-symbols { margin: 0; padding: 6px; width: 340px; max-width: calc(100vw - 24px); max-height: 40vh; overflow: auto; background: white; border: 1px solid #ccc; border-radius: 4px; box-shadow: 0 4px 14px #00000026; }
      .notes-symbols:popover-open { display: grid; grid-template-columns: repeat(auto-fill, minmax(28px, 1fr)); gap: 2px; }
      #notesLayout .notes-symbols button { margin: 0; min-height: 28px; padding: 2px; font-size: 18px; background: white; border: 0; border-radius: 3px; }
      .notes-symbols button:hover, .notes-symbols button:focus-visible { background: #ece9f3; }
      #notesLegend, #notesSource { flex: 1; min-height: 0; background-color: #fff; }
      #notesLegend { border-radius: 0 0 3px 3px; }
      /* the editing surface should read like the note itself, not like a form field */
      #notesLegend .ql-editor { padding: 12px 16px; font-family: var(--sans-serif); font-size: 14px; line-height: 1.55; color: #1c1c1c; }
      #notesLegend .ql-editor p { margin-bottom: 0.35em; }
      #notesLegend .ql-editor hr { margin: 0.8em 0; border: 0; border-top: 1px solid #c9c5d0; }
      #notesLegend .ql-editor blockquote { color: #444; }
      #notesLegend .ql-editor.ql-blank::before { left: 16px; right: 16px; color: #9a96a3; font-style: italic; }
      /* the link box: Quill's is a bare white strip with blue text links for Edit and Remove */
      #notesLegend .ql-tooltip { z-index: 3; padding: 6px 10px; color: #333; border: 1px solid #ccc; border-radius: 4px; box-shadow: 0 4px 14px #00000026; }
      #notesLegend .ql-tooltip::before { content: "链接："; margin-right: 8px; color: #77737f; }
      #notesLegend .ql-tooltip[data-mode="link"]::before { content: "输入链接："; }
      #notesLegend .ql-tooltip a.ql-action::after { content: "编辑"; }
      #notesLegend .ql-tooltip.ql-editing a.ql-action::after { content: "保存"; }
      #notesLegend .ql-tooltip a.ql-remove::before { content: "移除"; }
      #notesLegend .ql-tooltip input[type="text"] { width: 17em; max-width: 50vw; height: 26px; padding: 3px 6px; border: 1px solid #dedbe2; border-radius: 3px; }
      #notesLegend .ql-tooltip input[type="text"]:focus { outline: 2px solid #5e4fa2; outline-offset: -2px; }
      #notesLegend .ql-tooltip a { color: #5e4fa2; }
      #notesLegend .ql-tooltip a.ql-preview { max-width: 22em; }
      #notesLegend .ql-tooltip a.ql-action::after, #notesLegend .ql-tooltip a.ql-remove::before { margin-left: 8px; padding: 2px 6px; border: 0; border-radius: 3px; }
      #notesLegend .ql-tooltip a:hover::after, #notesLegend .ql-tooltip a:hover::before { background: #ece9f3; }
      #notesSource { padding: 10px 12px; font-family: var(--monospace); font-size: 13px; line-height: 1.5; border: 1px solid #ccc; border-radius: 3px; resize: none; }
    </style>`;

function renderDialog(): void {
  destroyDialog("notesEditor");
  quill = null;
  windowed = null;

  const editorHtml = /* html */ `<div id="notesEditor" class="dialog stable">
    ${STYLES}
    <div id="notesLayout">
      <div id="notesHead">
        <strong>元素：</strong>
        <select id="notesSelect" data-tip="选择笔记所属的元素"></select>
        <strong id="notesName" data-tip="元素名称，请在该元素的编辑器中修改"></strong>
        <span id="notesNameSpeak" data-tip="朗读名称，可在选项中更改语音和语言" class="speaker">🔊</span>
      </div>
      ${TOOLBAR_HTML}
      <div id="notesLegend"></div>
      <textarea id="notesSource" hidden spellcheck="false"></textarea>
      <div id="notesFooter">
        <button id="notesFocus" data-tip="定位所选对象" class="icon-target"></button>
        <button id="notesPin" data-tip="切换笔记框固定状态：鼠标移动时隐藏或保持显示" class="icon-pin"></button>
        <button id="notesSourceToggle" data-tip="以 HTML 源码编辑笔记" class="icon-edit"></button>
        <button id="notesFullscreen" data-tip="切换全屏" class="icon-resize-full"></button>
        <button id="notesDownload" data-tip="将笔记下载到电脑" class="icon-download"></button>
        <button id="notesUpload" data-tip="从电脑导入笔记" class="icon-upload"></button>
        <button id="notesRemove" data-tip="移除此笔记" class="icon-trash fastDelete"></button>
      </div>
    </div>
  </div>`;

  ensureEl("dialogs").insertAdjacentHTML("beforeend", editorHtml);

  ensureEl<HTMLSelectElement>("notesSelect").addEventListener("change", changeElement);
  ensureEl("notesNameSpeak").addEventListener("click", () => speak(ensureEl("notesName").textContent || ""));
  ensureEl<HTMLTextAreaElement>("notesSource").addEventListener("input", updateLegend);
  ensureEl<HTMLSelectElement>("notesTable").addEventListener("change", applyTableAction);
  ensureEl("notesSourceToggle").addEventListener("click", toggleSourceMode);
  ensureEl("notesFullscreen").addEventListener("click", toggleFullscreen);
  ensureEl("notesPin").addEventListener("click", toggleNotesPin);
  ensureEl("notesFocus").addEventListener("click", validateHighlightElement);
  ensureEl("notesDownload").addEventListener("click", downloadLegends);
  ensureEl("notesUpload").addEventListener("click", pickLegendsFile);
  ensureEl("notesRemove").addEventListener("click", triggerNotesRemove);
}

function closeNotesEditor(): void {
  quill = null;
  lastSelection = null;
  $("#notesEditor").dialog("destroy");
  ensureEl("notesEditor").remove();
  window.dispatchEvent(new Event("notes:context-changed"));
}

function selectedRef(): EntityRef | undefined {
  const ref = MapEntities.parseKey(ensureEl<HTMLSelectElement>("notesSelect").value);
  if (!ref) tip("未找到笔记所属的元素", true, "error", 4000);
  return ref;
}

function showNote(ref: EntityRef): void {
  ensureEl("notesName").textContent = MapEntities.getName(ref);
  loadNote(Notes.get(ref) || "");
  lastSelection = null;
  updateNotesBox(ref);
  window.dispatchEvent(new Event("notes:context-changed"));
}

// A note whose markup Quill would rewrite (such as a dungeon iframe) is edited as HTML.
function loadNote(note: string): void {
  if (!quill) return;
  quill.enable();
  const rich = canEditAsRichText(note);
  if (rich) setEditorHtml(quill, note);
  else ensureEl<HTMLTextAreaElement>("notesSource").value = note;
  setSourceMode(!rich);
}

function setSourceMode(raw: boolean): void {
  ensureEl("notesToolbar").hidden = raw;
  ensureEl("notesLegend").hidden = raw;
  ensureEl("notesSource").hidden = !raw;
  ensureEl("notesSourceToggle").classList.toggle("pressed", raw);
}

function toggleSourceMode(): void {
  const ref = selectedRef();
  if (!ref || !quill) return;

  const source = ensureEl<HTMLTextAreaElement>("notesSource");
  if (source.hidden) {
    source.value = Notes.get(ref) || "";
    setSourceMode(true);
  } else if (canEditAsRichText(source.value)) {
    setEditorHtml(quill, source.value);
    setSourceMode(false);
  } else {
    tip("笔记包含富文本编辑器无法保留的 HTML 标记，因此仍以 HTML 源码模式编辑", false, "error", 4000);
  }
}

function applyTableAction(this: HTMLSelectElement): void {
  const action = this.value;
  if (!action) return; // the reset below re-enters through the event Quill's picker listens for

  if (quill) runTableAction(quill, action);
  this.value = "";
  this.dispatchEvent(new Event("change")); // Quill's picker only syncs its label from a change event
}

// the restored position is read off the widget: a position saved between sessions is applied as css and
// never reaches the dialog's own position option, which still holds the hard-coded one from open()
function toggleFullscreen(): void {
  const dialog = $("#notesEditor");
  const widget = dialog.dialog("widget");

  if (windowed) {
    dialog.dialog("option", "width", windowed.width);
    dialog.dialog("option", "height", windowed.height);
    widget.css({ top: windowed.top, left: windowed.left });
    windowed = null;
  } else {
    windowed = {
      width: dialog.dialog("option", "width"),
      height: dialog.dialog("option", "height"),
      top: widget.css("top"),
      left: widget.css("left")
    };
    dialog.dialog("option", "width", window.innerWidth);
    dialog.dialog("option", "height", window.innerHeight);
    widget.css({ top: 0, left: 0 });
  }
  ensureEl("notesFullscreen").classList.toggle("pressed", Boolean(windowed));
}

function updateLegend(): void {
  const ref = selectedRef();
  if (!ref || !quill) return;

  const source = ensureEl<HTMLTextAreaElement>("notesSource");
  Notes.set(ref, source.hidden ? getEditorHtml(quill) : source.value);
  updateNotesBox(ref);
}

function updateNotesBox(ref: EntityRef): void {
  ensureEl("notesHeader").textContent = MapEntities.getName(ref); // plain text: an & in a name is not an entity
  ensureEl("notesBody").innerHTML = Notes.get(ref) || "";
}

function changeElement(): void {
  const ref = selectedRef();
  if (ref) showNote(ref);
}

function validateHighlightElement(): void {
  const ref = selectedRef();
  if (!ref) return;

  if (!MapEntities.get(ref)) {
    confirmationDialog({
      title: "未找到元素",
      message: "未找到笔记所属的元素。是否移除此笔记？",
      confirm: "移除",
      cancel: "取消",
      onConfirm: removeSelectedNote
    });
    return;
  }

  // the viewport renderers hold only what is on screen, so an off-screen element is not in the dom
  const elementId = MapEntities.getElementId(ref);
  const element = elementId ? findEl(elementId) : null;
  if (element) return void highlightElement(element, 3);

  const position = MapEntities.getPosition(ref);
  if (position) return void zoomTo(position[0], position[1], 8, 1600);

  tip("此元素不会单独绘制在地图上", false, "warn", 4000);
}

function removeSelectedNote(): void {
  const ref = selectedRef();
  if (!ref) return;

  Notes.set(ref, "");

  const [first] = Notes.list();
  if (!first) {
    $("#notesEditor").dialog("close");
    return;
  }

  open(first.ref);
}

const CSV_HEADER = "type,id,note";

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

/** Notes are exchanged as csv addressed by entity, so an uploaded note always has an owner */
function downloadLegends(): void {
  const rows = Notes.list().map(entry => {
    const id = entry.ref.sub === undefined ? String(entry.ref.id) : `${entry.ref.id}-${entry.ref.sub}`;
    return [entry.ref.type, id, csvCell(entry.note)].join(",");
  });

  downloadFile([CSV_HEADER, ...rows].join("\n"), `${getFileName("Notes")}.csv`);
}

/** Own the legends file input here so repeat opens cannot stack listeners on a shared element */
function pickLegendsFile(): void {
  legendsInput ??= createFileInput(".txt");
  legendsInput.onchange = () => uploadFile(legendsInput!, uploadLegends);
  legendsInput.click();
}

function uploadLegends(dataLoaded: string): void {
  const rows = parseCsv(dataLoaded);
  if (!rows) {
    tip("无法加载文件，请检查数据格式", false, "error");
    return;
  }

  let applied = 0;
  let rejected = 0;
  for (const [type, id, note] of rows) {
    const ref = MapEntities.parseKey(`${type}:${id}`);
    if (ref && Notes.set(ref, note)) applied++;
    else rejected++;
  }

  if (!applied) {
    tip("没有笔记能匹配此地图上的元素，未加载任何内容", false, "error", 6000);
    return;
  }

  const rejectedText = rejected ? `，另有 ${rejected} 条因所属元素不在地图上而跳过` : "";
  tip(`已加载 ${applied} 条笔记${rejectedText}`, true, "success", 6000);

  const [first] = Notes.list();
  if (first) open(first.ref);
}

/** Minimal csv reader: three columns, the last one quoted and free to contain commas and newlines */
function parseCsv(data: string): [string, string, string][] | null {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < data.length; i++) {
    const char = data[i];

    if (quoted) {
      if (char !== '"') cell += char;
      else if (data[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = false;
      continue;
    }

    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && data[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  row.push(cell);
  if (row.length > 1 || row[0]) rows.push(row);

  const parsed = rows
    .filter(parsedRow => parsedRow.length >= 3 && parsedRow[0] !== "type")
    .map(
      parsedRow => [parsedRow[0].trim(), parsedRow[1].trim(), parsedRow.slice(2).join(",")] as [string, string, string]
    );

  return parsed.length ? parsed : null;
}

function triggerNotesRemove(): void {
  confirmationDialog({
    title: "移除笔记",
    message: "确定要移除所选笔记吗？此操作无法撤销",
    confirm: "移除",
    cancel: "取消",
    onConfirm: removeSelectedNote
  });
}

function toggleNotesPin(this: HTMLElement): void {
  Options.set(o => (o.app.notesPinned = !o.app.notesPinned));
  this.classList.toggle("pressed");
}

// Entity keys stay stable; note titles remain the entity's own name.
export interface Note {
  id: string;
  name: string;
  legend: string;
}

function current(): Note | null {
  if (!document.getElementById("notesEditor")) return null;
  const ref = selectedRef();
  if (!ref || !MapEntities.get(ref)) return null;
  return { id: MapEntities.key(ref), name: MapEntities.getName(ref), legend: Notes.get(ref) || "" };
}

/** Show notes and names changed outside the editor, keeping the selected entity */
function refresh(): void {
  if (!document.getElementById("notesEditor")) return;
  const select = ensureEl<HTMLSelectElement>("notesSelect");
  const selected = MapEntities.parseKey(select.value);
  fillSelect(select, Notes.list(), selected);
  if (!selected || !MapEntities.get(selected)) return;
  select.value = MapEntities.key(selected);
  showNote(selected);
}

function getSelectionHtml(): string | null {
  if (!document.getElementById("notesEditor") || !quill) return null;
  const source = ensureEl<HTMLTextAreaElement>("notesSource");
  if (!source.hidden) return source.value.slice(source.selectionStart, source.selectionEnd) || null;
  const range = quill.getSelection() ?? lastSelection;
  return range?.length ? quill.getSemanticHTML(range.index, range.length) : null;
}

export const NotesEditor = { open, exportCsv: downloadLegends, current, refresh, getSelectionHtml };
