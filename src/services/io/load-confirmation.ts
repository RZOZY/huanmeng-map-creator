import type { MapLoadControls } from "./load-operation";

const DIALOG_ID = "mapLoadDeparture";

function createDialog(
  title: string,
  message: string
): {
  dialog: HTMLDialogElement;
  note: HTMLParagraphElement;
  actions: HTMLDivElement;
  dispose(): void;
} {
  const dialog = document.createElement("dialog");
  dialog.id = DIALOG_ID;
  dialog.setAttribute("aria-labelledby", `${DIALOG_ID}Title`);
  dialog.style.cssText = "max-width:34em;padding:1.4em;color:CanvasText;background:Canvas;border-radius:6px";
  const heading = document.createElement("h3");
  heading.id = `${DIALOG_ID}Title`;
  heading.textContent = title;
  const note = document.createElement("p");
  note.textContent = message;
  const actions = document.createElement("div");
  actions.style.cssText = "display:flex;gap:.6em;flex-wrap:wrap;justify-content:flex-end";
  dialog.append(heading, note, actions);
  document.body.append(dialog);
  return {
    dialog,
    note,
    actions,
    dispose() {
      try {
        if (dialog.open) dialog.close();
      } finally {
        dialog.remove();
      }
    }
  };
}

function button(actions: HTMLElement, text: string, action: () => void): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = text;
  element.addEventListener("click", action);
  actions.append(element);
  return element;
}

/** Always ask for an existing map: the serializable projection is not an exact dirty detector. */
export function confirmMapDeparture(canSave: boolean, onSave: () => void): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const view = createDialog(
      "读取另一张地图",
      "无法精确判断未保存的修改。可以取消、另存副本并停留，或先读取目标供检查；检查完成后仍会再次确认，才替换当前地图。"
    );
    let settled = false;
    const finish = (proceed: boolean) => {
      if (settled) return;
      settled = true;
      try {
        view.dispose();
      } catch {
        // The view is removed in finally; cleanup must not trap the load lease.
      }
      resolve(proceed);
    };
    const stay = button(view.actions, "取消，保留当前地图", () => finish(false));
    stay.autofocus = true;
    const save = button(view.actions, "另存副本并停留", () => {
      if (settled) return;
      finish(false);
      onSave();
    });
    save.disabled = !canSave;
    if (!canSave) save.title = "当前地图处于采用失败隔离状态，不能另存；可取消或重新读取完整地图";
    button(view.actions, "准备读取目标", () => finish(true));
    view.dialog.addEventListener("cancel", event => {
      event.preventDefault();
      finish(false);
    });
    view.dialog.addEventListener("close", () => finish(false));
    try {
      view.dialog.showModal();
    } catch (error) {
      settled = true;
      view.dispose();
      reject(error);
    }
  });
}

/** The discard click calls start directly; the modal remains blocking throughout async adoption. */
export function authorizeMapReplacement(controls: MapLoadControls): () => void {
  const view = createDialog(
    "确认替换当前地图",
    "目标已读取并完成结构预检，但尚未替换当前地图。预检不保证迁移或绘制一定成功。继续将放弃当前图中尚未另存的修改；取消则保留当前图。"
  );
  let busy = false;
  let disposed = false;
  const cancel = button(view.actions, "取消，保留当前地图", () => {
    if (!busy && !disposed) controls.cancel();
  });
  cancel.autofocus = true;
  const discard = button(view.actions, "放弃当前修改并采用目标", () => {
    if (busy || disposed) return;
    busy = true;
    cancel.disabled = true;
    discard.disabled = true;
    view.note.textContent = "正在采用目标地图，请等待。此阶段不能取消；失败后会隔离保存，需重新读取完整地图。";
    controls.start();
  });
  view.dialog.addEventListener("cancel", event => {
    event.preventDefault();
    if (!busy && !disposed) controls.cancel();
  });
  view.dialog.addEventListener("close", () => {
    if (disposed) return;
    if (!busy) controls.cancel();
    else if (!view.dialog.open && view.dialog.isConnected) view.dialog.showModal();
  });
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    view.dispose();
  };
  try {
    view.dialog.showModal();
  } catch (error) {
    dispose();
    throw error;
  }
  return dispose;
}
