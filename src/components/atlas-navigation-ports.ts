import { viewport } from "@/components/viewport";
import { stopMapZoom, zoomTo } from "@/components/zoom";
import { Services } from "@/services";
import { getCurrentAtlasIdentity } from "@/services/atlas/identity";
import type { AtlasNavigationPorts, AtlasView } from "@/services/atlas/navigation-session";
import { observeAtlasModel } from "@/services/atlas/observation";
import { getMapModelEpoch, isMapModelStable } from "@/services/io/model-status";

function assertView(view: AtlasView): void {
  if (![view.x, view.y, view.scale].every(Number.isFinite) || view.scale <= 0) throw new Error("导航视野无效");
}

/** Actual model/zoom/IO adapters; no coordinate or identity is inferred from a cell index. */
export function createAtlasNavigationPorts(): AtlasNavigationPorts {
  return {
    identity: getCurrentAtlasIdentity,
    epoch: getMapModelEpoch,
    stable: isMapModelStable,
    observe: sha256 =>
      observeAtlasModel(
        {
          graph: options.map.graph,
          coordinates: options.map.geography.coordinates,
          burgs: pack.burgs,
          markers: pack.markers,
          addedLabels: pack.addedLabels
        },
        sha256
      ),
    captureView: () => {
      stopMapZoom();
      if (![viewport.width, viewport.height].every(Number.isFinite) || viewport.width <= 0 || viewport.height <= 0) {
        throw new Error("当前视窗尚未就绪");
      }
      const view = {
        x: (viewport.width / 2 - viewport.x) / viewport.scale,
        y: (viewport.height / 2 - viewport.y) / viewport.scale,
        scale: viewport.scale
      };
      assertView(view);
      return Object.freeze(view);
    },
    applyView: view => {
      assertView(view);
      zoomTo(view.x, view.y, view.scale, 0);
    },
    load: (file, manifestJSON, mapId, canAdopt) =>
      Services.Load.uploadAtlasMapWithReceipt(file, manifestJSON, mapId, { canAdopt })
  };
}
