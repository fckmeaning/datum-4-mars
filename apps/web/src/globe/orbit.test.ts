import { describe, it, expect } from "vitest";
import {
  latLonToVector3,
  vector3ToLatLon,
  greatCircleDistance,
  computeOrbiterPosition,
  generateOrbitTrackPoints,
  DEFAULT_ORBITERS,
  type OrbiterDef,
  interpolateOrbiterState,
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

  describe("interpolateOrbiterState", () => {
    const s1 = {
      id: "mro",
      utc: "2026-10-01T12:00:00Z",
      lat: 10.0,
      lon: 50.0,
      alt_m: 300000,
      xyz_bodyfixed_m: [0, 0, 0] as [number, number, number],
      accuracy: "approximate" as const,
    };
    const s2 = {
      id: "mro",
      utc: "2026-10-01T12:00:10Z",
      lat: 12.0,
      lon: 52.0,
      alt_m: 302000,
      xyz_bodyfixed_m: [0, 0, 0] as [number, number, number],
      accuracy: "approximate" as const,
    };

    it("interpolates intermediate state at alpha = 0.5", () => {
      const mid = interpolateOrbiterState(s1, s2, 0.5);
      expect(mid.lat).toBeCloseTo(11.0, 5);
      expect(mid.lon).toBeCloseTo(51.0, 5);
      expect(mid.alt_m).toBeCloseTo(301000, 2);
    });

    it("handles longitude anti-meridian wrapping correctly", () => {
      const wrap1 = { ...s1, lon: 179.0 };
      const wrap2 = { ...s2, lon: -179.0 }; // 2 degrees east across anti-meridian
      const mid = interpolateOrbiterState(wrap1, wrap2, 0.5);
      expect(Math.abs(mid.lon)).toBeCloseTo(180.0, 3);
    });

    it("clamps alpha within [0, 1]", () => {
      const start = interpolateOrbiterState(s1, s2, -0.5);
      expect(start.lat).toBeCloseTo(10.0, 5);

      const end = interpolateOrbiterState(s1, s2, 1.5);
      expect(end.lat).toBeCloseTo(12.0, 5);
    });
  });
});
