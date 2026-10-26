import { createAtlasNavigationPorts } from "@/components/atlas-navigation-ports";
import { tip } from "@/components/tooltips";
import { Services } from "@/services";
import { getCurrentAtlasIdentity } from "@/services/atlas/identity";
import type { AtlasNavigationDirection } from "@/services/atlas/navigation-plan";
import {
  type AtlasNavigationSessionResult,
  type AtlasNavigator,
  createAtlasNavigator
} from "@/services/atlas/navigation-session";
import { type AtlasProjectFiles, readAtlasProjectFiles } from "@/services/atlas/project-files";
import type { MapLoadOutcome } from "@/services/io/load-operation";

let activePanel: HTMLDialogElement | null = null;

/** Session-local File capabilities only; closing the idle panel releases its references. */
export function showAtlasProject(): void {
  if (activePanel) {
    if (!activePanel.open) activePanel.showModal();
    activePanel.querySelector<HTMLButtonElement>('[data-action="refresh-identity"]')?.click();
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
    <button type="button" data-action="minimize">收起并看地图</button>
    <button type="button" data-action="close">关闭并释放</button>
    <input id="atlasProjectDirectory" type="file" webkitdirectory multiple hidden aria-label="项目目录" />
    <p data-atlas-identity style="overflow-wrap:anywhere" aria-live="polite"></p>
    <button type="button" data-action="refresh-identity">刷新采用来源</button>
    <p data-project></p><p data-status role="status" aria-live="polite">尚未选择目录。</p>
    <div style="max-height:50vh;overflow:auto"><table style="width:100%;text-align:left">
    <thead><tr><th>地图</th><th>类型</th><th>相对路径</th><th>状态</th><th>操作</th></tr></thead>
    <tbody></tbody></table></div>
    <section data-atlas-navigation>
      <h4>跨图地点导航</h4>
      <label>地点 <select data-atlas-place aria-label="导航地点" disabled></select></label>
      <button type="button" data-direction="local" disabled>进入局部</button>
      <button type="button" data-direction="world" disabled>转到世界</button>
      <button type="button" data-action="back-view" disabled>返回上一视野</button>
      <p>按地点 UUID 和权威经纬度切图；仍需两阶段确认，会放弃未另存的修改。返回仅重读文件并恢复会话视野，不是无损恢复；收起面板可继续操作地图并保留本会话能力；可从载入窗重新展开。关闭或更换项目会清除返回记录。</p>
    </section>
    <p>文件已选不等于已核验。打开和导航均需文件／活模型双重核验；地图测绘是否正确仍须另行确认。</p>`;
  const directory = panel.querySelector<HTMLInputElement>("input")!;
  const choose = panel.querySelector<HTMLButtonElement>('[data-action="choose"]')!;
  const close = panel.querySelector<HTMLButtonElement>('[data-action="close"]')!;
  const minimize = panel.querySelector<HTMLButtonElement>('[data-action="minimize"]')!;
  const refresh = panel.querySelector<HTMLButtonElement>('[data-action="refresh-identity"]')!;
  const identityView = panel.querySelector<HTMLElement>("[data-atlas-identity]")!;
  const projectName = panel.querySelector<HTMLElement>("[data-project]")!;
  const status = panel.querySelector<HTMLElement>("[data-status]")!;
  const body = panel.querySelector("tbody")!;
  const places = panel.querySelector<HTMLSelectElement>("[data-atlas-place]")!;
  const local = panel.querySelector<HTMLButtonElement>('[data-direction="local"]')!;
  const world = panel.querySelector<HTMLButtonElement>('[data-direction="world"]')!;
  const back = panel.querySelector<HTMLButtonElement>('[data-action="back-view"]')!;
  let project: AtlasProjectFiles | null = null;
  let navigator: AtlasNavigator | null = null;
  let generation = 0;
  let closed = false;
  let busy = false;
  let minimizedCloseEvents = 0;

  function dispose(): void {
    if (closed || busy) return;
    closed = true;
    generation++;
    navigator?.dispose();
    navigator = null;
    project = null;
    directory.onchange = null;
    directory.value = "";
    window.removeEventListener("map:replacing", updateIdentity);
    if (activePanel === panel) activePanel = null;
    if (panel.open) panel.close();
    panel.remove();
  }

  function updateIdentity(): void {
    const identity = getCurrentAtlasIdentity();
    identityView.replaceChildren();
    if (!identity) {
      identityView.textContent = "当前图采用来源：未关联或身份已失效。只记录本会话完整核验采用的来源；可点击刷新核对。";
      updateButtons();
      return;
    }
    const label = (value: string) => {
      const element = document.createElement("bdi");
      element.textContent = value;
      return element;
    };
    identityView.append(
      "当前图采用来源：",
      label(identity.projectName),
      " ／ ",
      label(identity.mapName),
      `；项目 UUID：${identity.projectId}；地图 UUID：${identity.mapId}；地理修订：${identity.geographicRevision}；原始输入 SHA-256：${identity.sourceAssetSha256}。`,
      "此记录不证明当前模型仍与文件一致、地理仍有效或修改已保存；不能据此放行导航。"
    );
    updateButtons();
  }

  function updateButtons(): void {
    choose.disabled = close.disabled = minimize.disabled = refresh.disabled = directory.disabled = busy;
    for (const button of body.querySelectorAll<HTMLButtonElement>("button")) {
      button.disabled = busy || button.dataset.available !== "true";
    }
    const source = getCurrentAtlasIdentity();
    const asset = project?.assets.find(asset => asset.map.id === source?.mapId);
    const associated =
      !!source &&
      source.projectId === project?.manifest.project.id &&
      !!asset?.file &&
      asset.map.georeference.verified &&
      source.geographicRevision === asset.map.geographicRevision &&
      source.sourceAssetSha256 === asset.map.asset.sha256;
    const available = !busy && !!navigator && associated && places.options.length > 0;
    places.disabled = local.disabled = !available;
    world.disabled = !available || source?.mapId === project?.manifest.worldMapId;
    back.disabled = busy || !navigator?.canBack();
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
      if (!closed) {
        updateButtons();
        updateIdentity();
      }
    }
  }

  async function navigate(direction?: AtlasNavigationDirection): Promise<void> {
    if (closed || busy || !navigator) return;
    const session = navigator;
    busy = true;
    updateButtons();
    status.textContent = "正在核验导航起点及目标；仍需上方两阶段载图确认，结算前不能关闭或更换项目。";
    try {
      const result = direction ? await session.navigate(places.value, direction) : await session.back();
      status.textContent = navigationMessage(result);
    } catch (error) {
      status.textContent = `导航调用异常：${errorText(error)}。地图可能已替换；未提交返回视野，请核对当前图或完整重载。`;
    } finally {
      busy = false;
      if (!closed) updateIdentity();
    }
  }

  directory.onchange = async () => {
    if (closed || busy) return;
    const files = Array.from(directory.files ?? []);
    directory.value = "";
    const ticket = ++generation;
    navigator?.dispose();
    navigator = null;
    project = null;
    places.replaceChildren();
    projectName.textContent = "";
    body.replaceChildren();
    updateButtons();
    status.textContent = files.length ? "正在读取根目录 atlas.json；尚未读取地图。" : "未取得目录文件，请重新选择。";
    if (!files.length) return;
    try {
      const selected = await readAtlasProjectFiles(files);
      if (closed || ticket !== generation) return;
      project = selected;
      navigator = createAtlasNavigator(selected, createAtlasNavigationPorts());
      for (const place of selected.manifest.places) {
        const option = document.createElement("option");
        option.value = place.id;
        option.textContent = `${place.name} ／ ${place.coordinate.longitude}°, ${place.coordinate.latitude}° ／ ${place.id}`;
        option.style.unicodeBidi = "plaintext";
        places.append(option);
      }
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
  minimize.onclick = () => {
    if (busy || closed || !panel.open) return;
    minimizedCloseEvents++;
    panel.close();
  };
  local.onclick = () => {
    void navigate("local");
  };
  world.onclick = () => {
    void navigate("world");
  };
  back.onclick = () => {
    void navigate();
  };
  refresh.onclick = () => {
    if (!busy && !closed) updateIdentity();
  };
  panel.addEventListener("cancel", event => {
    event.preventDefault();
    if (!busy) dispose();
  });
  panel.addEventListener("close", () => {
    if (minimizedCloseEvents) {
      minimizedCloseEvents--;
      return;
    }
    if (!busy) dispose();
    else if (!panel.open) panel.showModal();
  });
  document.body.append(panel);
  activePanel = panel;
  window.addEventListener("map:replacing", updateIdentity);
  updateIdentity();
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

function navigationMessage(result: AtlasNavigationSessionResult): string {
  switch (result.status) {
    case "moved":
      return "导航完成：目标采用及视野前后核验通过。视野受当前窗口和缩放界限约束；不代表未保存修改已恢复。";
    case "load-result":
      return resultMessage(result.outcome);
    case "stale":
      return "本次载图已完成，但当前图或授权已变化；未提交返回记录。请核对当前图，不会重试过期导航。";
    case "view-failed":
      return `地图采用已完成，但视野未完成核验或恢复：${errorText(result.error)}。未提交返回记录；这不是自动回滚。`;
    case "blocked": {
      const messages: Partial<Record<typeof result.reason, string>> = {
        SOURCE_INVALID: "当前图未通过所选项目的来源与实际模型核验。请核对项目或显式重新打开完整地图。",
        MISSING_FILE: "缺少所需的源图或目标图文件。请重选完整目录，不会改用同名或较低详情的文件。",
        NO_LOCAL_MAP: "所选地点没有已核验的局部覆盖。",
        SAME_MAP: "当前已在优先目标地图，不重复载图。",
        NO_HISTORY: "没有仍有效的会话返回记录。",
        BUSY: "上一次导航尚未结算，请稍后重试。",
        DISPOSED: "此项目会话已关闭，请重新选择目录。"
      };
      return `导航未开始：${messages[result.reason] ?? "地点或地图记录不满足坐标与核验要求。请检查所选项目。"}`;
    }
  }
}

function errorText(error: unknown): string {
  try {
    return (error instanceof Error ? error.message : String(error)).slice(0, 4000);
  } catch {
    return "未知错误";
  }
}
