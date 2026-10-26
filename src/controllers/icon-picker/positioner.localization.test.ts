// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { CustomIcons, type IconPicture, Icons } from "@/components/icons";
import "@/components/shared/slider-input";
import { clearMainTip, showDataTip } from "@/components/tooltips";
import { closePositioner, openPositioner } from "./positioner";

interface DialogSettings {
  title: string;
  width: string;
  position: { my: string; at: string; of: string };
  close: () => void;
  buttons: Record<string, (this: HTMLElement) => void>;
}

const dialogs = new Map<HTMLElement, DialogSettings>();
const originalIcons = options.map.customIcons;
const artwork =
  '<g><title>Captain Morgan 42</title><desc>Keep my English note</desc><text x="10" y="20">XIV</text></g>';
const imageUrl = "https://example.com/My%20Icon.png?label=KeepEnglish&v=7#original";

function element<T extends Element = HTMLElement>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Missing ${selector}`);
  return node;
}

function settings(): DialogSettings {
  const result = dialogs.get(element<HTMLElement>("#iconPositioner"));
  if (!result) throw new Error("Positioner was not initialized");
  return result;
}

function press(label: string): void {
  const button = [...document.querySelectorAll<HTMLButtonElement>(".ui-dialog-buttonpane button")].find(
    node => node.textContent === label
  );
  if (!button) throw new Error(`Missing button ${label}`);
  button.click();
}

function inputZoom(value: string, type = "range"): void {
  const input = element<HTMLInputElement>(`#iconPositioner input[type=${type}]`);
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function frame(id = "custom-svg"): string | null {
  return element(`#${id}`).getAttribute("viewBox");
}

beforeEach(() => {
  dialogs.clear();
  document.documentElement.lang = "en";
  document.body.innerHTML = '<div id="dialogs"></div><div id="tooltip"></div><svg id="defElements"><defs/></svg>';
  options.map.customIcons = [
    { id: "custom-svg", kind: "svg", content: artwork, viewBox: "0 0 100 100" },
    { id: "custom-image", kind: "image", content: imageUrl, viewBox: "0 0 100 100" }
  ];
  vi.stubGlobal("Options", { iconsChanged: vi.fn() });
  Icons.syncCustom();
  vi.stubGlobal("$", (dialog: HTMLElement) => ({
    dialog(settings: DialogSettings | "close" | "destroy") {
      if (settings === "close") dialogs.get(dialog)?.close();
      else if (settings === "destroy") {
        dialogs.delete(dialog);
        dialog.parentElement?.querySelector(".ui-dialog-buttonpane")?.remove();
      } else {
        dialog.classList.add("ui-dialog-content");
        dialogs.set(dialog, settings);
        const buttons = document.createElement("div");
        buttons.className = "ui-dialog-buttonpane";
        for (const [label, click] of Object.entries(settings.buttons)) {
          const button = document.createElement("button");
          button.textContent = label;
          button.addEventListener("click", () => click.call(dialog));
          buttons.append(button);
        }
        dialog.after(buttons);
      }
    }
  }));
});

afterEach(() => {
  closePositioner();
  clearMainTip();
  options.map.customIcons = originalIcons;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

test("the real entry renders Chinese positioner chrome without translating user artwork or machine values", () => {
  openPositioner("custom-svg");
  expect(settings().title).toBe("调整图标位置");
  expect(settings().width).toBe("20em");
  expect(settings().position).toEqual({ my: "center", at: "center", of: "svg" });
  expect(element<HTMLElement>("#iconPositioner").dataset.icon).toBe("custom-svg");
  expect(element("#iconPositioner .controls > span").textContent).toBe("缩放");
  expect(element("#iconPositioner .fit").textContent).toBe("适应图片");
  expect([...document.querySelectorAll(".ui-dialog-buttonpane button")].map(button => button.textContent)).toEqual([
    "应用",
    "取消"
  ]);

  for (const [selector, text] of [
    [".stage", "拖动平移，滚动缩放"],
    [".fit", "根据图片的可见内容调整边框"],
    [".previews", "图标在地图上的尺寸预览"]
  ]) {
    const node = element<HTMLElement>(`#iconPositioner ${selector}`);
    expect(node.dataset.tip).toBe(text);
    node.addEventListener("mousemove", showDataTip);
    node.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    expect(element("#tooltip").textContent).toBe(text);
  }

  expect(element("#iconPositioner .stage svg").getAttribute("viewBox")).toBe("-25 -25 150 150");
  expect(element("#iconPositioner .art").innerHTML).toBe(element("#custom-svg").innerHTML);
  expect(element("#iconPositioner .art title").textContent).toBe("Captain Morgan 42");
  expect(element("#iconPositioner .art desc").textContent).toBe("Keep my English note");
  expect(element("#iconPositioner .art text").textContent).toBe("XIV");
  expect([...document.querySelectorAll("#iconPositioner .previews use")].map(use => use.getAttribute("href"))).toEqual([
    "#custom-svg",
    "#custom-svg",
    "#custom-svg"
  ]);
  const range = element<HTMLInputElement>("#iconPositioner input[type=range]");
  expect([range.min, range.max, range.value]).toEqual(["25", "400", "100"]);
});

test("the Chinese Cancel button rolls back real slider previews without updating the stored picture", () => {
  openPositioner("custom-svg");
  inputZoom("200");
  expect(frame()).toBe("25 25 50 50");
  expect(element("#iconPositioner .stage svg").getAttribute("viewBox")).toBe("12.5 12.5 75 75");
  expect(CustomIcons.get("custom-svg")?.viewBox).toBe("0 0 100 100");
  press("取消");
  expect(document.getElementById("iconPositioner")).toBeNull();
  expect(frame()).toBe("0 0 100 100");
  expect(CustomIcons.get("custom-svg")?.content).toBe(artwork);
  expect(Options.iconsChanged).not.toHaveBeenCalled();
});

test("the Chinese Apply button persists only the frame and a later cancellation preserves it", () => {
  const original: IconPicture = { ...CustomIcons.get("custom-image")! };
  openPositioner("custom-image");
  expect(element("#iconPositioner .art image").getAttribute("href")).toBe(imageUrl);
  inputZoom("200");
  press("应用");
  expect(document.getElementById("iconPositioner")).toBeNull();
  expect(CustomIcons.get("custom-image")).toEqual({ ...original, id: "custom-image", viewBox: "25 25 50 50" });
  expect(Options.iconsChanged).toHaveBeenCalledOnce();
  expect(frame("custom-image")).toBe("25 25 50 50");
  expect(element("#custom-image image").getAttribute("href")).toBe(imageUrl);

  openPositioner("custom-image");
  inputZoom("200");
  expect(frame("custom-image")).toBe("37.5 37.5 25 25");
  press("取消");
  expect(frame("custom-image")).toBe("25 25 50 50");
  expect(CustomIcons.get("custom-image")?.content).toBe(imageUrl);
  expect(Options.iconsChanged).toHaveBeenCalledOnce();
});

test.each(["pointerup", "pointercancel"])("dragging keeps its coordinate conversion and stops after %s", endEvent => {
  openPositioner("custom-svg");
  const stage = element<SVGSVGElement>("#iconPositioner .stage svg");
  const capture = vi.fn();
  Object.defineProperty(stage, "setPointerCapture", { value: capture });
  vi.spyOn(stage, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 200, 200));
  stage.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 7, clientX: 10, clientY: 20 }));
  stage.dispatchEvent(new PointerEvent("pointermove", { pointerId: 7, clientX: 30, clientY: 10 }));
  expect(capture).toHaveBeenCalledExactlyOnceWith(7);
  expect(frame()).toBe("-15 7.5 100 100");
  expect(CustomIcons.get("custom-svg")?.viewBox).toBe("0 0 100 100");
  stage.dispatchEvent(new PointerEvent(endEvent, { pointerId: 7 }));
  stage.dispatchEvent(new PointerEvent("pointermove", { pointerId: 7, clientX: 90, clientY: 90 }));
  expect(frame()).toBe("-15 7.5 100 100");
  closePositioner();
  expect(frame()).toBe("0 0 100 100");
});

test("wheel zoom prevents scrolling and typed zoom keeps the existing clamp and commit behavior", () => {
  openPositioner("custom-svg");
  const wheel = new WheelEvent("wheel", { deltaY: -100, cancelable: true });
  element("#iconPositioner .stage svg").dispatchEvent(wheel);
  expect(wheel.defaultPrevented).toBe(true);
  expect(frame()).toBe("4.545 4.545 90.909 90.909");

  const number = element<HTMLInputElement>("#iconPositioner input[type=number]");
  for (const [typed, committed, expectedFrame] of [
    ["800", "400", "37.5 37.5 25 25"],
    ["10", "25", "-150 -150 400 400"]
  ]) {
    inputZoom(typed, "number");
    expect(frame()).toBe(expectedFrame);
    expect(number.value).toBe(typed);
    number.dispatchEvent(new Event("change", { bubbles: true }));
    expect(number.value).toBe(committed);
  }
});

test("the translated Fit action uses the real picture fitter and displays its Chinese success message", async () => {
  const previous = Object.getOwnPropertyDescriptor(SVGElement.prototype, "getBBox");
  Object.defineProperty(SVGElement.prototype, "getBBox", {
    configurable: true,
    value: () => ({ x: 10, y: 20, width: 40, height: 20 })
  });
  try {
    openPositioner("custom-svg");
    element<HTMLButtonElement>("#iconPositioner .fit").click();
    await vi.waitFor(() => expect(frame()).toBe("8 8 44 44"));
    expect(element("#tooltip").textContent).toBe("已根据图片调整边框");
    expect(CustomIcons.get("custom-svg")?.viewBox).toBe("0 0 100 100");
    press("取消");
    expect(frame()).toBe("0 0 100 100");
  } finally {
    if (previous) Object.defineProperty(SVGElement.prototype, "getBBox", previous);
    else Reflect.deleteProperty(SVGElement.prototype, "getBBox");
  }
});

test("closing by icon id and reopening still restore only the active unapplied frame", () => {
  openPositioner("custom-svg");
  inputZoom("200");
  closePositioner("custom-image");
  expect(frame()).toBe("25 25 50 50");
  expect(document.getElementById("iconPositioner")).not.toBeNull();
  openPositioner("custom-image");
  expect(frame()).toBe("0 0 100 100");
  expect(element<HTMLElement>("#iconPositioner").dataset.icon).toBe("custom-image");
  inputZoom("200");
  closePositioner("custom-image");
  expect(frame("custom-image")).toBe("0 0 100 100");
  expect(document.getElementById("iconPositioner")).toBeNull();
});

test("missing icons and missing symbol elements still do not open a positioner", () => {
  openPositioner("custom-missing");
  expect(document.getElementById("iconPositioner")).toBeNull();
  element("#custom-svg").remove();
  openPositioner("custom-svg");
  expect(document.getElementById("iconPositioner")).toBeNull();
});
