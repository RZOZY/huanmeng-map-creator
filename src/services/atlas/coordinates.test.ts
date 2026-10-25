import { describe, expect, it } from "vitest";
import {
  type CanvasSize,
  CoordinateDomainError,
  type CoordinateErrorCode,
  containsCoordinate,
  type GeographicFrame,
  type GeographicPoint,
  geographicToPixel,
  normalizeLongitude,
  type PixelPoint,
  pixelToGeographic,
  validateGeographicFrame
} from "./coordinates";

const WORLD: GeographicFrame = { west: -180, east: 180, south: -90, north: 90 };
const LOCAL: GeographicFrame = { west: -75.125, east: -73.125, south: 10.125, north: 14.125 };
const DATELINE: GeographicFrame = { west: 170, east: 190, south: -10, north: 10 };
const SIZE: CanvasSize = { width: 1024, height: 512 };

function expectDomainError(action: () => unknown, code: CoordinateErrorCode): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(RangeError);
    expect(error).toBeInstanceOf(CoordinateDomainError);
    expect(error).toMatchObject({ name: "CoordinateDomainError", code });
    return;
  }
  expect.unreachable(`Expected CoordinateDomainError with code ${code}`);
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
}

describe("equirectangular coordinates", () => {
  it("converts an exact, non-two-decimal world point in both directions", () => {
    const geographic = { longitude: -135.703125, latitude: -27.7734375 };
    const pixel = { x: 126, y: 335 };
    expect(geographicToPixel(geographic, WORLD, SIZE)).toEqual(pixel);
    expect(pixelToGeographic(pixel, WORLD, SIZE)).toEqual(geographic);
  });

  it("retains full precision on a narrow, negative-longitude local map", () => {
    const size = { width: 1024, height: 2048 };
    const geographic = { longitude: -74.123046875, latitude: 11.12890625 };
    const pixel = { x: 513, y: 1534 };
    expect(geographicToPixel(geographic, LOCAL, size)).toEqual(pixel);
    expect(pixelToGeographic(pixel, LOCAL, size)).toEqual(geographic);
  });

  it("does not round non-dyadic decimal origins or change geography when resizing", () => {
    const frame = { west: -73.123456789, east: -72.123456789, south: 40.987654321, north: 41.987654321 };
    const geographic = { longitude: -72.998456789, latitude: 41.237654321 };
    const size = { width: 1000, height: 800 };
    const resized = { width: 3250, height: 1600 };
    const pixel = { x: 125, y: 600 };
    const scaledPixel = { x: 406.25, y: 1200 };
    expect(geographicToPixel(geographic, frame, size)).toEqual(pixel);
    expect(geographicToPixel(geographic, frame, resized)).toEqual(scaledPixel);
    expect(pixelToGeographic(pixel, frame, size)).toEqual(geographic);
    expect(pixelToGeographic(scaledPixel, frame, resized)).toEqual(geographic);
  });

  it("unwraps a normalized dateline longitude without expanding a local map to near-global coverage", () => {
    const size = { width: 1000, height: 500 };
    expect(containsCoordinate({ longitude: -175, latitude: 0 }, DATELINE)).toBe(true);
    expect(geographicToPixel({ longitude: -175, latitude: 0 }, DATELINE, size)).toEqual({ x: 750, y: 250 });
    expect(pixelToGeographic({ x: 750, y: 250 }, DATELINE, size)).toEqual({ longitude: 185, latitude: 0 });
    expect(containsCoordinate({ longitude: 0, latitude: 0 }, DATELINE)).toBe(false);
    expect(containsCoordinate({ longitude: 169.5, latitude: 0 }, DATELINE)).toBe(false);
    expect(containsCoordinate({ longitude: -169.5, latitude: 0 }, DATELINE)).toBe(false);
  });

  it.each([
    [170, 0],
    [-190, 0],
    [180, 512],
    [-180, 512],
    [190, 1024],
    [-170, 1024]
  ])("places dateline longitude %s at x=%s", (longitude, x) => {
    expect(geographicToPixel({ longitude, latitude: 0 }, DATELINE, SIZE)).toEqual({ x, y: 256 });
  });

  it.each([
    [-180, 90, 0, 0],
    [180, 90, 1024, 0],
    [-180, -90, 0, 512],
    [180, -90, 1024, 512],
    [0, 0, 512, 256]
  ])(
    "preserves world longitude %s and latitude %s, including both seam edges and poles",
    (longitude, latitude, x, y) => {
      expect(containsCoordinate({ longitude, latitude }, WORLD)).toBe(true);
      expect(geographicToPixel({ longitude, latitude }, WORLD, SIZE)).toEqual({ x, y });
      expect(pixelToGeographic({ x, y }, WORLD, SIZE)).toEqual({ longitude, latitude });
    }
  );

  it("accepts ordinary decimal frames without hiding their IEEE-754 interior roundoff", () => {
    const frame = { west: 0.1, east: 0.3, south: 0.1, north: 0.3 };
    const size = { width: 1000, height: 1000 };
    const geographic = { longitude: 0.2, latitude: 0.2 };
    expect(() => validateGeographicFrame(frame)).not.toThrow();
    expect(containsCoordinate(geographic, frame)).toBe(true);
    expect(pixelToGeographic({ x: 500, y: 500 }, frame, size)).toEqual(geographic);
    expect(geographicToPixel(geographic, frame, size)).toEqual({ x: 500.0000000000001, y: 499.99999999999994 });
  });

  it("preserves fractional local boundaries exactly, including a cancellation-sensitive south edge", () => {
    const frame = { west: 0.1, east: 0.3, south: 0.1, north: 0.3 };
    expect(pixelToGeographic({ x: 0, y: 0 }, frame, SIZE)).toEqual({ longitude: 0.1, latitude: 0.3 });
    expect(pixelToGeographic({ x: 1024, y: 512 }, frame, SIZE)).toEqual({ longitude: 0.3, latitude: 0.1 });
    expect(geographicToPixel({ longitude: 0.1, latitude: 0.3 }, frame, SIZE)).toEqual({ x: 0, y: 0 });
    expect(geographicToPixel({ longitude: 0.3, latitude: 0.1 }, frame, SIZE)).toEqual({ x: 1024, y: 512 });
  });

  it("uses the western seam copy only for aliases not already inside a full-world frame", () => {
    const frame = { west: 12.25, east: 372.25, south: -90, north: 90 };
    for (const longitude of [12.25, 372.25]) {
      const x = longitude === frame.west ? 0 : SIZE.width;
      expect(geographicToPixel({ longitude, latitude: 0 }, frame, SIZE)).toEqual({ x, y: 256 });
      expect(pixelToGeographic({ x, y: 256 }, frame, SIZE).longitude).toBe(longitude);
    }
    for (const longitude of [-707.75, -347.75, 732.25, 1092.25]) {
      expect(geographicToPixel({ longitude, latitude: 0 }, frame, SIZE)).toEqual({ x: 0, y: 256 });
    }
    for (const longitude of [-900, -540, 540, 900]) {
      expect(geographicToPixel({ longitude, latitude: 0 }, WORLD, SIZE)).toEqual({ x: 0, y: 256 });
    }
  });

  it("supports repeated world longitudes while preserving negative non-seam coordinates", () => {
    for (const turns of [-1000, -2, -1, 0, 1, 2, 1000]) {
      const longitude = -135.703125 + 360 * turns;
      expect(containsCoordinate({ longitude, latitude: -27.7734375 }, WORLD)).toBe(true);
      expect(geographicToPixel({ longitude, latitude: -27.7734375 }, WORLD, SIZE)).toEqual({ x: 126, y: 335 });
    }
  });

  it("uses continuous pixels and supports finite positive fractional and extreme dimensions", () => {
    for (const size of [
      { width: 0.125, height: 0.5 },
      { width: Number.MIN_VALUE, height: Number.MIN_VALUE },
      { width: Number.MAX_VALUE, height: Number.MAX_VALUE }
    ]) {
      expect(geographicToPixel({ longitude: -180, latitude: 90 }, WORLD, size)).toEqual({ x: 0, y: 0 });
      expect(geographicToPixel({ longitude: 180, latitude: -90 }, WORLD, size)).toEqual({
        x: size.width,
        y: size.height
      });
      expect(pixelToGeographic({ x: size.width, y: size.height }, WORLD, size)).toEqual({
        longitude: 180,
        latitude: -90
      });
    }
    expect(geographicToPixel({ longitude: 90, latitude: 45 }, WORLD, { width: Number.MAX_VALUE, height: 0.5 })).toEqual(
      {
        x: Number.MAX_VALUE * 0.75,
        y: 0.125
      }
    );
  });

  it("does not mutate frame, size, or either input point", () => {
    const frame = Object.freeze({ ...DATELINE });
    const size = Object.freeze({ ...SIZE });
    const geographic = Object.freeze({ longitude: -175, latitude: 5 });
    const pixel = Object.freeze({ x: 768, y: 128 });
    validateGeographicFrame(frame);
    expect(containsCoordinate(geographic, frame)).toBe(true);
    expect(geographicToPixel(geographic, frame, size)).toEqual(pixel);
    expect(pixelToGeographic(pixel, frame, size)).toEqual({ longitude: 185, latitude: 5 });
    expect(frame).toEqual(DATELINE);
    expect(size).toEqual(SIZE);
    expect(geographic).toEqual({ longitude: -175, latitude: 5 });
    expect(pixel).toEqual({ x: 768, y: 128 });
  });

  it("checks 1024 seeded local/global round trips, longitude aliases, and size changes with exact equality", () => {
    const random = seededRandom(0x50_62_a7_1a);
    for (let index = 0; index < 1024; index++) {
      const west = (random() % 368640) / 1024 - 180;
      const longitudeSpan = index % 4 === 0 ? 360 : 2 ** ((random() % 19) - 10);
      const latitudeSpan = index % 4 === 0 ? 180 : 2 ** ((random() % 18) - 10);
      const south = -90 + (random() % ((180 - latitudeSpan) * 1024 + 1)) / 1024;
      const frame = { west, east: west + longitudeSpan, south, north: south + latitudeSpan };
      const size = { width: 2 ** ((random() % 21) - 4), height: 2 ** ((random() % 21) - 4) };
      const horizontal = (random() % 1048576) / 1048576;
      const vertical = (random() % 1048576) / 1048576;
      const pixel = { x: horizontal * size.width, y: vertical * size.height };
      const geographic = {
        longitude: west + horizontal * longitudeSpan,
        latitude: frame.north - vertical * latitudeSpan
      };
      // Dyadic bounds, fractions and sizes keep every intermediate below 53 significant bits: no tolerance is needed.
      expect(containsCoordinate(geographic, frame)).toBe(true);
      expect(geographicToPixel(geographic, frame, size)).toEqual(pixel);
      expect(pixelToGeographic(pixel, frame, size)).toEqual(geographic);
      const alias = { ...geographic, longitude: geographic.longitude + 360 * ((random() % 7) - 3) };
      expect(geographicToPixel(alias, frame, size)).toEqual(pixel);
      const scaledSize = { width: size.width * 8, height: size.height / 4 };
      const scaledPixel = { x: pixel.x * 8, y: pixel.y / 4 };
      expect(geographicToPixel(geographic, frame, scaledSize)).toEqual(scaledPixel);
      expect(pixelToGeographic(scaledPixel, frame, scaledSize)).toEqual(geographic);
    }
  });
});

describe("normalizeLongitude", () => {
  it.each([
    [-1080, 0],
    [-540, -180],
    [-360, 0],
    [-190, 170],
    [-180, -180],
    [-175.123456789, -175.123456789],
    [-0, 0],
    [0, 0],
    [12.123456789, 12.123456789],
    [180, -180],
    [190, -170],
    [360, 0],
    [540, -180],
    [1080, 0]
  ])("normalizes %s to %s without default decimal rounding", (longitude, expected) => {
    expect(normalizeLongitude(longitude)).toBe(expected);
  });

  it("handles the largest finite magnitudes without overflow or NaN", () => {
    for (const longitude of [-Number.MAX_VALUE, Number.MAX_VALUE]) {
      const normalized = normalizeLongitude(longitude);
      expect(Number.isFinite(normalized)).toBe(true);
      expect(normalized).toBeGreaterThanOrEqual(-180);
      expect(normalized).toBeLessThan(180);
      expect(normalizeLongitude(normalized)).toBe(normalized);
      expect(containsCoordinate({ longitude, latitude: 0 }, WORLD)).toBe(true);
      const pixel = geographicToPixel({ longitude, latitude: 0 }, WORLD, SIZE);
      expect(Number.isFinite(pixel.x)).toBe(true);
    }
  });

  it.each([NaN, Infinity, -Infinity])("rejects nonfinite longitude %s", longitude => {
    expectDomainError(() => normalizeLongitude(longitude), "INVALID_COORDINATE");
  });
});

describe("coordinate domain errors", () => {
  const invalidFrames: GeographicFrame[] = [
    { ...WORLD, west: -180.00000000000003 },
    { ...WORLD, west: 180, east: 190 },
    { ...WORLD, east: 180.00000000000006 },
    { ...WORLD, west: 0, east: 360.00000000000006 },
    { ...WORLD, east: -180 },
    { ...WORLD, east: -181 },
    { ...WORLD, west: 170, east: -170 },
    { ...WORLD, south: -90.00000000000001 },
    { ...WORLD, north: 90.00000000000001 },
    { ...WORLD, south: 0, north: 0 },
    { ...WORLD, south: 1, north: 0 },
    { ...WORLD, south: 91, north: 92 },
    { ...WORLD, south: -92, north: -91 },
    ...["west", "east", "south", "north"].flatMap(key =>
      [NaN, Infinity, -Infinity].map(value => ({ ...WORLD, [key]: value }))
    ),
    {} as GeographicFrame,
    null as unknown as GeographicFrame
  ];

  it.each(invalidFrames)("rejects an invalid or ambiguously wrapped frame: %j", frame => {
    expectDomainError(() => validateGeographicFrame(frame), "INVALID_FRAME");
    expectDomainError(() => containsCoordinate({ longitude: 0, latitude: 0 }, frame), "INVALID_FRAME");
    expectDomainError(() => geographicToPixel({ longitude: 0, latitude: 0 }, frame, SIZE), "INVALID_FRAME");
    expectDomainError(() => pixelToGeographic({ x: 0, y: 0 }, frame, SIZE), "INVALID_FRAME");
  });

  it("accepts the maximum unwrapped span and a positive, sub-degree span", () => {
    expect(() => validateGeographicFrame({ west: 179, east: 539, south: -90, north: 90 })).not.toThrow();
    expect(() =>
      validateGeographicFrame({ west: 1, east: 1 + Number.EPSILON, south: 0, north: Number.MIN_VALUE })
    ).not.toThrow();
  });

  it("defines a full-world span by the public IEEE-754 subtraction, without an epsilon tolerance", () => {
    for (const west of [0.1, -0.1, 10.1, -Number.MIN_VALUE, -Number.EPSILON]) {
      const frame = { west, east: west + 360, south: -90, north: 90 };
      expect(frame.east - frame.west).toBe(360);
      expect(() => validateGeographicFrame(frame)).not.toThrow();
      expect(geographicToPixel({ longitude: west, latitude: 90 }, frame, SIZE)).toEqual({ x: 0, y: 0 });
      expect(geographicToPixel({ longitude: frame.east, latitude: -90 }, frame, SIZE)).toEqual({ x: 1024, y: 512 });
      expect(pixelToGeographic({ x: 0, y: 0 }, frame, SIZE)).toEqual({ longitude: west, latitude: 90 });
      expect(pixelToGeographic({ x: 1024, y: 512 }, frame, SIZE)).toEqual({ longitude: frame.east, latitude: -90 });
    }
    const nextRepresentableSpan = 360.00000000000006;
    expect(nextRepresentableSpan).toBeGreaterThan(360);
    expectDomainError(
      () => validateGeographicFrame({ west: 0, east: nextRepresentableSpan, south: -90, north: 90 }),
      "INVALID_FRAME"
    );
  });

  it("distinguishes invalid frames, invalid coordinates, and valid points outside coverage", () => {
    expectDomainError(
      () => containsCoordinate({ longitude: 0, latitude: 0 }, { ...DATELINE, east: -170 }),
      "INVALID_FRAME"
    );
    expectDomainError(() => containsCoordinate({ longitude: NaN, latitude: 0 }, DATELINE), "INVALID_COORDINATE");
    expect(containsCoordinate({ longitude: 0, latitude: 0 }, DATELINE)).toBe(false);
    expectDomainError(() => geographicToPixel({ longitude: 0, latitude: 0 }, DATELINE, SIZE), "OUTSIDE_FRAME");
  });

  const outsidePoints: GeographicPoint[] = [
    { longitude: -1 - Number.EPSILON, latitude: 0 },
    { longitude: 1 + Number.EPSILON, latitude: 0 },
    { longitude: 0, latitude: -1 - Number.EPSILON },
    { longitude: 0, latitude: 1 + Number.EPSILON }
  ];

  it.each(outsidePoints)("rejects even just-outside geography rather than clipping or snapping: %j", point => {
    const frame = { west: -1, east: 1, south: -1, north: 1 };
    expect(containsCoordinate(point, frame)).toBe(false);
    expectDomainError(() => geographicToPixel(point, frame, SIZE), "OUTSIDE_FRAME");
  });

  it("rejects just-outside unwrapped and normalized dateline coordinates", () => {
    for (const longitude of [169.99999999999997, -190.00000000000003, 190.00000000000003, -169.99999999999997]) {
      const point = { longitude, latitude: 0 };
      expect(containsCoordinate(point, DATELINE)).toBe(false);
      expectDomainError(() => geographicToPixel(point, DATELINE, SIZE), "OUTSIDE_FRAME");
    }
  });

  it("does not round an outside normalized longitude onto an unwrapped zero-meridian boundary", () => {
    const frame = { west: 1, east: 360, south: -1, north: 1 };
    const outside = { longitude: Number.MIN_VALUE, latitude: 0 };
    expect(containsCoordinate(outside, frame)).toBe(false);
    expectDomainError(() => geographicToPixel(outside, frame, SIZE), "OUTSIDE_FRAME");
    expect(containsCoordinate({ longitude: -Number.MIN_VALUE, latitude: 0 }, frame)).toBe(true);
    expect(geographicToPixel({ longitude: 0, latitude: 0 }, frame, SIZE)).toEqual({ x: 1024, y: 256 });
  });

  const invalidCoordinates: GeographicPoint[] = [
    { longitude: 0, latitude: -90.00000000000001 },
    { longitude: 0, latitude: 90.00000000000001 },
    ...["longitude", "latitude"].flatMap(key =>
      [NaN, Infinity, -Infinity].map(value => ({ longitude: 0, latitude: 0, [key]: value }))
    ),
    {} as GeographicPoint,
    null as unknown as GeographicPoint
  ];

  it.each(invalidCoordinates)("rejects invalid geography instead of propagating NaN: %j", point => {
    expectDomainError(() => containsCoordinate(point, WORLD), "INVALID_COORDINATE");
    expectDomainError(() => geographicToPixel(point, WORLD, SIZE), "INVALID_COORDINATE");
  });

  const invalidSizes: CanvasSize[] = [
    ...["width", "height"].flatMap(key => [0, -1, NaN, Infinity, -Infinity].map(value => ({ ...SIZE, [key]: value }))),
    {} as CanvasSize,
    null as unknown as CanvasSize
  ];

  it.each(invalidSizes)("rejects nonpositive or nonfinite dimensions: %j", size => {
    expectDomainError(() => geographicToPixel({ longitude: 0, latitude: 0 }, WORLD, size), "INVALID_CANVAS_SIZE");
    expectDomainError(() => pixelToGeographic({ x: 0, y: 0 }, WORLD, size), "INVALID_CANVAS_SIZE");
  });

  const invalidPixels: PixelPoint[] = [
    ...["x", "y"].flatMap(key => [NaN, Infinity, -Infinity].map(value => ({ x: 0, y: 0, [key]: value }))),
    {} as PixelPoint,
    null as unknown as PixelPoint
  ];

  it.each(invalidPixels)("rejects nonfinite or malformed pixels: %j", point => {
    expectDomainError(() => pixelToGeographic(point, WORLD, SIZE), "INVALID_PIXEL");
  });

  it.each([
    { x: -Number.MIN_VALUE, y: 0 },
    { x: 0, y: -Number.MIN_VALUE },
    { x: SIZE.width + Number.EPSILON * SIZE.width, y: 0 },
    { x: 0, y: SIZE.height + Number.EPSILON * SIZE.height }
  ])("rejects even just-outside pixels without clipping: %j", point => {
    expectDomainError(() => pixelToGeographic(point, WORLD, SIZE), "OUTSIDE_CANVAS");
  });
});
