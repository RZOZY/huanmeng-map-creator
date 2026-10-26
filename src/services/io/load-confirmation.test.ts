// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authorizeMapReplacement, confirmMapDeparture } from "./load-confirmation";

const originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");

function dialog(): HTMLDialogElement {
  return document.querySelector<HTMLDialogElement>("#mapLoadDeparture")!;
}

function click(text: string): void {
  const action = [...dialog().querySelectorAll("button")].find(element => element.textContent === text)!;
  action.click();
}

beforeEach(() => {
  document.body.replaceChildren();
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const [name, descriptor] of [
    ["showModal", originalShowModal],
    ["close", originalClose]
  ] as const) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  }
  document.body.replaceChildren();
});

describe("conservative departure choice", () => {
  it("keeps the map by default and closes the modal on cancel", async () => {
    const save = vi.fn();
    const choice = confirmMapDeparture(true, save);
    expect(dialog().open).toBe(true);
    expect(dialog().querySelector("button[autofocus]")?.textContent).toContain("取消");
    click("取消，保留当前地图");
    await expect(choice).resolves.toBe(false);
    expect(save).not.toHaveBeenCalled();
    expect(dialog()).toBeNull();
  });

  it("closes synchronously and invokes save in the same click exactly once", async () => {
    let clickReturned = false;
    const save = vi.fn(() => {
      expect(clickReturned).toBe(false);
      expect(dialog()).toBeNull();
    });
    const choice = confirmMapDeparture(true, save);
    const action = [...dialog().querySelectorAll("button")].find(element => element.textContent === "另存副本并停留")!;
    action.click();
    action.click();
    clickReturned = true;
    expect(save).toHaveBeenCalledOnce();
    await expect(choice).resolves.toBe(false);
  });

  it("only authorizes reading, not replacement", async () => {
    const choice = confirmMapDeparture(true, vi.fn());
    click("准备读取目标");
    await expect(choice).resolves.toBe(true);
    expect(dialog()).toBeNull();
  });

  it("turns Escape into a stay result", async () => {
    const choice = confirmMapDeparture(true, vi.fn());
    const event = new Event("cancel", { cancelable: true });
    dialog().dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    await expect(choice).resolves.toBe(false);
  });

  it("turns a native close into a stay result", async () => {
    const choice = confirmMapDeparture(true, vi.fn());
    dialog().close();
    await expect(choice).resolves.toBe(false);
  });

  it("does not offer saving a quarantined mixed model", async () => {
    const save = vi.fn();
    const choice = confirmMapDeparture(false, save);
    const action = [...dialog().querySelectorAll("button")].find(element => element.textContent === "另存副本并停留")!;
    expect(action.disabled).toBe(true);
    action.click();
    expect(save).not.toHaveBeenCalled();
    click("取消，保留当前地图");
    await expect(choice).resolves.toBe(false);
  });

  it("rejects a failed modal setup and removes its DOM", async () => {
    vi.mocked(HTMLDialogElement.prototype.showModal).mockImplementationOnce(() => {
      throw new Error("cannot show");
    });
    await expect(confirmMapDeparture(true, vi.fn())).rejects.toThrow("cannot show");
    expect(dialog()).toBeNull();
  });

  it("still settles when native close fails", async () => {
    const choice = confirmMapDeparture(true, vi.fn());
    vi.mocked(HTMLDialogElement.prototype.close).mockImplementationOnce(() => {
      throw new Error("cannot close");
    });
    click("取消，保留当前地图");
    await expect(choice).resolves.toBe(false);
    expect(dialog()).toBeNull();
  });
});

describe("final synchronous adoption gate", () => {
  it("calls start in the discard handler and keeps the modal until disposal", () => {
    let clickReturned = false;
    const controls = { start: vi.fn(() => expect(clickReturned).toBe(false)), cancel: vi.fn() };
    const dispose = authorizeMapReplacement(controls);
    expect(dialog().classList.contains("dialog")).toBe(false);
    expect(dialog().querySelector("form")).toBeNull();
    click("放弃当前修改并采用目标");
    clickReturned = true;
    expect(controls.start).toHaveBeenCalledOnce();
    expect(dialog().open).toBe(true);
    expect(dialog().textContent).toContain("正在采用");
    expect([...dialog().querySelectorAll("button")].every(element => element.disabled)).toBe(true);
    dispose();
    expect(dialog()).toBeNull();
    expect(controls.cancel).not.toHaveBeenCalled();
  });

  it("blocks repeat discard, cancel and Escape after adoption starts", () => {
    const controls = { start: vi.fn(), cancel: vi.fn() };
    const dispose = authorizeMapReplacement(controls);
    click("放弃当前修改并采用目标");
    click("放弃当前修改并采用目标");
    click("取消，保留当前地图");
    const event = new Event("cancel", { cancelable: true });
    dialog().dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(controls.start).toHaveBeenCalledOnce();
    expect(controls.cancel).not.toHaveBeenCalled();
    expect(dialog().open).toBe(true);
    dispose();
  });

  it("cancels a pending authorization without starting adoption", () => {
    const controls = { start: vi.fn(), cancel: vi.fn() };
    const dispose = authorizeMapReplacement(controls);
    click("取消，保留当前地图");
    expect(controls.cancel).toHaveBeenCalledOnce();
    expect(controls.start).not.toHaveBeenCalled();
    dispose();
    expect(controls.cancel).toHaveBeenCalledOnce();
  });

  it("cancels on native close before starting", () => {
    const controls = { start: vi.fn(), cancel: vi.fn() };
    const dispose = authorizeMapReplacement(controls);
    dialog().close();
    expect(controls.cancel).toHaveBeenCalledOnce();
    dispose();
  });

  it("does not turn a native close during adoption into cancellation", () => {
    const controls = { start: vi.fn(), cancel: vi.fn() };
    const dispose = authorizeMapReplacement(controls);
    click("放弃当前修改并采用目标");
    dialog().close();
    expect(controls.cancel).not.toHaveBeenCalled();
    expect(dialog().open).toBe(true);
    dispose();
    dispose();
  });

  it("fails closed when the final modal cannot open", () => {
    const controls = { start: vi.fn(), cancel: vi.fn() };
    vi.mocked(HTMLDialogElement.prototype.showModal).mockImplementationOnce(() => {
      throw new Error("cannot show");
    });
    expect(() => authorizeMapReplacement(controls)).toThrow("cannot show");
    expect(controls.start).not.toHaveBeenCalled();
    expect(controls.cancel).not.toHaveBeenCalled();
    expect(dialog()).toBeNull();
  });
});
