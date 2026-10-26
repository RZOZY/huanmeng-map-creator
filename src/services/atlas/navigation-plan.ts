import {
  CoordinateDomainError,
  type CoordinateErrorCode,
  type GeographicPoint,
  geographicToPixel,
  type PixelPoint
} from "./coordinates";
import { type AtlasManifest, selectLocalMap } from "./manifest";

export type AtlasNavigationDirection = "local" | "world";

export interface AtlasNavigationPlan {
  readonly status: "ready";
  readonly targetMapId: string;
  readonly placeId: string;
  readonly coordinate: GeographicPoint;
  readonly position: PixelPoint;
}

export type AtlasNavigationNoneReason =
  | "CURRENT_MAP_NOT_FOUND"
  | "PLACE_NOT_FOUND"
  | "WORLD_MAP_NOT_FOUND"
  | "UNVERIFIED_CURRENT_MAP"
  | "UNVERIFIED_WORLD_MAP"
  | "NO_LOCAL_MAP"
  | "SAME_MAP"
  | CoordinateErrorCode;

export interface AtlasNavigationNone {
  readonly status: "none";
  readonly reason: AtlasNavigationNoneReason;
}

export type AtlasNavigationResult = AtlasNavigationPlan | AtlasNavigationNone;

/** Parsed-manifest intent only, not file availability, a load operation or independent live-model verification. */
export function planAtlasNavigation(
  manifest: AtlasManifest,
  currentMapId: string,
  placeId: string,
  direction: AtlasNavigationDirection
): AtlasNavigationResult {
  const currentId = currentMapId.toLowerCase();
  const selectedPlaceId = placeId.toLowerCase();
  const current = manifest.maps.find(map => map.id === currentId);
  if (!current) return { status: "none", reason: "CURRENT_MAP_NOT_FOUND" };
  const place = manifest.places.find(place => place.id === selectedPlaceId);
  if (!place) return { status: "none", reason: "PLACE_NOT_FOUND" };
  const world = manifest.maps.find(map => map.id === manifest.worldMapId);
  if (world?.kind !== "world") return { status: "none", reason: "WORLD_MAP_NOT_FOUND" };
  if (!current.georeference.verified) return { status: "none", reason: "UNVERIFIED_CURRENT_MAP" };
  if (!world.georeference.verified) return { status: "none", reason: "UNVERIFIED_WORLD_MAP" };

  try {
    const target = direction === "local" ? selectLocalMap(manifest, place.coordinate) : world;
    if (!target) return { status: "none", reason: "NO_LOCAL_MAP" };
    if (target.id === current.id) return { status: "none", reason: "SAME_MAP" };
    return {
      status: "ready",
      targetMapId: target.id,
      placeId: place.id,
      coordinate: { ...place.coordinate },
      position: geographicToPixel(place.coordinate, target.frame, target.size)
    };
  } catch (error) {
    if (!(error instanceof CoordinateDomainError)) throw error;
    return { status: "none", reason: error.code };
  }
}
