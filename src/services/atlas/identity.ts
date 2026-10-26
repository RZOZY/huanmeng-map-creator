import { getMapModelEpoch, isMapModelStable } from "@/services/io/model-status";
import type { AtlasManifest, AtlasMap } from "./manifest";

export interface AtlasIdentity {
  readonly projectId: string;
  readonly projectName: string;
  readonly mapId: string;
  readonly mapName: string;
  readonly mapKind: AtlasMap["kind"];
  readonly geographicRevision: number;
  readonly sourceAssetSha256: string;
  readonly replacementEpoch: number;
}

let current: AtlasIdentity | null = null;

/** Adoption lineage only, not a live-model checksum, dirty flag or navigation authorization. */
export function getCurrentAtlasIdentity(): AtlasIdentity | null {
  if (!isMapModelStable() || current?.replacementEpoch !== getMapModelEpoch()) current = null;
  return current;
}

/** Called by verified IO only after complete adoption, before feedback or user callbacks. */
export function recordVerifiedAtlasIdentity(
  manifest: AtlasManifest,
  mapId: string,
  sourceAssetSha256: string,
  replacementEpoch: number
): boolean {
  if (!isMapModelStable() || replacementEpoch !== getMapModelEpoch()) return false;
  const map = manifest.maps.find(map => map.id === mapId.toLowerCase());
  if (!map?.georeference.verified || map.asset.sha256 !== sourceAssetSha256.toLowerCase()) return false;
  current = Object.freeze({
    projectId: manifest.project.id,
    projectName: manifest.project.name,
    mapId: map.id,
    mapName: map.name,
    mapKind: map.kind,
    geographicRevision: map.geographicRevision,
    sourceAssetSha256: map.asset.sha256,
    replacementEpoch
  });
  return true;
}
