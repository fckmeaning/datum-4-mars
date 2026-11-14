import { describe, it, expect } from "vitest";
import {
  sunAnglesToVector3,
  computeHillshade,
  computeApproximateMarsSun,
} from "./sun";

describe("sun direction vectors", () => {
  it("converts zenith sun (elevation 90 deg) to vertical vector (0, 1, 0)", () => {
    const s = sunAnglesToVector3(0, 90);
    expect(s.x).toBeCloseTo(0, 5);
    expect(s.y).toBeCloseTo(1, 5);
    expect(s.z).toBeCloseTo(0, 5);
  });

  it("converts North horizon sun (A=0, e=0) to North vector (0, 0, -1)", () => {
    const s = sunAnglesToVector3(0, 0);
    expect(s.x).toBeCloseTo(0, 5);
    expect(s.y).toBeCloseTo(0, 5);
    expect(s.z).toBeCloseTo(-1, 5);
  });

  it("converts East horizon sun (A=90, e=0) to East vector (1, 0, 0)", () => {
    const s = sunAnglesToVector3(90, 0);
    expect(s.x).toBeCloseTo(1, 5);
    expect(s.y).toBeCloseTo(0, 5);
    expect(s.z).toBeCloseTo(0, 5);
  });

  it("converts South horizon sun (A=180, e=0) to South vector (0, 0, 1)", () => {
    const s = sunAnglesToVector3(180, 0);
    expect(s.x).toBeCloseTo(0, 5);
    expect(s.y).toBeCloseTo(0, 5);
    expect(s.z).toBeCloseTo(1, 5);
  });

  it("converts West horizon sun (A=270, e=0) to West vector (-1, 0, 0)", () => {
    const s = sunAnglesToVector3(270, 0);
    expect(s.x).toBeCloseTo(-1, 5);
    expect(s.y).toBeCloseTo(0, 5);
    expect(s.z).toBeCloseTo(0, 5);
  });
});

describe("hillshade math vs analytic cos(i)", () => {
  it("matches analytic cos(i) = sin(e) on a horizontal plane", () => {
    const normal = { x: 0, y: 1, z: 0 }; // Horizontal plane
    const ambient = 0.15;

    const elevations = [0, 15, 30, 45, 60, 75, 90];
    const azimuths = [0, 45, 90, 135, 180, 225, 270, 315];

    for (const e of elevations) {
      for (const a of azimuths) {
        const sun = sunAnglesToVector3(a, e);
        const hillshade = computeHillshade(normal, sun, ambient);

        // Analytic incidence on horizontal plane: cos(i) = sin(e)
        const analyticCosI = Math.max(0, Math.sin((e * Math.PI) / 180));
        const analyticExpected = ambient + (1 - ambient) * analyticCosI;

        expect(hillshade).toBeCloseTo(analyticExpected, 5);
      }
    }
  });

  it("matches F14 analytic formula on an inclined slope", () => {
    // 25° slope facing East (aspect = 90°)
    const slopeDeg = 25;
    const aspectDeg = 90;
    const slopeRad = (slopeDeg * Math.PI) / 180;
    const aspectRad = (aspectDeg * Math.PI) / 180;

    // Surface normal: x = sin(slope)*sin(aspect), y = cos(slope), z = -sin(slope)*cos(aspect)
    const normal = {
      x: Math.sin(slopeRad) * Math.sin(aspectRad),
      y: Math.cos(slopeRad),
      z: -Math.sin(slopeRad) * Math.cos(aspectRad),
    };

    const sunElevDeg = 35;
    const sunAzDeg = 80;
    const sun = sunAnglesToVector3(sunAzDeg, sunElevDeg);

    const ambient = 0.2;
    const result = computeHillshade(normal, sun, ambient);

    // Analytic formula F14: cos(i) = cos(theta)*sin(e) + sin(theta)*cos(e)*cos(A - aspect)
    const eRad = (sunElevDeg * Math.PI) / 180;
    const aRad = (sunAzDeg * Math.PI) / 180;
    const cosI = Math.max(
      0,
      Math.cos(slopeRad) * Math.sin(eRad) +
        Math.sin(slopeRad) * Math.cos(eRad) * Math.cos(aRad - aspectRad)
    );
    const expected = ambient + (1 - ambient) * cosI;

    expect(result).toBeCloseTo(expected, 5);
  });
});

describe("approximate Mars solar calculation", () => {
  it("produces solar coordinates in valid range for Gale Crater", () => {
    const sun = computeApproximateMarsSun("2026-11-14T08:00:00Z", -4.72, 137.4);
    expect(sun.azimuth_deg).toBeGreaterThanOrEqual(0);
    expect(sun.azimuth_deg).toBeLessThan(360);
    expect(sun.elevation_deg).toBeGreaterThanOrEqual(-90);
    expect(sun.elevation_deg).toBeLessThanOrEqual(90);
  });
});
