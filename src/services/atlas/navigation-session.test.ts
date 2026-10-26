import { describe, expect, it, vi } from "vitest";
import type { MapLoadOutcome } from "@/services/io/load-operation";
import { geographicToPixel } from "./coordinates";
import type { AtlasIdentity } from "./identity";
import { type AtlasNavigationPorts, type AtlasView, createAtlasNavigator } from "./navigation-session";
import type { AtlasMapSnapshot } from "./observation";
import { readAtlasProjectFiles } from "./project-files";

const PROJECT = "10000000-0000-4000-8000-000000000001";
const WORLD = "a0000000-0000-4000-8000-000000000001";
const LOCAL = "b0000000-0000-4000-8000-000000000002";
const PLACE = "c0000000-0000-4000-8000-000000000001";
const LOADED = { type: "loaded" } as const;
type Receipt = Awaited<ReturnType<AtlasNavigationPorts["load"]>>;

function fixture() {
  const world = {
    id: WORLD,
    name: "同名地图",
    kind: "world",
    asset: { path: "maps/world.map", sha256: "a".repeat(64) },
    projection: "equirectangular",
    provenance: "测试夹具而非活模型证明",
    frame: { west: -180, east: 180, south: -90, north: 90 },
    size: { width: 1000, height: 500 },
    geographicRevision: 3,
    detailLevel: 0,
    parent: null as { mapId: string; geographicRevision: number } | null,
    georeference: { verified: true, evidence: "显式测试核验" }
  };
  return {
    schemaVersion: 1,
    project: { id: PROJECT, name: "测试项目" },
    worldMapId: WORLD,
    maps: [
      world,
      {
        ...world,
        id: LOCAL,
        kind: "local",
        asset: { path: "maps/local.map", sha256: "b".repeat(64) },
        frame: { west: 170, east: 190, south: -10, north: 10 },
        detailLevel: 1,
        parent: { mapId: WORLD, geographicRevision: 3 }
      }
    ],
    places: [
      {
        id: PLACE,
        name: "权威地点",
        kind: "聚落",
        coordinate: { longitude: -175, latitude: 0 },
        provenance: "权威记录",
        revision: 1,
        bindings: [WORLD, LOCAL].map(mapId => ({ mapId, kind: "marker", objectId: 7, geographicRevision: 3 }))
      }
    ]
  };
}

function entry(path: string, text = "不应由会话读取的地图字节") {
  const file = new File([text], path.split("/").at(-1) ?? "");
  const read = vi.fn(async () => new TextEncoder().encode(text).buffer);
  Object.defineProperties(file, {
    webkitRelativePath: { value: `工程/${path}` },
    arrayBuffer: { value: read }
  });
  return { file, read };
}

async function harness(omit: readonly string[] = []) {
  const raw = fixture();
  const manifestFile = entry("atlas.json", JSON.stringify(raw));
  const mapFiles = raw.maps.map(map => entry(map.asset.path));
  const project = await readAtlasProjectFiles([
    manifestFile.file,
    ...mapFiles.filter((_, index) => !omit.includes(raw.maps[index].id)).map(item => item.file)
  ]);
  const snapshots = new Map<string, AtlasMapSnapshot>(
    project.manifest.maps.map(map => [
      map.id,
      {
        sha256: map.asset.sha256,
        projection: "equirectangular",
        frame: { ...map.frame },
        size: { ...map.size },
        objects: [
          {
            kind: "marker",
            objectId: 7,
            position: geographicToPixel(project.manifest.places[0].coordinate, map.frame, map.size)
          }
        ]
      }
    ])
  );
  function identity(mapId: string, epoch: number): AtlasIdentity {
    const map = project.manifest.maps.find(map => map.id === mapId)!;
    return {
      projectId: PROJECT,
      projectName: "来源名称不参与认证",
      mapId,
      mapName: "来源名称不参与认证",
      mapKind: map.kind,
      geographicRevision: map.geographicRevision,
      sourceAssetSha256: map.asset.sha256,
      replacementEpoch: epoch
    };
  }
  const state = {
    epoch: 1,
    stable: true,
    identity: identity(WORLD, 1) as AtlasIdentity | null,
    live: snapshots.get(WORLD)!,
    view: { x: 123.125, y: 345.625, scale: 1.25 } as AtlasView
  };
  const events: string[] = [];
  function adopt(mapId: string): number {
    state.epoch += 1;
    state.stable = true;
    state.identity = identity(mapId, state.epoch);
    state.live = snapshots.get(mapId)!;
    return state.epoch;
  }
  const complete = (mapId: string, guard: () => boolean): Receipt => {
    if (!guard()) return { outcome: { type: "cancelled" }, replacementEpoch: null };
    events.push("adopt");
    return { outcome: LOADED, replacementEpoch: adopt(mapId) };
  };
  const load = vi.fn<AtlasNavigationPorts["load"]>(async (_file, _json, mapId, guard) => complete(mapId, guard));
  const observe = vi.fn((sha: string) => {
    events.push(`observe:${sha[0]}`);
    return state.live;
  });
  const captureView = vi.fn(() => {
    events.push("capture");
    return state.view;
  });
  const applyView = vi.fn((view: AtlasView) => {
    events.push("apply");
    state.view = { ...view };
  });
  const ports: AtlasNavigationPorts = {
    identity: () => state.identity,
    epoch: () => state.epoch,
    stable: () => state.stable,
    observe,
    captureView,
    applyView,
    load
  };
  const navigator = createAtlasNavigator(project, ports);
  return { project, mapFiles, state, ports, load, observe, captureView, applyView, navigator, adopt, complete, events };
}

type Harness = Awaited<ReturnType<typeof harness>>;
function drift(h: Harness) {
  h.state.live = { ...h.state.live, frame: { ...h.state.live.frame, west: h.state.live.frame.west + 1 } };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

async function forward(h: Harness) {
  expect((await h.navigator.navigate(PLACE, "local")).status).toBe("moved");
}

const nonloaded: MapLoadOutcome[] = [
  { type: "cancelled" },
  { type: "busy" },
  { type: "rejected" },
  { type: "failed", error: { opaque: "保留原错误" } }
];

describe("atlas navigation session", () => {
  it("loads exact selected capabilities by UUID and focuses authoritative map-local centers", async () => {
    const h = await harness();
    const result = await h.navigator.navigate(PLACE.toUpperCase(), "local");
    expect(result).toMatchObject({ status: "moved", outcome: LOADED, mapId: LOCAL });
    expect(h.load).toHaveBeenCalledWith(h.mapFiles[1].file, h.project.manifestJSON, LOCAL, expect.any(Function));
    expect(h.applyView).toHaveBeenCalledExactlyOnceWith({ x: 750, y: 250, scale: 2 });
    expect(h.navigator.canBack()).toBe(true);
    expect(h.observe).toHaveBeenCalledWith("a".repeat(64));
    expect(h.events.slice(-3)).toEqual(["observe:b", "apply", "observe:b"]);
    for (const file of h.mapFiles) expect(file.read).not.toHaveBeenCalled();
  });

  it("captures the latest pre-start view and back restores center/scale only after adoption", async () => {
    const h = await harness();
    const latest = { x: 173.125, y: 235.875, scale: 3.75 };
    h.load.mockImplementationOnce(async (_file, _json, mapId, guard) => {
      h.state.view = latest;
      return h.complete(mapId, guard);
    });
    await forward(h);
    latest.x = 999;
    expect((await h.navigator.back()).status).toBe("moved");
    expect(h.load.mock.calls[1].slice(0, 3)).toEqual([h.mapFiles[0].file, h.project.manifestJSON, WORLD]);
    expect(h.applyView).toHaveBeenLastCalledWith({ x: 173.125, y: 235.875, scale: 3.75 });
    expect(h.navigator.canBack()).toBe(false);
    expect(await h.navigator.back()).toMatchObject({ status: "blocked", reason: "NO_HISTORY" });
  });

  it("world navigation uses scale 1 and back pops rather than pushing a new forward step", async () => {
    const h = await harness();
    await forward(h);
    expect((await h.navigator.navigate(PLACE, "world")).status).toBe("moved");
    expect(h.applyView).toHaveBeenLastCalledWith({ x: (5 / 360) * 1000, y: 250, scale: 1 });
    expect((await h.navigator.back()).status).toBe("moved");
    expect(h.state.identity?.mapId).toBe(LOCAL);
    expect((await h.navigator.back()).status).toBe("moved");
    expect(h.state.identity?.mapId).toBe(WORLD);
    expect(h.navigator.canBack()).toBe(false);
  });

  it.each([WORLD, LOCAL])("blocks a ready plan when source or target %s has no selected File", async missing => {
    const h = await harness([missing]);
    expect(await h.navigator.navigate(PLACE, "local")).toMatchObject({ status: "blocked", reason: "MISSING_FILE" });
    expect(h.load).not.toHaveBeenCalled();
    expect(h.applyView).not.toHaveBeenCalled();
  });

  it.each([
    { projectId: "20000000-0000-4000-8000-000000000001" },
    { mapId: LOCAL },
    { sourceAssetSha256: "c".repeat(64) },
    { geographicRevision: 4 },
    { replacementEpoch: 0 }
  ])("rejects a mismatched source adoption identity %j before any file read", async patch => {
    const h = await harness();
    h.state.identity = { ...h.state.identity!, ...patch };
    expect(await h.navigator.navigate(PLACE, "local")).toMatchObject({ status: "blocked", reason: "SOURCE_INVALID" });
    expect(h.load).not.toHaveBeenCalled();
  });

  it.each(["missing", "unstable"] as const)("does not invent source identity for %s models", async mode => {
    const h = await harness();
    if (mode === "missing") h.state.identity = null;
    else h.state.stable = false;
    expect((await h.navigator.navigate(PLACE, "local")).status).toBe("blocked");
    expect(h.load).not.toHaveBeenCalled();
  });

  it.each(["frame", "object", "size"] as const)(
    "independently rejects initial same-epoch live %s drift",
    async field => {
      const h = await harness();
      if (field === "frame") drift(h);
      if (field === "size") h.state.live = { ...h.state.live, size: { width: 999, height: 500 } };
      if (field === "object") h.state.live = { ...h.state.live, objects: [] };
      expect(await h.navigator.navigate(PLACE, "local")).toMatchObject({
        status: "blocked",
        reason: "SOURCE_INVALID",
        error: expect.any(Error)
      });
      expect(h.state.epoch).toBe(1);
      expect(h.load).not.toHaveBeenCalled();
    }
  );

  it("blocks same-epoch live edits made while file reading or confirmation waits", async () => {
    const h = await harness();
    const readDone = deferred<void>();
    h.load.mockImplementationOnce(async (_file, _json, mapId, guard) => {
      await readDone.promise;
      return h.complete(mapId, guard);
    });
    const pending = h.navigator.navigate(PLACE, "local");
    drift(h);
    readDone.resolve();
    expect(await pending).toEqual({ status: "load-result", outcome: { type: "cancelled" } });
    expect(h.state.epoch).toBe(1);
    expect(h.captureView).not.toHaveBeenCalled();
    expect(h.applyView).not.toHaveBeenCalled();
  });

  it("blocks final source identity/epoch replacement and never adopts over external B", async () => {
    const h = await harness();
    h.load.mockImplementationOnce(async (_file, _json, mapId, guard) => {
      h.adopt(WORLD);
      const identityB = h.state.identity;
      const result = h.complete(mapId, guard);
      expect(h.state.identity).toBe(identityB);
      return result;
    });
    expect((await h.navigator.navigate(PLACE, "local")).status).toBe("load-result");
    expect(h.applyView).not.toHaveBeenCalled();
    expect(h.state.identity?.mapId).toBe(WORLD);
  });

  it("rechecks after captureView because stopping animations can synchronously replace the source", async () => {
    const h = await harness();
    h.captureView.mockImplementationOnce(() => {
      h.adopt(WORLD);
      return h.state.view;
    });
    expect(await h.navigator.navigate(PLACE, "local")).toEqual({
      status: "load-result",
      outcome: { type: "cancelled" }
    });
    expect(h.state.epoch).toBe(2);
    expect(h.applyView).not.toHaveBeenCalled();
  });

  it("sets busy synchronously, refuses dispose without pseudo-cancelling active adoption", async () => {
    const h = await harness();
    const settled = deferred<void>();
    h.load.mockImplementationOnce(async (_file, _json, mapId, guard) => {
      const receipt = h.complete(mapId, guard);
      expect(h.navigator.dispose()).toBe(false);
      await settled.promise;
      return receipt;
    });
    const pending = h.navigator.navigate(PLACE, "local");
    expect(await h.navigator.navigate(PLACE, "world")).toMatchObject({ status: "blocked", reason: "BUSY" });
    expect(await h.navigator.back()).toMatchObject({ status: "blocked", reason: "BUSY" });
    expect(h.navigator.dispose()).toBe(false);
    expect(h.navigator.canBack()).toBe(false);
    settled.resolve();
    expect((await pending).status).toBe("moved");
    expect(h.navigator.canBack()).toBe(true);
  });

  it("idle disposal releases the capability session and history permanently", async () => {
    const h = await harness();
    await forward(h);
    expect(h.navigator.dispose()).toBe(true);
    expect(h.navigator.dispose()).toBe(true);
    expect(h.navigator.canBack()).toBe(false);
    expect(await h.navigator.navigate(PLACE, "world")).toMatchObject({ status: "blocked", reason: "DISPOSED" });
    expect(await h.navigator.back()).toMatchObject({ status: "blocked", reason: "DISPOSED" });
    expect(h.load).toHaveBeenCalledOnce();
  });

  it.each(nonloaded)(
    "reports only original $type outcome, preserves history, and does not auto-continue",
    async outcome => {
      const h = await harness();
      await forward(h);
      h.load.mockResolvedValueOnce({ outcome, replacementEpoch: null });
      const calls = h.applyView.mock.calls.length;
      expect(await h.navigator.back()).toEqual({ status: "load-result", outcome });
      expect(h.navigator.canBack()).toBe(true);
      expect(h.applyView).toHaveBeenCalledTimes(calls);
      expect(h.load).toHaveBeenCalledTimes(2);
      expect((await h.navigator.back()).status).toBe("moved");
      expect(h.navigator.canBack()).toBe(false);
    }
  );

  it("preserves primitive history when a failed request never replaces and keeps unknown errors", async () => {
    const h = await harness();
    await forward(h);
    const error = Symbol("opaque failure");
    h.load.mockRejectedValueOnce(error);
    expect(await h.navigator.back()).toEqual({ status: "load-result", outcome: { type: "failed", error } });
    expect(h.navigator.canBack()).toBe(true);
  });

  it("does not claim rollback or stability after a failed adoption leaves mixed data", async () => {
    const h = await harness();
    await forward(h);
    const outcome = { type: "failed", error: new Error("mixed model") } as const;
    h.load.mockImplementationOnce(async (_file, _json, _mapId, guard) => {
      expect(guard()).toBe(true);
      h.state.epoch += 1;
      h.state.stable = false;
      h.state.identity = null;
      return { outcome, replacementEpoch: null };
    });
    expect(await h.navigator.back()).toEqual({ status: "load-result", outcome });
    expect(h.state.stable).toBe(false);
    expect(h.navigator.canBack()).toBe(false);
    expect(h.state.identity).toBeNull();
  });

  it.each([null, 0, NaN, Infinity])(
    "requires a call-bound successful replacement receipt, not token %s",
    async token => {
      const h = await harness();
      h.load.mockImplementationOnce(async (_file, _json, mapId, guard) => ({
        ...h.complete(mapId, guard),
        replacementEpoch: token
      }));
      const result = await h.navigator.navigate(PLACE, "local");
      expect(result).toMatchObject({ status: "stale", outcome: LOADED });
      expect(h.state.identity?.mapId).toBe(LOCAL);
      expect(h.applyView).not.toHaveBeenCalled();
      expect(h.navigator.canBack()).toBe(false);
    }
  );

  it("rejects loaded without a real last-start guard even when its identity and token match", async () => {
    const h = await harness();
    h.load.mockImplementationOnce(async (_file, _json, mapId) => ({
      outcome: LOADED,
      replacementEpoch: h.adopt(mapId)
    }));
    expect(await h.navigator.navigate(PLACE, "local")).toMatchObject({ status: "stale", outcome: LOADED });
    expect(h.applyView).not.toHaveBeenCalled();
  });

  it.each([WORLD, LOCAL])("does not focus or alter B=%s when A's older loaded receipt returns", async mapB => {
    const h = await harness();
    let identityB: AtlasIdentity | null = null;
    let snapshotB: AtlasMapSnapshot | null = null;
    h.load.mockImplementationOnce(async (_file, _json, mapId, guard) => {
      const old = h.complete(mapId, guard);
      h.adopt(mapB);
      identityB = h.state.identity;
      snapshotB = h.state.live;
      return old;
    });
    expect(await h.navigator.navigate(PLACE, "local")).toMatchObject({ status: "stale", outcome: LOADED });
    expect(h.state.identity).toBe(identityB);
    expect(h.state.live).toBe(snapshotB);
    expect(h.state.stable).toBe(true);
    expect(h.applyView).not.toHaveBeenCalled();
    expect(h.navigator.canBack()).toBe(false);
  });

  it.each([
    { projectId: "20000000-0000-4000-8000-000000000001" },
    { mapId: WORLD },
    { sourceAssetSha256: "c".repeat(64) },
    { geographicRevision: 4 },
    { replacementEpoch: 1 }
  ])("checks the complete target identity after loaded: %j", async patch => {
    const h = await harness();
    h.load.mockImplementationOnce(async (_file, _json, mapId, guard) => {
      const result = h.complete(mapId, guard);
      h.state.identity = { ...h.state.identity!, ...patch };
      return result;
    });
    expect(await h.navigator.navigate(PLACE, "local")).toMatchObject({ status: "stale", outcome: LOADED });
    expect(h.applyView).not.toHaveBeenCalled();
    expect(h.navigator.canBack()).toBe(false);
  });

  it("reports loaded but view-failed when the adopted live model disagrees before focus", async () => {
    const h = await harness();
    h.load.mockImplementationOnce(async (_file, _json, mapId, guard) => {
      const result = h.complete(mapId, guard);
      drift(h);
      return result;
    });
    expect(await h.navigator.navigate(PLACE, "local")).toMatchObject({ status: "view-failed", outcome: LOADED });
    expect(h.applyView).not.toHaveBeenCalled();
    expect(h.state.identity?.mapId).toBe(LOCAL);
    expect(h.state.stable).toBe(true);
    expect(h.navigator.canBack()).toBe(false);
  });

  it("preserves loaded truth and unknown apply/render failures without clearing adopted identity", async () => {
    const h = await harness();
    const error = { render: "opaque" };
    h.applyView.mockImplementationOnce(() => {
      throw error;
    });
    expect(await h.navigator.navigate(PLACE, "local")).toMatchObject({ status: "view-failed", outcome: LOADED, error });
    expect(h.state.identity?.mapId).toBe(LOCAL);
    expect(h.state.stable).toBe(true);
    expect(h.navigator.canBack()).toBe(false);
  });

  it("rechecks same-epoch live drift caused by focus before committing history", async () => {
    const h = await harness();
    h.applyView.mockImplementationOnce(() => drift(h));
    expect(await h.navigator.navigate(PLACE, "local")).toMatchObject({ status: "view-failed", outcome: LOADED });
    expect(h.state.epoch).toBe(2);
    expect(h.state.stable).toBe(true);
    expect(h.navigator.canBack()).toBe(false);
  });

  it.each([false, true])("does not pollute synchronous B replacement inside zoom; render throws=%s", async throws => {
    const h = await harness();
    let identityB: AtlasIdentity | null = null;
    let snapshotB: AtlasMapSnapshot | null = null;
    const viewB = { x: 17, y: 28, scale: 4 };
    h.applyView.mockImplementationOnce(() => {
      h.adopt(WORLD);
      h.state.view = viewB;
      identityB = h.state.identity;
      snapshotB = h.state.live;
      if (throws) throw new Error("zoom listener replaced B");
    });
    expect(await h.navigator.navigate(PLACE, "local")).toMatchObject({ status: "view-failed", outcome: LOADED });
    expect(h.state.identity).toBe(identityB);
    expect(h.state.live).toBe(snapshotB);
    expect(h.state.view).toBe(viewB);
    expect(h.state.stable).toBe(true);
    expect(h.applyView).toHaveBeenCalledOnce();
    expect(h.navigator.canBack()).toBe(false);
  });

  it("performs postloaded observe/apply/observe without yielding to any microtask", async () => {
    const h = await harness();
    let microtaskRan = false;
    h.observe.mockImplementation(sha => {
      if (sha === "b".repeat(64)) {
        expect(microtaskRan).toBe(false);
        queueMicrotask(() => {
          microtaskRan = true;
        });
      }
      return h.state.live;
    });
    h.applyView.mockImplementationOnce(() => expect(microtaskRan).toBe(false));
    expect((await h.navigator.navigate(PLACE, "local")).status).toBe("moved");
    expect(microtaskRan).toBe(true);
  });

  it("drops an idle history chain after external replacement, even when it adopts the same map", async () => {
    const h = await harness();
    await forward(h);
    h.adopt(LOCAL);
    expect(h.navigator.canBack()).toBe(false);
    expect(await h.navigator.back()).toMatchObject({ status: "blocked", reason: "NO_HISTORY" });
    expect((await h.navigator.navigate(PLACE, "world")).status).toBe("moved");
    expect((await h.navigator.back()).status).toBe("moved");
    expect(h.navigator.canBack()).toBe(false);
  });

  it("does not prematurely drop the old chain when canBack runs during its own replacement", async () => {
    const h = await harness();
    await forward(h);
    h.load.mockImplementationOnce(async (_file, _json, mapId, guard) => {
      const receipt = h.complete(mapId, guard);
      expect(h.navigator.canBack()).toBe(false);
      expect(h.navigator.dispose()).toBe(false);
      return receipt;
    });
    expect((await h.navigator.navigate(PLACE, "world")).status).toBe("moved");
    expect((await h.navigator.back()).status).toBe("moved");
    expect((await h.navigator.back()).status).toBe("moved");
    expect(h.navigator.canBack()).toBe(false);
  });

  it("canBack only checks lineage; back must independently reject same-epoch edited models", async () => {
    const h = await harness();
    await forward(h);
    drift(h);
    h.observe.mockClear();
    expect(h.navigator.canBack()).toBe(true);
    expect(h.observe).not.toHaveBeenCalled();
    expect(await h.navigator.back()).toMatchObject({ status: "blocked", reason: "SOURCE_INVALID" });
    expect(h.navigator.canBack()).toBe(true);
    expect(h.load).toHaveBeenCalledOnce();
  });

  it("bounds history to the latest 64 primitive departures", async () => {
    const h = await harness();
    for (let step = 0; step < 70; step++) {
      h.state.view = { x: step + 0.125, y: step + 0.75, scale: 1 + step / 100 };
      expect((await h.navigator.navigate(PLACE, step % 2 ? "world" : "local")).status).toBe("moved");
    }
    for (let step = 69; step >= 6; step--) {
      expect((await h.navigator.back()).status).toBe("moved");
      expect(h.applyView).toHaveBeenLastCalledWith({ x: step + 0.125, y: step + 0.75, scale: 1 + step / 100 });
    }
    expect(h.navigator.canBack()).toBe(false);
    expect(await h.navigator.back()).toMatchObject({ status: "blocked", reason: "NO_HISTORY" });
  });

  it("never mutates inputs or retains pack/grid payloads through captured views or identity", async () => {
    const h = await harness();
    const before = JSON.stringify(h.project.manifest);
    const view = { x: 123, y: 234, scale: 1.75 };
    for (const key of ["pack", "grid"]) {
      Object.defineProperty(view, key, {
        get: () => {
          throw new Error(`must not read ${key}`);
        }
      });
      Object.defineProperty(h.state.identity!, key, {
        get: () => {
          throw new Error(`must not read ${key}`);
        }
      });
    }
    h.state.view = view;
    await forward(h);
    view.x = 999;
    expect((await h.navigator.back()).status).toBe("moved");
    expect(h.applyView).toHaveBeenLastCalledWith({ x: 123, y: 234, scale: 1.75 });
    expect(Object.keys(h.applyView.mock.calls[1][0]).sort()).toEqual(["scale", "x", "y"]);
    expect(JSON.stringify(h.project.manifest)).toBe(before);
    expect(Object.isFrozen(h.project)).toBe(true);
    expect(Object.isFrozen(h.project.manifest.maps[0])).toBe(true);
    expect(Object.keys(h.navigator).sort()).toEqual(["back", "canBack", "dispose", "navigate"]);
  });

  it.each(["identity", "unstable", "capture-live"] as const)(
    "blocks final same-epoch source changes: %s",
    async mode => {
      const h = await harness();
      h.load.mockImplementationOnce(async (_file, _json, mapId, guard) => {
        if (mode === "identity") h.state.identity = { ...h.state.identity!, geographicRevision: 4 };
        if (mode === "unstable") h.state.stable = false;
        if (mode === "capture-live")
          h.captureView.mockImplementationOnce(() => {
            drift(h);
            return h.state.view;
          });
        return h.complete(mapId, guard);
      });
      expect(await h.navigator.navigate(PLACE, "local")).toEqual({
        status: "load-result",
        outcome: { type: "cancelled" }
      });
      expect(h.state.epoch).toBe(1);
      expect(h.applyView).not.toHaveBeenCalled();
    }
  );

  it("back repeats the final live gate and preserves its chain on refusal before adoption", async () => {
    const h = await harness();
    await forward(h);
    const original = h.state.live;
    h.load.mockImplementationOnce(async (_file, _json, mapId, guard) => {
      drift(h);
      return h.complete(mapId, guard);
    });
    expect(await h.navigator.back()).toEqual({ status: "load-result", outcome: { type: "cancelled" } });
    expect(h.navigator.canBack()).toBe(true);
    h.state.live = original;
    expect((await h.navigator.back()).status).toBe("moved");
    expect(h.navigator.canBack()).toBe(false);
  });

  it.each([
    { x: NaN, y: 2, scale: 1 },
    { x: 1, y: Infinity, scale: 1 },
    { x: 1, y: 2, scale: 0 }
  ])("refuses invalid captured centers or scale %j without replacing", async view => {
    const h = await harness();
    h.state.view = view;
    expect(await h.navigator.navigate(PLACE, "local")).toEqual({
      status: "load-result",
      outcome: { type: "cancelled" }
    });
    expect(h.state.epoch).toBe(1);
    expect(h.applyView).not.toHaveBeenCalled();
  });

  it("blocks a synchronous source replacement during observation before calling load", async () => {
    const h = await harness();
    const old = h.state.live;
    h.observe.mockImplementationOnce(() => {
      h.adopt(WORLD);
      return old;
    });
    expect(await h.navigator.navigate(PLACE, "local")).toMatchObject({ status: "blocked", reason: "SOURCE_INVALID" });
    expect(h.load).not.toHaveBeenCalled();
    expect(h.state.epoch).toBe(2);
  });

  it("does not focus B when target observation synchronously replaces A while returning A's valid snapshot", async () => {
    const h = await harness();
    let identityB: AtlasIdentity | null = null;
    h.observe.mockImplementation(sha => {
      const old = h.state.live;
      if (sha === "b".repeat(64)) {
        h.adopt(WORLD);
        identityB = h.state.identity;
      }
      return old;
    });
    expect(await h.navigator.navigate(PLACE, "local")).toMatchObject({ status: "view-failed", outcome: LOADED });
    expect(h.state.identity).toBe(identityB);
    expect(h.state.stable).toBe(true);
    expect(h.applyView).not.toHaveBeenCalled();
  });

  it("does not call focus on loaded but unstable targets", async () => {
    const h = await harness();
    h.load.mockImplementationOnce(async (_file, _json, mapId, guard) => {
      const receipt = h.complete(mapId, guard);
      h.state.stable = false;
      return receipt;
    });
    expect(await h.navigator.navigate(PLACE, "local")).toMatchObject({ status: "stale", outcome: LOADED });
    expect(h.state.stable).toBe(false);
    expect(h.applyView).not.toHaveBeenCalled();
  });

  it("rechecks target identity after same-epoch focus callbacks", async () => {
    const h = await harness();
    h.applyView.mockImplementationOnce(() => {
      h.state.identity = { ...h.state.identity!, sourceAssetSha256: "c".repeat(64) };
    });
    expect(await h.navigator.navigate(PLACE, "local")).toMatchObject({ status: "view-failed", outcome: LOADED });
    expect(h.state.identity?.sourceAssetSha256).toBe("c".repeat(64));
    expect(h.state.stable).toBe(true);
    expect(h.navigator.canBack()).toBe(false);
  });

  it("revokes settled guards so late callbacks cannot observe or capture for a later request", async () => {
    const h = await harness();
    h.load.mockResolvedValueOnce({ outcome: { type: "cancelled" }, replacementEpoch: null });
    expect((await h.navigator.navigate(PLACE, "local")).status).toBe("load-result");
    const oldGuard = h.load.mock.calls[0][3];
    h.observe.mockClear();
    expect(oldGuard()).toBe(false);
    expect(h.observe).not.toHaveBeenCalled();
    expect(h.captureView).not.toHaveBeenCalled();
    await forward(h);
    expect(h.navigator.dispose()).toBe(true);
    h.observe.mockClear();
    expect(oldGuard()).toBe(false);
    expect(h.observe).not.toHaveBeenCalled();
  });

  it("returns planner none reasons without reading target files or changing history", async () => {
    const h = await harness();
    expect(await h.navigator.navigate(PLACE, "world")).toMatchObject({ status: "blocked", reason: "SAME_MAP" });
    expect(await h.navigator.navigate("missing", "local")).toMatchObject({
      status: "blocked",
      reason: "PLACE_NOT_FOUND"
    });
    expect(h.load).not.toHaveBeenCalled();
    expect(h.navigator.canBack()).toBe(false);
  });
});
