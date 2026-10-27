import { closeDialogs, confirmationDialog } from "@/components/dialog/dialog-helpers";
import { syncOptionInputs } from "@/components/options/tabs/options-tab";
import { Pins } from "@/components/pins";
import { getPointsNumber } from "@/data/graph-density";
import { heightmapTemplates } from "@/data/heightmap-templates";
import { precreatedHeightmaps } from "@/data/precreated-heightmaps";
import { drawHeights } from "@/renderers/draw-heightmap";
import { HeightmapColorSchemes } from "@/renderers/heightmap-color-schemes";
import type { GridGraph } from "@/types/GridGraph";
import { ensureEl, generateSeed } from "../utils";

const initialSeed = generateSeed();
type GraphConfig = ReturnType<typeof getGraphConfig>;
let graphConfig: GraphConfig | null = getGraphConfig();
let graph: GridGraph | null = getGraph();

appendStyleSheet();
insertHtml();
addListeners();

function open(): void {
  closeDialogs(".stable");

  setSelected(options.generation.template);
  graphConfig = getGraphConfig();
  graph = getGraph();
  ensureEl("heightmapSelection").style.setProperty(
    "--preview-aspect-ratio",
    `${graphConfig.width}/${graphConfig.height}`
  );
  redrawAll();

  $("#heightmapSelection").dialog({
    title: "选择高度图",
    resizable: false,
    position: { my: "center", at: "center", of: "svg" },
    close: onClose,
    buttons: {
      取消: function (this: HTMLElement) {
        $(this).dialog("close");
      },
      选择: function (this: HTMLElement) {
        const id = getSelected();
        if (!id) return;
        Options.set(o => (o.generation.template = id));
        syncOptionInputs();
        Pins.set("template", options.generation.template);

        $(this).dialog("close");
      },
      新建地图: function (this: HTMLElement) {
        const id = getSelected();
        if (!id) return;
        Options.set(o => (o.generation.template = id));
        syncOptionInputs();
        Pins.set("template", options.generation.template);

        const seed = getSeed();
        const previewGraph = graph;
        const previewConfig = graphConfig;
        if (previewGraph && previewConfig) regeneratePrompt({ seed, graph: previewGraph, ...previewConfig });

        $(this).dialog("close");
      }
    }
  });
}

function onClose(): void {
  graph = null;
  graphConfig = null;
  HeightmapGenerator.clearData(); // the generator pins the preview graph it last measured
}

function appendStyleSheet(): void {
  const style = document.createElement("style");
  style.textContent = /* css */ `
    div.dialog > div.heightmap-selection {
      width: 70vw;
      height: 70vh;
    }

    .heightmap-selection_container {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      grid-gap: 6px;
    }

    @media (max-width: 600px) {
      .heightmap-selection_container {
        grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
        grid-gap: 4px;
      }
    }

    @media (min-width: 2000px) {
      .heightmap-selection_container {
        grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
        grid-gap: 8px;
      }
    }

    .heightmap-selection_options {
      display: grid;
      grid-template-columns: 2fr 1fr;
    }

    .heightmap-selection_options > div:first-child {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      align-items: center;
      justify-self: start;
      justify-items: start;
    }

    @media (max-width: 600px) {
      .heightmap-selection_options {
        grid-template-columns: 3fr 1fr;
      }

      .heightmap-selection_options > div:first-child {
        display: block;
      }
    }

    .heightmap-selection_options > div:last-child {
      justify-self: end;
    }

    .heightmap-selection article {
      padding: 4px;
      border-radius: 8px;
      transition: all 0.1s ease-in-out;
      filter: drop-shadow(1px 1px 4px #999);
    }

    .heightmap-selection article:hover {
      background-color: #ddd;
      filter: drop-shadow(1px 1px 8px #999);
      cursor: pointer;
    }

    .heightmap-selection article.selected {
      background-color: #ccc;
      outline: 1px solid var(--dark-solid);
      filter: drop-shadow(1px 1px 8px #999);
    }

    .heightmap-selection article > div {
      display: flex;
      justify-content: space-between;
      padding: 2px 1px;
    }

    .heightmap-selection article > img {
      width: 100%;
      aspect-ratio: var(--preview-aspect-ratio);
      border-radius: 8px;
      object-fit: fill;
    }

    .heightmap-selection article .regeneratePreview {
      outline: 1px solid #bbb;
      padding: 1px 3px;
      border-radius: 4px;
      transition: all 0.1s ease-in-out;
    }

    .heightmap-selection article .regeneratePreview:hover {
      outline: 1px solid #666;
    }

    .heightmap-selection article .regeneratePreview:active {
      outline: 1px solid #333;
      color: #000;
      transform: rotate(45deg);
    }
  `;

  document.head.appendChild(style);
}

function insertHtml(): void {
  const previewGraph = graph;
  const previewConfig = graphConfig;
  if (!previewGraph || !previewConfig) return;

  const heightmapColorSchemeOptions = HeightmapColorSchemes.names()
    .map(scheme => `<option value="${scheme}">${scheme}</option>`)
    .join("");

  const heightmapSelectionHtml = /* html */ `<div id="heightmapSelection" class="dialog stable">
    <div class="heightmap-selection">
      <section data-tip="选择高度图模板：每次生成的地图各不相同，但外观风格相似">
        <header><h1>高度图模板</h1></header>
        <div class="heightmap-selection_container"></div>
      </section>
      <section data-tip="选择预制高度图：每次生成地图时都使用相同的高度图">
        <header><h1>预制高度图</h1></header>
        <div class="heightmap-selection_container"></div>
      </section>
      <section>
        <header><h1>选项</h1></header>
        <div class="heightmap-selection_options">
          <div>
            <label data-tip="重新绘制所有预览图" class="checkbox-label" id="heightmapSelectionRedrawPreview">
              <i class="icon-cw"></i>
              重绘预览
            </label>
            <div>
              <input id="heightmapSelectionRenderOcean" class="checkbox" type="checkbox" />
              <label data-tip="显示水域单元格的高度" for="heightmapSelectionRenderOcean" class="checkbox-label">显示海底高度</label>
            </div>
            <div data-tip="高度图预览使用的配色方案">
              配色方案
              <select id="heightmapSelectionColorScheme">${heightmapColorSchemeOptions}</select>
            </div>
          </div>
          <div>
            <button data-tip="打开模板编辑器" data-tool="templateEditor" id="heightmapSelectionEditTemplates">编辑模板</button>
            <button data-tip="打开图像转换器" data-tool="imageConverter" id="heightmapSelectionImportHeightmap">导入高度图</button>
          </div>
        </div>
      </section>
    </div>
  </div>`;

  ensureEl("dialogs").insertAdjacentHTML("beforeend", heightmapSelectionHtml);

  const sections = document.getElementsByClassName("heightmap-selection_container");

  sections[0].innerHTML = Object.keys(heightmapTemplates)
    .map(key => {
      const name = heightmapTemplates[key].name;
      Math.random = aleaPRNG(initialSeed);
      const heights = HeightmapGenerator.fromTemplate(previewGraph, key, previewConfig);

      return /* html */ `<article data-id="${key}" data-seed="${initialSeed}">
        <img src="${getHeightmapPreview(heights)}" alt="${name}" />
        <div>
          ${name}
          <span data-tip="重新生成预览" class="icon-cw regeneratePreview"></span>
        </div>
      </article>`;
    })
    .join("");

  sections[1].innerHTML = Object.keys(precreatedHeightmaps)
    .map(key => {
      const name = precreatedHeightmaps[key].name;
      drawPrecreatedHeightmap(key);

      return /* html */ `<article data-id="${key}" data-seed="${initialSeed}">
        <img alt="${name}" />
        <div>${name}</div>
      </article>`;
    })
    .join("");
}

function addListeners(): void {
  ensureEl("heightmapSelection").addEventListener("click", event => {
    const target = (event as MouseEvent).target as HTMLElement;
    const article = target.closest<HTMLElement>("#heightmapSelection article");
    if (!article) return;

    const id = article.dataset.id;
    if (!id) return;
    if (target.matches("span.icon-cw")) regeneratePreview(article, id);
    setSelected(id);
  });

  ensureEl("heightmapSelectionRenderOcean").addEventListener("change", redrawAll);
  ensureEl("heightmapSelectionColorScheme").addEventListener("change", redrawAll);
  ensureEl("heightmapSelectionRedrawPreview").addEventListener("click", redrawAll);
  ensureEl("heightmapSelectionEditTemplates").addEventListener("click", event =>
    confirmHeightmapEdit(event.currentTarget as HTMLElement)
  );
  ensureEl("heightmapSelectionImportHeightmap").addEventListener("click", event =>
    confirmHeightmapEdit(event.currentTarget as HTMLElement)
  );
}

function getSelected(): string | undefined {
  return ensureEl("heightmapSelection").querySelector<HTMLElement>(".selected")?.dataset?.id;
}

function setSelected(id: string): void {
  const $heightmapSelection = ensureEl("heightmapSelection");
  $heightmapSelection.querySelector(".selected")?.classList?.remove("selected");
  $heightmapSelection.querySelector(`[data-id="${id}"]`)?.classList?.add("selected");
}

function getSeed(): string | undefined {
  return ensureEl("heightmapSelection").querySelector<HTMLElement>(".selected")?.dataset?.seed;
}

function getGraphConfig() {
  const { width, height, density } = options.generation.graph;
  return { width, height, points: getPointsNumber(density) };
}

function getGraph(): GridGraph {
  const { width, height, points } = graphConfig ?? getGraphConfig();
  const current = options.map.graph;
  if (current.width !== width || current.height !== height || current.points !== points) {
    return Grid.generate(initialSeed, width, height, points);
  }
  const preview = structuredClone(grid);
  Grid.resetHeights(preview);
  return preview;
}

function drawTemplatePreview(id: string): void {
  const previewGraph = graph;
  const previewConfig = graphConfig;
  if (!previewGraph || !previewConfig) return;

  const heights = HeightmapGenerator.fromTemplate(previewGraph, id, previewConfig);
  const dataUrl = getHeightmapPreview(heights);
  const article = ensureEl("heightmapSelection").querySelector(`[data-id="${id}"]`);
  article?.querySelector("img")?.setAttribute("src", dataUrl);
}

async function drawPrecreatedHeightmap(id: string): Promise<void> {
  const previewGraph = graph;
  const previewConfig = graphConfig;
  if (!previewGraph || !previewConfig) return;

  const heights = await HeightmapGenerator.fromPrecreated(previewGraph, id, previewConfig);
  if (previewGraph !== graph) return;
  const dataUrl = getHeightmapPreview(heights);
  const article = ensureEl("heightmapSelection").querySelector(`[data-id="${id}"]`);
  article?.querySelector("img")?.setAttribute("src", dataUrl);
}

function regeneratePreview(article: HTMLElement, id: string): void {
  if (!graph) return;

  Grid.resetHeights(graph);
  const seed = generateSeed();
  article.dataset.seed = seed;
  Math.random = aleaPRNG(seed);
  drawTemplatePreview(id);
}

function redrawAll(): void {
  if (!graph) return;

  Grid.resetHeights(graph);
  const articles = ensureEl("heightmapSelection").querySelectorAll<HTMLElement>("article");
  for (const article of articles) {
    const { id, seed } = article.dataset;
    if (!id || !seed) continue;
    Math.random = aleaPRNG(seed);

    const isTemplate = id in heightmapTemplates;
    if (isTemplate) drawTemplatePreview(id);
    else drawPrecreatedHeightmap(id);
  }
}

function confirmHeightmapEdit(el: HTMLElement): void {
  const tool = el.dataset.tool;
  if (!tool) return;

  confirmationDialog({
    title: el.dataset.tip ?? "",
    message: "打开此工具将清除当前地图。确定要继续吗？",
    confirm: "继续",
    cancel: "取消",
    onConfirm: () => window.Controllers.HeightmapEditor.open({ mode: "erase", tool })
  });
}

function getHeightmapPreview(heights: Uint8Array | null): string {
  if (!graph || !heights?.length) return "";

  const scheme = HeightmapColorSchemes.get(ensureEl<HTMLSelectElement>("heightmapSelectionColorScheme").value);
  const renderOcean = ensureEl<HTMLInputElement>("heightmapSelectionRenderOcean").checked;
  const dataUrl = drawHeights({
    heights,
    width: graph.cellsX,
    height: graph.cellsY,
    scheme,
    renderOcean
  });
  return dataUrl;
}

export const HeightmapSelection = { open };
