// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import "./options-model";
import { ICONS_STORAGE_KEY, STORAGE_KEY } from "./options-model";

const icon = {
  id: "custom-1a2b3c4d",
  kind: "image" as const,
  content: "data:image/png;base64,AA",
  viewBox: "0 0 100 100"
};
let stored: Map<string, unknown>;

beforeEach(() => {
  localStorage.clear();
  stored = new Map();
  vi.stubGlobal("ldb", {
    get: vi.fn(async (key: string) => stored.get(key) ?? null),
    set: vi.fn(async (key: string, value: unknown) => void stored.set(key, structuredClone(value)))
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const saved = () => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");

function deferredWrite() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flushWrites() {
  for (let turn = 0; turn < 4; turn++) await Promise.resolve();
}

async function prepareIconWrites() {
  vi.useFakeTimers();
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  stored.set(ICONS_STORAGE_KEY, [icon]);
  Options.restore();
  await Options.restoreIcons();
  const first = deferredWrite();
  const second = deferredWrite();
  const set = vi.mocked(ldb.set).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  options.map.customIcons = [icon, { ...icon, id: "custom-5e6f7a8b" }];
  Options.persist();
  expect(set).toHaveBeenCalledExactlyOnceWith(ICONS_STORAGE_KEY, options.map.customIcons);
  return { first, second, set, log };
}

function changeIcons(kind: "revision" | "reference") {
  const next = { ...icon, id: "custom-9a0b1c2d" };
  if (kind === "revision") {
    options.map.customIcons.push(next);
    Options.iconsChanged();
  } else {
    options.map.customIcons = [...options.map.customIcons, next];
  }
  Options.persist();
}

it("keeps custom icons in IndexedDB and never in localStorage", async () => {
  stored.set(ICONS_STORAGE_KEY, [icon, { id: "broken" }]);
  Options.restore();
  await Options.restoreIcons();

  expect(options.map.customIcons).toEqual([icon]); // the broken one is dropped on its own
  expect(saved().map.customIcons).toBeUndefined();

  options.map.customIcons.push({ ...icon, id: "custom-5e6f7a8b" });
  Options.iconsChanged();
  Options.persist();
  expect(stored.get(ICONS_STORAGE_KEY)).toHaveLength(2);
  expect(saved().map.customIcons).toBeUndefined();
});

it("moves icons an earlier version kept in localStorage to IndexedDB", async () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ map: { customIcons: [icon] } }));
  Options.restore();
  expect(stored.has(ICONS_STORAGE_KEY)).toBe(false); // restore writes nothing before the stored icons are read
  await Options.restoreIcons();

  expect(stored.get(ICONS_STORAGE_KEY)).toEqual([icon]);
  expect(saved().map.customIcons).toBeUndefined();
});

it("writes no icons in a session whose IndexedDB never answers, so none there are lost", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("ldb", { get: vi.fn(() => new Promise(() => {})), set: vi.fn() });
  Options.restore();
  const restoring = Options.restoreIcons();
  await vi.advanceTimersByTimeAsync(5000);
  await restoring;

  Options.iconsChanged();
  Options.persist();
  expect(ldb.set).not.toHaveBeenCalled();
});

it.each(["QuotaExceededError", "AbortError"])("retries unchanged icons after a %s rejection", async name => {
  const { first, second, set, log } = await prepareIconWrites();
  const icons = options.map.customIcons;
  Options.persist();
  expect(set).toHaveBeenCalledTimes(1);
  const error = new DOMException("custom icon write failed", name);
  first.reject(error);
  await flushWrites();
  Options.persist();
  expect(set).toHaveBeenCalledTimes(2);
  expect(set).toHaveBeenLastCalledWith(ICONS_STORAGE_KEY, icons);
  second.resolve();
  await flushWrites();
  Options.persist();
  expect(set).toHaveBeenCalledTimes(2);
  expect(log).toHaveBeenCalledExactlyOnceWith(error);
});

it.each(["revision", "reference"] as const)(
  "does not clear a newer successful %s attempt when an older write rejects late",
  async kind => {
    const { first, second, set, log } = await prepareIconWrites();
    changeIcons(kind);
    expect(set).toHaveBeenCalledTimes(2);
    second.resolve();
    await flushWrites();
    const error = new DOMException("older custom icon write aborted", "AbortError");
    first.reject(error);
    await flushWrites();
    Options.persist();
    expect(set).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledExactlyOnceWith(error);
  }
);

it.each(["revision", "reference"] as const)(
  "does not replace a newer successful %s marker when an older write succeeds late",
  async kind => {
    const { first, second, set } = await prepareIconWrites();
    changeIcons(kind);
    second.resolve();
    await flushWrites();
    first.resolve();
    await flushWrites();
    Options.persist();
    expect(set).toHaveBeenCalledTimes(2);
  }
);

it.each(["revision", "reference"] as const)(
  "still retries a failed newer %s attempt after an older write succeeds late",
  async kind => {
    const { first, second, set, log } = await prepareIconWrites();
    changeIcons(kind);
    const icons = options.map.customIcons;
    const error = new DOMException("newer custom icon write failed", "QuotaExceededError");
    second.reject(error);
    await flushWrites();
    first.resolve();
    await flushWrites();
    Options.persist();
    expect(set).toHaveBeenCalledTimes(3);
    expect(set).toHaveBeenLastCalledWith(ICONS_STORAGE_KEY, icons);
    await flushWrites();
    Options.persist();
    expect(set).toHaveBeenCalledTimes(3);
    expect(log).toHaveBeenCalledExactlyOnceWith(error);
  }
);
