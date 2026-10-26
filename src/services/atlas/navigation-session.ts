import type { MapLoadOutcome } from "@/services/io/load-operation";
import type { AtlasIdentity } from "./identity";
import type { AtlasMap } from "./manifest";
import { type AtlasNavigationDirection, type AtlasNavigationNoneReason, planAtlasNavigation } from "./navigation-plan";
import { type AtlasMapSnapshot, assertAtlasSnapshot } from "./observation";
import type { AtlasProjectFiles } from "./project-files";

/** Model-space viewport center, not screen-space translation. */
export interface AtlasView {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

export interface AtlasNavigationLoadReceipt {
  readonly outcome: MapLoadOutcome;
  readonly replacementEpoch: number | null;
}

export interface AtlasNavigationPorts {
  identity(): AtlasIdentity | null;
  epoch(): number;
  stable(): boolean;
  observe(sha: string): AtlasMapSnapshot;
  /** Stop active animations before reading the current model-space center. */
  captureView(): AtlasView;
  /** Apply synchronously with zero duration; never schedule a later focus. */
  applyView(view: AtlasView): void;
  /** Invoke canAdopt synchronously at the actual last replacement start. */
  load(file: File, json: string, mapId: string, canAdopt: () => boolean): Promise<AtlasNavigationLoadReceipt>;
}

export type AtlasNavigationBlockedReason =
  | AtlasNavigationNoneReason
  | "BUSY"
  | "DISPOSED"
  | "NO_HISTORY"
  | "MISSING_FILE"
  | "SOURCE_INVALID";

type LoadedOutcome = Extract<MapLoadOutcome, { type: "loaded" }>;
export type AtlasNavigationSessionResult =
  | { readonly status: "moved"; readonly outcome: LoadedOutcome; readonly mapId: string; readonly view: AtlasView }
  | { readonly status: "blocked"; readonly reason: AtlasNavigationBlockedReason; readonly error?: unknown }
  | {
      readonly status: "stale";
      readonly reason: "MISSING_RECEIPT" | "UNAUTHORIZED_LOAD" | "TARGET_CHANGED";
      readonly outcome: LoadedOutcome;
      readonly error?: unknown;
    }
  | {
      readonly status: "view-failed";
      readonly reason: "TARGET_LIVE_INVALID" | "APPLY_VIEW_FAILED" | "TARGET_CHANGED";
      readonly outcome: LoadedOutcome;
      readonly error: unknown;
    }
  | { readonly status: "load-result"; readonly outcome: Exclude<MapLoadOutcome, LoadedOutcome> };

export interface AtlasNavigator {
  navigate(placeId: string, direction: AtlasNavigationDirection): Promise<AtlasNavigationSessionResult>;
  back(): Promise<AtlasNavigationSessionResult>;
  canBack(): boolean;
  /** Busy sessions retain ownership until their actual load settles. */
  dispose(): boolean;
}

interface HistoryEntry {
  readonly mapId: string;
  readonly sha256: string;
  readonly geographicRevision: number;
  readonly view: AtlasView;
}

type Request = { readonly placeId: string; readonly direction: AtlasNavigationDirection } | { readonly back: true };

class SourceGateError extends Error {
  constructor(readonly reason: "MISSING_FILE" | "SOURCE_INVALID") {
    super(reason);
  }
}

function copyView(view: AtlasView): AtlasView {
  const { x, y, scale } = view;
  if (![x, y, scale].every(Number.isFinite) || scale <= 0) throw new Error("图集视野中心或缩放无效");
  return { x, y, scale };
}

function validEpoch(epoch: number | null): epoch is number {
  return epoch !== null && Number.isSafeInteger(epoch) && epoch >= 0;
}

function selectedFile(project: AtlasProjectFiles, map: AtlasMap): File | null {
  return project.assets.find(asset => asset.map === map)?.file ?? null;
}

/** Owns only selected file capabilities and a bounded primitive navigation chain, never a model snapshot. */
export function createAtlasNavigator(project: AtlasProjectFiles, ports: AtlasNavigationPorts): AtlasNavigator {
  let selectedProject: AtlasProjectFiles | null = project;
  let busy = false;
  let historyEpoch: number | null = null;
  const history: HistoryEntry[] = [];

  function reconcileHistory(): void {
    if (historyEpoch === null || historyEpoch === ports.epoch()) return;
    history.length = 0;
    historyEpoch = null;
  }

  function matchesIdentity(selected: AtlasProjectFiles, map: AtlasMap, epoch: number): boolean {
    const identity = ports.identity();
    return (
      validEpoch(epoch) &&
      ports.stable() &&
      ports.epoch() === epoch &&
      map.georeference.verified &&
      identity?.replacementEpoch === epoch &&
      identity.projectId === selected.manifest.project.id &&
      identity.mapId === map.id &&
      identity.mapKind === map.kind &&
      identity.sourceAssetSha256 === map.asset.sha256 &&
      identity.geographicRevision === map.geographicRevision
    );
  }

  function assertCurrent(selected: AtlasProjectFiles, map: AtlasMap, epoch: number): void {
    if (!selectedFile(selected, map)) throw new SourceGateError("MISSING_FILE");
    if (!matchesIdentity(selected, map, epoch)) throw new SourceGateError("SOURCE_INVALID");
    assertAtlasSnapshot(selected.manifest, map.id, ports.observe(map.asset.sha256), "model");
    if (!matchesIdentity(selected, map, epoch)) throw new SourceGateError("SOURCE_INVALID");
  }

  async function run(request: Request): Promise<AtlasNavigationSessionResult> {
    if (busy) return { status: "blocked", reason: "BUSY" };
    if (!selectedProject) return { status: "blocked", reason: "DISPOSED" };
    reconcileHistory();
    const previous = "back" in request ? history.at(-1) : undefined;
    if ("back" in request && !previous) return { status: "blocked", reason: "NO_HISTORY" };
    const selected = selectedProject;
    busy = true;
    let accepting = true;
    try {
      let source: AtlasMap;
      let sourceEpoch: number;
      try {
        const identity = ports.identity();
        const map = selected.manifest.maps.find(map => map.id === identity?.mapId);
        if (!map) throw new SourceGateError("SOURCE_INVALID");
        source = map;
        sourceEpoch = ports.epoch();
        assertCurrent(selected, source, sourceEpoch);
      } catch (error) {
        return {
          status: "blocked",
          reason: error instanceof SourceGateError ? error.reason : "SOURCE_INVALID",
          error
        };
      }

      let target: AtlasMap | undefined;
      let view: AtlasView;
      if (previous) {
        target = selected.manifest.maps.find(
          map =>
            map.id === previous.mapId &&
            map.asset.sha256 === previous.sha256 &&
            map.geographicRevision === previous.geographicRevision
        );
        view = copyView(previous.view);
      } else if ("placeId" in request) {
        const plan = planAtlasNavigation(selected.manifest, source.id, request.placeId, request.direction);
        if (plan.status === "none") return { status: "blocked", reason: plan.reason };
        target = selected.manifest.maps.find(map => map.id === plan.targetMapId);
        view = { x: plan.position.x, y: plan.position.y, scale: request.direction === "local" ? 2 : 1 };
      } else {
        return { status: "blocked", reason: "NO_HISTORY" };
      }
      const file = target && selectedFile(selected, target);
      if (!target || !file) return { status: "blocked", reason: "MISSING_FILE" };

      const targetMap = target;
      const preparation: { departure: HistoryEntry | null } = { departure: null };
      const canAdopt = (): boolean => {
        const current = selectedProject;
        if (!accepting || preparation.departure || !current) return false;
        try {
          if (!selectedFile(current, targetMap)) return false;
          assertCurrent(current, source, sourceEpoch);
          const departureView = copyView(ports.captureView());
          assertCurrent(current, source, sourceEpoch);
          preparation.departure = {
            mapId: source.id,
            sha256: source.asset.sha256,
            geographicRevision: source.geographicRevision,
            view: departureView
          };
          return true;
        } catch {
          return false;
        }
      };

      let receipt: AtlasNavigationLoadReceipt;
      try {
        receipt = await ports.load(file, selected.manifestJSON, target.id, canAdopt);
      } catch (error) {
        return { status: "load-result", outcome: { type: "failed", error } };
      } finally {
        accepting = false;
      }
      const { outcome, replacementEpoch } = receipt;
      if (outcome.type !== "loaded") return { status: "load-result", outcome };
      if (!preparation.departure) return { status: "stale", reason: "UNAUTHORIZED_LOAD", outcome };
      if (!validEpoch(replacementEpoch) || replacementEpoch <= sourceEpoch) {
        return { status: "stale", reason: "MISSING_RECEIPT", outcome };
      }
      if (!matchesIdentity(selected, target, replacementEpoch)) {
        return { status: "stale", reason: "TARGET_CHANGED", outcome };
      }

      // No await between target verification, focus, re-verification and history commit.
      let reason: "TARGET_LIVE_INVALID" | "APPLY_VIEW_FAILED" | "TARGET_CHANGED" = "TARGET_LIVE_INVALID";
      try {
        assertCurrent(selected, target, replacementEpoch);
        reason = "APPLY_VIEW_FAILED";
        ports.applyView(copyView(view));
        reason = "TARGET_CHANGED";
        assertCurrent(selected, target, replacementEpoch);
      } catch (error) {
        return { status: "view-failed", reason, outcome, error };
      }
      if (previous) history.pop();
      else {
        history.push(preparation.departure);
        if (history.length > 64) history.shift();
      }
      historyEpoch = replacementEpoch;
      return { status: "moved", outcome, mapId: target.id, view: copyView(view) };
    } finally {
      accepting = false;
      busy = false;
    }
  }

  return {
    navigate: (placeId, direction) => run({ placeId, direction }),
    back: () => run({ back: true }),
    canBack() {
      if (busy || !selectedProject) return false;
      reconcileHistory();
      return history.length > 0;
    },
    dispose() {
      if (busy) return false;
      selectedProject = null;
      history.length = 0;
      historyEpoch = null;
      return true;
    }
  };
}
