import { tip } from "@/components/tooltips";
import { Services } from "@/services";
import { type AtlasProjectFiles, readAtlasProjectFiles } from "@/services/atlas/project-files";
import type { MapLoadOutcome } from "@/services/io/load-operation";

let activePanel: HTMLDialogElement | null = null;

/** Session-local File capabilities only; closing the idle panel releases its references. */
export function showAtlasProject(): void {
  if (activePanel) {
    if (!activePanel.open) activePanel.showModal();
    activePanel.focus();
    return;
  }
  const panel = document.createElement("dialog");
  panel.id = "atlasProjectPanel";
  panel.setAttribute("aria-labelledby", "atlasProjectHeading");
  panel.style.cssText = "width:min(58em,88vw);max-height:85vh;padding:1em;overflow:auto";
  panel.innerHTML = `<h3 id="atlasProjectHeading">图集项目</h3>
    <p>选择含 atlas.json 的项目目录。只读所选文件，不扫描磁盘，不保存清单或地图。</p>
    <button type="button" data-action="choose">选择项目目录</button>
    <button type="button" data-action="close">关闭</button>
    <input id="atlasProjectDirectory" type="file" webkitdirectory multiple hidden aria-label="项目目录" />
    <p data-project></p><p data-status role="status" aria-live="polite">尚未选择目录。</p>
    <div style="max-height:50vh;overflow:auto"><table style="width:100%;text-align:left">
    <thead><tr><th>地图</th><th>类型</th><th>相对路径</th><th>状态</th><th>操作</th></tr></thead>
    <tbody></tbody></table></div>
    <p>文件已选不等于已核验。打开仍需原有两阶段确认和文件／活模型双重核验；这不是导航或无损恢复。</p>`;
  const directory = panel.querySelector<HTMLInputElement>("input")!;
  const choose = panel.querySelector<HTMLButtonElement>('[data-action="choose"]')!;
  const close = panel.querySelector<HTMLButtonElement>('[data-action="close"]')!;
  const projectName = panel.querySelector<HTMLElement>("[data-project]")!;
  const status = panel.querySelector<HTMLElement>("[data-status]")!;
  const body = panel.querySelector("tbody")!;
  let project: AtlasProjectFiles | null = null;
  let generation = 0;
  let closed = false;
  let busy = false;

  function dispose(): void {
    if (closed || busy) return;
    closed = true;
    generation++;
    project = null;
    directory.onchange = null;
    directory.value = "";
    if (activePanel === panel) activePanel = null;
    if (panel.open) panel.close();
    panel.remove();
  }

  function updateButtons(): void {
    choose.disabled = close.disabled = directory.disabled = busy;
    for (const button of body.querySelectorAll<HTMLButtonElement>("button")) {
      button.disabled = busy || button.dataset.available !== "true";
    }
  }

  function render(): void {
    body.replaceChildren();
    if (!project) return;
    projectName.textContent = `${project.rootName} ／ ${project.manifest.project.name}`;
    projectName.style.unicodeBidi = "plaintext";
    for (const asset of project.assets) {
      const row = body.insertRow();
      for (const value of [asset.map.name, asset.map.kind === "world" ? "世界" : "局部", asset.map.asset.path]) {
        const label = document.createElement("bdi");
        label.textContent = value;
        row.insertCell().append(label);
      }
      const available = !!asset.file && asset.map.georeference.verified;
      row.insertCell().textContent = !asset.file
        ? "缺少文件"
        : !asset.map.georeference.verified
          ? "地理记录未核验，不能打开"
          : "文件已选，待双重核验";
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "核验并打开";
      button.dataset.atlasMap = asset.map.id;
      button.dataset.available = String(available);
      button.onclick = () => {
        void openMap(asset.map.id);
      };
      row.insertCell().append(button);
    }
    status.textContent = project.assets.some(asset => asset.file)
      ? "目录匹配完成，未读取任何地图内容；请选择要核验打开的地图。"
      : "此目录没有清单声明的地图文件；所有缺失项均不可打开。";
    updateButtons();
  }

  async function openMap(mapId: string): Promise<void> {
    if (closed || busy || !project) return;
    const snapshot = project;
    const asset = snapshot.assets.find(asset => asset.map.id === mapId);
    if (!asset?.file || !asset.map.georeference.verified) return;
    busy = true;
    updateButtons();
    status.textContent = "正在请求核验载入。取消或另存停留请使用上方载图确认；结算前不能关闭或更换项目。";
    try {
      const outcome = await Services.Load.uploadAtlasMap(asset.file, snapshot.manifestJSON, mapId);
      status.textContent = resultMessage(outcome);
    } catch (error) {
      status.textContent = `载图调用异常：${errorText(error)}。当前模型可能已部分替换；关闭本窗口查看详情，必要时完整重载。`;
    } finally {
      busy = false;
      if (!closed) updateButtons();
    }
  }

  directory.onchange = async () => {
    if (closed || busy) return;
    const files = Array.from(directory.files ?? []);
    directory.value = "";
    const ticket = ++generation;
    project = null;
    projectName.textContent = "";
    body.replaceChildren();
    status.textContent = files.length ? "正在读取根目录 atlas.json；尚未读取地图。" : "未取得目录文件，请重新选择。";
    if (!files.length) return;
    try {
      const selected = await readAtlasProjectFiles(files);
      if (closed || ticket !== generation) return;
      project = selected;
      render();
    } catch (error) {
      if (closed || ticket !== generation) return;
      status.textContent = `无法打开项目：${errorText(error)}`;
    }
  };
  choose.onclick = () => {
    if (!busy && !closed) directory.click();
  };
  close.onclick = dispose;
  panel.addEventListener("cancel", event => {
    event.preventDefault();
    if (!busy) dispose();
  });
  panel.addEventListener("close", () => {
    if (!busy) dispose();
    else if (!panel.open) panel.showModal();
  });
  document.body.append(panel);
  activePanel = panel;
  try {
    panel.showModal();
  } catch (error) {
    dispose();
    tip(`无法打开图集面板：${errorText(error)}`, true, "error", 8000);
  }
}

function resultMessage(outcome: MapLoadOutcome): string {
  switch (outcome.type) {
    case "loaded":
      return "最近一次打开成功：文件与实际采用模型核验通过。不表示后续编辑仍与文件一致。";
    case "cancelled":
      return "已停留，未因另存自动继续切图。保存过快照不等于当前所有修改已保存。";
    case "busy":
      return "其他读取、保存或生成尚未完成，本次未开始替换。请稍后重试。";
    case "rejected":
      return "当前状态不允许载图；请先完成编辑或当前操作。";
    case "failed":
      return `打开失败：${errorText(outcome.error)}。采用可能已开始，当前模型可能混合并隔离保存；关闭本窗口查看详情，必要时完整重载。`;
  }
}

function errorText(error: unknown): string {
  try {
    return (error instanceof Error ? error.message : String(error)).slice(0, 4000);
  } catch {
    return "未知错误";
  }
}
