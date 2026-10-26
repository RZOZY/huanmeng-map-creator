// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Icons } from "@/components/icons";
import { clearMainTip } from "@/components/tooltips";
import { IconPicker } from ".";
import "@/generators/relief-generator";
import "@/generators/burgs-generator";
import "@/generators/goods-generator";
import "@/generators/emblems-generator";

const originalIcons = options.map.customIcons;
const linkedUrl = "https://example.com/My%20Icon.png?name=CaptainMorgan&label=wood#Original";
const artwork = "<g><title>Captain Morgan 42</title><text>wood 用户标签 XIV</text></g>";

beforeEach(() => {
  document.body.innerHTML = '<div id="dialogs"></div><div id="tooltip"></div>';
  options.map.customIcons = [
    { id: "custom-legacy-image", kind: "image", content: linkedUrl, viewBox: "1 2 30 40" },
    { id: "custom-legacy-svg", kind: "svg", content: artwork, viewBox: "0 0 100 100" }
  ];
  vi.spyOn(Icons, "html").mockImplementation(id => `<svg><use href="#${id}"/></svg>`);
  vi.stubGlobal("Options", { iconsChanged: vi.fn() });
  vi.stubGlobal("$", () => ({ dialog: vi.fn() }));
});

afterEach(() => {
  clearMainTip();
  options.map.customIcons = originalIcons;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

function open() {
  const onPick = vi.fn();
  const snapshot = JSON.stringify(options.map.customIcons);
  IconPicker.open({ current: "custom-legacy-image", onPick, live: true });
  const dialog = document.getElementById("iconPicker")!;
  return {
    dialog,
    onPick,
    snapshot,
    link: dialog.querySelector<HTMLInputElement>(".customAdd input")!,
    add: dialog.querySelector<HTMLButtonElement>('[data-action="link"]')!
  };
}

function expectFailure(dialog: HTMLElement, onPick: ReturnType<typeof vi.fn>, snapshot: string, message: string) {
  expect(document.getElementById("tooltip")!.textContent).toBe(message);
  expect(dialog.classList.contains("busy")).toBe(false);
  expect(dialog.querySelector<HTMLElement>(".choices .pressed")!.dataset.icon).toBe("custom-legacy-image");
  expect(JSON.stringify(options.map.customIcons)).toBe(snapshot);
  expect(onPick).not.toHaveBeenCalled();
  expect(Options.iconsChanged).not.toHaveBeenCalled();
}

test.each(["button", "Enter"])(
  "an invalid image link shows Chinese guidance through the real %s action",
  async action => {
    const { dialog, onPick, snapshot, link, add } = open();
    link.value = "ftp://example.com/KeepMyName.png";
    if (action === "button") add.click();
    else link.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await vi.waitFor(() => expect(dialog.classList.contains("busy")).toBe(false));
    expectFailure(dialog, onPick, snapshot, "请粘贴以 http:// 或 https:// 开头的图片链接。");
    expect(link.value).toBe("ftp://example.com/KeepMyName.png");
  }
);

test("a failed remote image reports Chinese guidance without replacing existing records", async () => {
  class FailingImage {
    onerror: (() => void) | null = null;
    set src(_url: string) {
      queueMicrotask(() => this.onerror?.());
    }
  }
  vi.stubGlobal("Image", FailingImage);
  const { dialog, onPick, snapshot, link, add } = open();
  link.value = linkedUrl;
  add.click();
  await vi.waitFor(() => expect(dialog.classList.contains("busy")).toBe(false));
  expectFailure(dialog, onPick, snapshot, "链接无法打开图片，或来源网站不允许访问。");
  expect(link.value).toBe(linkedUrl);
});

test("the real upload handler displays Chinese file guidance without changing names or old artwork", async () => {
  const { dialog, onPick, snapshot } = open();
  const file = new File(["Keep my English note"], "Captain Morgan.txt", { type: "text/plain" });
  vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (this: HTMLInputElement) {
    if (this.type !== "file") return;
    Object.defineProperty(this, "files", { value: [file], configurable: true });
    this.dispatchEvent(new Event("change"));
  });
  dialog.querySelector<HTMLButtonElement>('[data-action="upload"]')!.click();
  await vi.waitFor(() => expect(dialog.classList.contains("busy")).toBe(false));
  expectFailure(dialog, onPick, snapshot, "文件不是图片，请上传 SVG、PNG、JPEG 或 WebP 文件。");
  expect(file.name).toBe("Captain Morgan.txt");
});
