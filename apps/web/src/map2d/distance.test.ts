import { describe, it, expect } from "vitest";
import { haversineMars, formatMarsDistance } from "./distance";
import { MARS_RADIUS_M } from "./projection";

describe("Mars distance calculations", () => {
  it("returns 0 for identical points", () => {
    const dist = haversineMars(-4.72, 137.40, -4.72, 137.40);
    expect(dist).toBe(0);
  });

  it("calculates accurate 1-degree meridian arc distance", () => {
    // 1 degree of latitude on Mars sphere of radius 3396190 m = (pi / 180) * 3396190 = 59275.09 m
    const expected = (Math.PI / 180) * MARS_RADIUS_M;
    const dist = haversineMars(0, 0, 1, 0);
    expect(Math.abs(dist - expected)).toBeLessThan(1e-2);
  });

  it("calculates realistic distance between Bradbury Landing and Boxwork Outcrops", () => {
    // Bradbury: -4.5895, 137.4417
    // Boxwork: -4.7550, 137.3820
    const dist = haversineMars(-4.5895, 137.4417, -4.7550, 137.3820);
    // Rough planar distance: sqrt((0.1655 * 59275)^2 + (0.0597 * 59275)^2) ~ 10.4 km
    expect(dist).toBeGreaterThan(9000);
    expect(dist).toBeLessThan(12000);
  });

  it("formats distances properly", () => {
    expect(formatMarsDistance(450)).toBe("450 m");
    expect(formatMarsDistance(1420)).toBe("1.4 km");
    expect(formatMarsDistance(10500)).toBe("10.5 km");
  });
});
