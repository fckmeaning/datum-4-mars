import { describe, it, expect } from "vitest";
import {
  latLonToVector3,
  vector3ToLatLon,
  greatCircleDistance,
  computeOrbiterPosition,
  generateOrbitTrackPoints,
  DEFAULT_ORBITERS,
  type OrbiterDef,
} from "./orbit";

describe("orbit coordinate conversions", () => {
  it("converts equator at prime meridian (lat 0, lon 0) to (0, 0, 1)", () => {
    const v = latLonToVector3(0, 0, 1.0);
    expect(v.x).toBeCloseTo(0, 6);
    expect(v.y).toBeCloseTo(0, 6);
    expect(v.z).toBeCloseTo(1, 6);
  });

  it("converts north pole (lat 90, lon 0) to (0, 1, 0)", () => {
    const v = latLonToVector3(90, 0, 1.0);
    expect(v.x).toBeCloseTo(0, 6);
    expect(v.y).toBeCloseTo(1, 6);
    expect(v.z).toBeCloseTo(0, 6);
  });

  it("converts south pole (lat -90, lon 0) to (0, -1, 0)", () => {
    const v = latLonToVector3(-90, 0, 1.0);
    expect(v.x).toBeCloseTo(0, 6);
    expect(v.y).toBeCloseTo(-1, 6);
    expect(v.z).toBeCloseTo(0, 6);
  });

  it("converts east point (lat 0, lon 90) to (1, 0, 0)", () => {
    const v = latLonToVector3(0, 90, 1.0);
    expect(v.x).toBeCloseTo(1, 6);
    expect(v.y).toBeCloseTo(0, 6);
    expect(v.z).toBeCloseTo(0, 6);
  });

  it("converts west point (lat 0, lon -90) to (-1, 0, 0)", () => {
    const v = latLonToVector3(0, -90, 1.0);
    expect(v.x).toBeCloseTo(-1, 6);
    expect(v.y).toBeCloseTo(0, 6);
    expect(v.z).toBeCloseTo(0, 6);
  });

  it("roundtrips random lat/lon coordinates accurately", () => {
    const testCases = [
      { lat: -4.72, lon: 137.4 }, // Gale crater
      { lat: 18.65, lon: -133.8 }, // Olympus Mons
      { lat: 45.0, lon: 45.0 },
      { lat: -30.0, lon: -120.0 },
      { lat: 0.0, lon: 179.9 },
    ];

    for (const tc of testCases) {
      const v = latLonToVector3(tc.lat, tc.lon, 2.5);
      const back = vector3ToLatLon(v);
      expect(back.lat).toBeCloseTo(tc.lat, 4);
      expect(back.lon).toBeCloseTo(tc.lon, 4);
      expect(back.r).toBeCloseTo(2.5, 4);
    }
  });

  it("handles zero vector safely", () => {
    const res = vector3ToLatLon({ x: 0, y: 0, z: 0 });
    expect(res).toEqual({ lat: 0, lon: 0, r: 0 });
  });

  it("computes great-circle distance accurately", () => {
    // Distance from pole to equator is pi/2
    const dPoleEquator = greatCircleDistance(90, 0, 0, 0);
    expect(dPoleEquator).toBeCloseTo(Math.PI / 2, 6);

    // Distance between antipodal points is pi
    const dAntipodal = greatCircleDistance(0, 0, 0, 180);
    expect(dAntipodal).toBeCloseTo(Math.PI, 6);

    // Same point distance is 0
    const dZero = greatCircleDistance(12.34, 56.78, 12.34, 56.78);
    expect(dZero).toBeCloseTo(0, 6);
  });
});

describe("placeholder orbiter kinematics", () => {
  it("maintains constant orbital radius throughout the orbit", () => {
    const orbiter: OrbiterDef = {
      id: "test",
      name: "TestSat",
      radius: 1.25,
      inclinationDeg: 60,
      raanDeg: 45,
      periodSeconds: 3600,
      color: "#00ff00",
      badge: "APPROXIMATE",
    };

    for (let t = 0; t <= 3600; t += 300) {
      const pos = computeOrbiterPosition(orbiter, t);
      const r = Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z);
      expect(r).toBeCloseTo(1.25, 5);
    }
  });

  it("generates closed orbit track points", () => {
    const orbiter = DEFAULT_ORBITERS[0]!;
    const points = generateOrbitTrackPoints(orbiter, 32);
    expect(points.length).toBe(33);

    const first = points[0]!;
    const last = points[points.length - 1]!;

    expect(first.x).toBeCloseTo(last.x, 5);
    expect(first.y).toBeCloseTo(last.y, 5);
    expect(first.z).toBeCloseTo(last.z, 5);
  });

  it("default orbiters are properly configured with APPROXIMATE badge", () => {
    expect(DEFAULT_ORBITERS.length).toBeGreaterThanOrEqual(4);
    for (const sat of DEFAULT_ORBITERS) {
      expect(sat.badge).toBe("APPROXIMATE");
      expect(sat.radius).toBeGreaterThan(1.0);
      expect(sat.periodSeconds).toBeGreaterThan(0);
    }
  });
});
