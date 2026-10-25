/**
 * Inclusive equirectangular bounds in degrees; east is unwrapped (170..190, never 170..-170).
 * Longitude span is the IEEE-754 result of east - west, required to be in (0,360].
 */
export interface GeographicFrame {
  readonly west: number;
  readonly east: number;
  readonly south: number;
  readonly north: number;
}

/** Finite degrees; longitude may include whole turns, latitude must be in [-90,90]. */
export interface GeographicPoint {
  readonly longitude: number;
  readonly latitude: number;
}

/** Continuous canvas coordinates, not cell indices; origin is the northwest corner. */
export interface PixelPoint {
  readonly x: number;
  readonly y: number;
}

/** Finite, strictly positive extents; fractional dimensions are allowed. */
export interface CanvasSize {
  readonly width: number;
  readonly height: number;
}

export type CoordinateErrorCode =
  | "INVALID_FRAME"
  | "INVALID_COORDINATE"
  | "INVALID_CANVAS_SIZE"
  | "INVALID_PIXEL"
  | "OUTSIDE_FRAME"
  | "OUTSIDE_CANVAS";

export class CoordinateDomainError extends RangeError {
  constructor(
    readonly code: CoordinateErrorCode,
    message: string
  ) {
    super(message);
    this.name = "CoordinateDomainError";
  }
}

/** Rejects nonfinite bounds, west outside [-180,180), spans outside (0,360], or invalid latitudes. */
export function validateGeographicFrame(frame: GeographicFrame): void {
  const longitudeSpan = frame ? frame.east - frame.west : NaN;
  if (
    !frame ||
    !Number.isFinite(frame.west) ||
    !Number.isFinite(frame.east) ||
    !Number.isFinite(frame.south) ||
    !Number.isFinite(frame.north) ||
    frame.west < -180 ||
    frame.west >= 180 ||
    !Number.isFinite(longitudeSpan) ||
    longitudeSpan <= 0 ||
    longitudeSpan > 360 ||
    frame.south < -90 ||
    frame.north > 90 ||
    frame.north <= frame.south
  ) {
    throw new CoordinateDomainError(
      "INVALID_FRAME",
      "Frame requires west in [-180,180), an unwrapped east with span (0,360], and -90 <= south < north <= 90"
    );
  }
}

/** Normalizes a finite longitude to [-180,180); already normalized values keep their precision. */
export function normalizeLongitude(longitude: number): number {
  if (!Number.isFinite(longitude)) {
    throw new CoordinateDomainError("INVALID_COORDINATE", "Longitude must be finite");
  }
  const remainder = longitude % 360;
  if (remainder < -180) return remainder + 360;
  if (remainder >= 180) return remainder - 360;
  return remainder === 0 ? 0 : remainder;
}

/** False means a valid geographic point lies outside a valid frame; malformed inputs throw. */
export function containsCoordinate(point: GeographicPoint, frame: GeographicFrame): boolean {
  validateGeographicFrame(frame);
  validateCoordinate(point);
  return (
    point.latitude >= frame.south && point.latitude <= frame.north && longitudeInFrame(point.longitude, frame) !== null
  );
}

/**
 * No decimal rounding, clipping, or snapping; in-frame longitudes retain their side of a full-world seam.
 * Equivalent aliases outside the frame use the western seam copy when the span is 360 degrees.
 */
export function geographicToPixel(point: GeographicPoint, frame: GeographicFrame, size: CanvasSize): PixelPoint {
  validateGeographicFrame(frame);
  validateCanvasSize(size);
  validateCoordinate(point);
  const longitude = longitudeInFrame(point.longitude, frame);
  if (longitude === null || point.latitude < frame.south || point.latitude > frame.north) {
    throw new CoordinateDomainError("OUTSIDE_FRAME", "Coordinate is outside the geographic frame");
  }
  return {
    x: ((longitude - frame.west) / (frame.east - frame.west)) * size.width,
    y: ((frame.north - point.latitude) / (frame.north - frame.south)) * size.height
  };
}

/** Returns frame-local unwrapped longitude, including both endpoints; only IEEE-754 arithmetic is used. */
export function pixelToGeographic(point: PixelPoint, frame: GeographicFrame, size: CanvasSize): GeographicPoint {
  validateGeographicFrame(frame);
  validateCanvasSize(size);
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new CoordinateDomainError("INVALID_PIXEL", "Pixel coordinates must be finite");
  }
  if (point.x < 0 || point.x > size.width || point.y < 0 || point.y > size.height) {
    throw new CoordinateDomainError("OUTSIDE_CANVAS", "Pixel is outside the inclusive canvas bounds");
  }
  return {
    longitude: interpolate(frame.west, frame.east, point.x / size.width),
    latitude: interpolate(frame.north, frame.south, point.y / size.height)
  };
}

function validateCoordinate(point: GeographicPoint): void {
  if (
    !point ||
    !Number.isFinite(point.longitude) ||
    !Number.isFinite(point.latitude) ||
    point.latitude < -90 ||
    point.latitude > 90
  ) {
    throw new CoordinateDomainError(
      "INVALID_COORDINATE",
      "Coordinate requires finite longitude and latitude in [-90,90]"
    );
  }
}

function validateCanvasSize(size: CanvasSize): void {
  if (!size || !Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width <= 0 || size.height <= 0) {
    throw new CoordinateDomainError("INVALID_CANVAS_SIZE", "Canvas width and height must be finite and positive");
  }
}

function longitudeInFrame(longitude: number, frame: GeographicFrame): number | null {
  if (longitude >= frame.west && longitude <= frame.east) return longitude;
  const normalized = normalizeLongitude(longitude);
  if (normalized >= frame.west) return normalized <= frame.east ? normalized : null;
  // Compare before adding 360: otherwise a just-outside value can round onto the eastern boundary.
  if (frame.east < 180 || normalized > frame.east - 360) return null;
  return normalized + 360;
}

function interpolate(start: number, end: number, fraction: number): number {
  if (fraction === 0) return start;
  if (fraction === 1) return end;
  // Anchor at the nearer endpoint to avoid cancellation at narrow local-map boundaries.
  return fraction <= 0.5 ? start + (end - start) * fraction : end - (end - start) * (1 - fraction);
}
