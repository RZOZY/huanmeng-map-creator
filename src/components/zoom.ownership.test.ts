// @vitest-environment jsdom
import { select, zoomTransform } from "d3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/layers", () => ({ Layers: { draw: vi.fn() } }));
vi.mock("@/renderers/viewport/viewport-renderer", () => ({
  ViewportLayers: { schedule: vi.fn(), renderNow: vi.fn() }
}));

import { Layers } from "@/components/layers";
import { setViewportSize, setViewportTransform, viewport } from "@/components/viewport";
import { ViewportLayers } from "@/renderers/viewport/viewport-renderer";
import { applyZoomBehavior, setMapZoom, setTranslateExtent, setZoomExtent, stopMapZoom, zoomTo } from "./zoom";

const roots: SVGSVGElement[] = [];
const frames = new Map<number, FrameRequestCallback>();
let nextFrameId = 0;
let map: SVGSVGElement;
const wait = (duration: number) => new Promise<void>(resolve => setTimeout(resolve, duration));

function createMap(): SVGSVGElement {
  const root = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  root.id = "map";
  root.innerHTML = '<g id="viewbox"></g><g id="labels"></g><g id="markers"></g><g id="burgIcons"></g>';
  // jsdom lacks the SVG lengths d3 reads for its default zoom extent.
  Object.defineProperties(root, {
    width: { value: { baseVal: { value: 1000 } } },
    height: { value: { baseVal: { value: 600 } } }
  });
  document.body.append(root);
  roots.push(root);
  return root;
}

function wheel(root: SVGSVGElement, deltaY: number): void {
  root.dispatchEvent(new WheelEvent("wheel", { deltaY, clientX: 500, clientY: 300, cancelable: true }));
}

function flushFrames(): void {
  const callbacks = [...frames.values()];
  frames.clear();
  for (const callback of callbacks) callback(performance.now());
}

const viewbox = (root: SVGSVGElement) => root.getElementById("viewbox")!;

beforeEach(() => {
  vi.clearAllMocks();
  frames.clear();
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: FrameRequestCallback) => {
      const id = ++nextFrameId;
      frames.set(id, callback);
      return id;
    })
  );
  vi.stubGlobal(
    "cancelAnimationFrame",
    vi.fn((id: number) => frames.delete(id))
  );
  Object.assign(globalThis, { customization: 0 });
  options.app.performance.stateHalos = false;
  options.app.performance.viewportRedraw = "continuous";
  setViewportSize(1000, 600);
  setViewportTransform(1, 0, 0);
  setZoomExtent(1, 20);
  setTranslateExtent(0, 0, 1000, 600);
  map = createMap();
  applyZoomBehavior();
});

afterEach(async () => {
  for (const root of roots) select(root).interrupt();
  // Let real d3 wheel-idle timers settle before removing the fixture.
  await wait(170);
  for (const root of roots) root.remove();
  roots.length = 0;
  frames.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("zoom SVG ownership", () => {
  it.each(["detached", "noncurrent"])("ignores the old %s SVG's real transition and end", async state => {
    const old = map;
    zoomTo(500, 300, 8, 180);
    await wait(40);
    expect(zoomTransform(old).k).toBeGreaterThan(1);
    expect(zoomTransform(old).k).toBeLessThan(8);

    if (state === "detached") select(old).remove();
    else old.id = "old-map";
    map = createMap();
    applyZoomBehavior();
    zoomTo(500, 300, 2, 0);
    const currentViewport = { ...viewport };
    vi.clearAllMocks();

    await wait(210);

    expect(zoomTransform(old).k).toBe(8); // Removing a d3 selection does not interrupt its transition.
    expect(viewport).toEqual(currentViewport);
    expect(viewbox(map).getAttribute("transform")).toBe("translate(-500 -300) scale(2)");
    expect(ViewportLayers.renderNow).not.toHaveBeenCalled();
    expect(Layers.draw).not.toHaveBeenCalled();
  });

  it("initializes B even when its transform equals A's stored transform", () => {
    zoomTo(500, 300, 2, 0);
    select(map).remove();
    map = createMap();
    applyZoomBehavior();
    vi.clearAllMocks();

    zoomTo(500, 300, 2, 0);

    expect(viewport).toMatchObject({ scale: 2, x: -500, y: -300 });
    expect(viewbox(map).getAttribute("transform")).toBe("translate(-500 -300) scale(2)");
    expect(ViewportLayers.renderNow).toHaveBeenCalledTimes(1);
  });

  it("does not apply an old pending frame to a replacement SVG", () => {
    wheel(map, -1000);
    expect(frames.size).toBe(1);
    select(map).remove();
    map = createMap();
    applyZoomBehavior();
    setViewportTransform(2, -500, -300);

    flushFrames();

    expect(viewbox(map).getAttribute("transform")).toBeNull();
    expect(Layers.draw).not.toHaveBeenCalled();
    expect(ViewportLayers.schedule).not.toHaveBeenCalled();
  });

  it("does not let a late A callback consume B's pending update", () => {
    wheel(map, -1000);
    const staleFrame = [...frames.values()][0]!;
    select(map).remove();
    map = createMap();
    applyZoomBehavior();
    wheel(map, -500);

    expect(viewport.scale).toBe(2);
    expect(requestAnimationFrame).toHaveBeenCalledTimes(2);
    expect(frames.size).toBe(1);
    staleFrame(performance.now());
    expect(viewbox(map).getAttribute("transform")).toBeNull();
    expect(Layers.draw).not.toHaveBeenCalled();

    flushFrames();
    expect(viewbox(map).getAttribute("transform")).toBe("translate(-500 -300) scale(2)");
    expect(Layers.draw).toHaveBeenCalledWith("scaleBar");
    expect(Layers.draw).toHaveBeenCalledWith("coordinates");
    expect(ViewportLayers.schedule).toHaveBeenCalledTimes(1);
  });
});

describe("zoom cancellation", () => {
  it("clears pending frames and gesture flags on map:replacing while the old root is present", async () => {
    wheel(map, -1000);
    const staleFrame = [...frames.values()][0]!;
    expect(frames.size).toBe(1);

    window.dispatchEvent(new Event("map:replacing"));

    expect(map.isConnected).toBe(true);
    expect(cancelAnimationFrame).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
    staleFrame(performance.now());
    await wait(170);
    expect(viewbox(map).getAttribute("transform")).toBeNull();
    expect(ViewportLayers.renderNow).not.toHaveBeenCalled();
    expect(Layers.draw).not.toHaveBeenCalled();

    setMapZoom(2);
    expect(viewbox(map).getAttribute("transform")).toBe("translate(-500 -300) scale(2)");
    expect(ViewportLayers.renderNow).toHaveBeenCalledTimes(1);
  });

  it("interrupts only the current unnamed transition on map:replacing", async () => {
    select(map).transition("decoration").duration(120).attr("data-decoration", "done");
    zoomTo(500, 300, 8, 180);
    await wait(40);
    const stoppedViewport = { ...viewport };
    expect(stoppedViewport.scale).toBeGreaterThan(1);
    expect(stoppedViewport.scale).toBeLessThan(8);
    vi.clearAllMocks();

    window.dispatchEvent(new Event("map:replacing"));
    await wait(210);

    expect(viewport).toEqual(stoppedViewport);
    expect(zoomTransform(map).k).toBe(stoppedViewport.scale);
    expect(map.getAttribute("data-decoration")).toBe("done");
    expect(ViewportLayers.renderNow).not.toHaveBeenCalled();
    expect(Layers.draw).not.toHaveBeenCalled();
  });

  it("exports a synchronous stop for navigation capture and preserves subsequent normal zoom", async () => {
    zoomTo(500, 300, 8, 180);
    await wait(40);
    const stoppedViewport = { ...viewport };
    expect(stoppedViewport.scale).toBeGreaterThan(1);
    expect(stoppedViewport.scale).toBeLessThan(8);

    expect(stopMapZoom()).toBeUndefined();
    expect(frames.size).toBe(0);
    await wait(210);
    expect(viewport).toEqual(stoppedViewport);

    setMapZoom(4);
    expect(viewport.scale).toBe(4);
    expect(viewport.x).toBeCloseTo(-1500);
    expect(viewport.y).toBeCloseTo(-900);
    expect(viewbox(map).getAttribute("transform")).toBe(`translate(${viewport.x} ${viewport.y}) scale(4)`);
    zoomTo(500, 300, 3, 70);
    await wait(110);
    expect(viewport).toMatchObject({ scale: 3, x: -1000, y: -600 });
    expect(viewbox(map).getAttribute("transform")).toBe("translate(-1000 -600) scale(3)");
  });

  it("flushes the current pending frame for capture without consuming a later same-root frame", () => {
    wheel(map, -1000);
    const staleFrame = [...frames.values()][0]!;

    stopMapZoom();

    expect(viewport).toMatchObject({ scale: 4, x: -1500, y: -900 });
    expect(viewbox(map).getAttribute("transform")).toBe("translate(-1500 -900) scale(4)");
    expect(frames.size).toBe(0);
    expect(ViewportLayers.renderNow).toHaveBeenCalledTimes(1);
    wheel(map, 500);
    expect(viewport.scale).toBe(2);
    expect(frames.size).toBe(1);
    staleFrame(performance.now());
    expect(viewbox(map).getAttribute("transform")).toBe("translate(-1500 -900) scale(4)");

    flushFrames();
    expect(viewbox(map).getAttribute("transform")).toBe("translate(-500 -300) scale(2)");
  });

  it("can stop a queued transition before its first tick", async () => {
    zoomTo(500, 300, 8, 180);
    stopMapZoom();
    await wait(220);

    expect(viewport).toMatchObject({ scale: 1, x: 0, y: 0 });
    expect(zoomTransform(map).k).toBe(1);
    expect(ViewportLayers.renderNow).not.toHaveBeenCalled();
    expect(Layers.draw).not.toHaveBeenCalled();
  });

  it("uses the same map:replacing listener on repeated behavior application", () => {
    const addListener = vi.spyOn(window, "addEventListener");
    applyZoomBehavior();
    applyZoomBehavior();

    const listeners = addListener.mock.calls.filter(([type]) => type === "map:replacing");
    expect(listeners).toHaveLength(2);
    for (const [, listener] of listeners) expect(listener).toBe(listeners[0][1]);
  });
});
