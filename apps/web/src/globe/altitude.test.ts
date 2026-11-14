import { describe, it, expect } from "vitest";
import {
  MARS_RADIUS_KM,
  MIN_CAMERA_DIST,
  MAX_CAMERA_DIST,
  radiusToAltitudeKm,
  altitudeKmToRadius,
  clampCameraDistance,
  formatAltitude,
} from "./altitude";

describe("altitude conversion and mapping", () => {
  it("computes 0 km altitude at the planetary surface (radius = 1.0)", () => {
    expect(radiusToAltitudeKm(1.0)).toBe(0);
  });

  it("computes ~611 km altitude at minimum zoom (radius = 1.18)", () => {
    const alt = radiusToAltitudeKm(1.18);
    // 0.18 * 3396.19 = 611.3142 km
    expect(alt).toBeCloseTo(611.3142, 2);
  });

  it("computes ~7,472 km altitude at default camera pose (radius = 3.2)", () => {
    const alt = radiusToAltitudeKm(3.2);
    // 2.2 * 3396.19 = 7471.618 km
    expect(alt).toBeCloseTo(7471.618, 2);
  });

  it("supports roundtrip conversion between radius and altitude", () => {
    const originalAltKm = 1250.5;
    const radius = altitudeKmToRadius(originalAltKm);
    const roundtripAltKm = radiusToAltitudeKm(radius);
    expect(roundtripAltKm).toBeCloseTo(originalAltKm, 4);
  });

  it("clamps camera distance within minimum and maximum bounds", () => {
    expect(clampCameraDistance(0.5)).toBe(MIN_CAMERA_DIST);
    expect(clampCameraDistance(10.0)).toBe(MAX_CAMERA_DIST);
    expect(clampCameraDistance(2.5)).toBe(2.5);
  });

  it("formats altitude with commas and km suffix", () => {
    expect(formatAltitude(611.3)).toBe("611 km");
    expect(formatAltitude(7471.6)).toBe("7,472 km");
  });
});
