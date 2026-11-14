import { describe, it, expect } from "vitest";
import { Euler, Vector3 } from "three";
import {
  ATMOSPHERE_SHELL_RADIUS,
  SHELL_CLEARANCE,
  applyZoomStep,
  clampFreeDistance,
  enforceMinRadius,
  flyInPose,
  freeCameraPose,
  legacyChordPosition,
  length,
  minFreeZoomDistance,
  normalize,
  slerpUnit,
  texelSizeKm,
  type Vec3,
} from "./cameraSafety";
import { rotationToFace } from "./scriptedPose";
import { DEFAULT_CAMERA_DIST, MAX_CAMERA_DIST, MIN_CAMERA_DIST } from "./altitude";

/** Deterministic pseudo-random unit vectors (no Math.random: the tests must be reproducible). */
function directions(n: number): Vec3[] {
  const out: Vec3[] = [];
  let s = 12345;
  const next = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  for (let i = 0; i < n; i++) {
    const z = 2 * next() - 1;
    const phi = 2 * Math.PI * next();
    const r = Math.sqrt(1 - z * z);
    out.push([r * Math.cos(phi), z, r * Math.sin(phi)]);
  }
  return out;
}

describe("root cause: the old straight-line camera went through the planet", () => {
  it("chord interpolation at the old maximum zoom is below the surface when the AOI faces away", () => {
    const far: Vec3 = [0, 0, -1]; // Gale on the far side
    const r = length(legacyChordPosition(MIN_CAMERA_DIST, 0.85, far));
    expect(r).toBeCloseTo(0.7 * MIN_CAMERA_DIST, 3);
    expect(r).toBeLessThan(1.0); // inside Mars
  });

  it("is inside the atmosphere shell for AOI directions from about 100 degrees away", () => {
    const aoi = normalize([Math.sin((110 * Math.PI) / 180), 0, Math.cos((110 * Math.PI) / 180)]);
    expect(length(legacyChordPosition(MIN_CAMERA_DIST, 0.85, aoi))).toBeLessThan(ATMOSPHERE_SHELL_RADIUS);
  });

  it("the old fly-in passes through the planet centre when the AOI is opposite", () => {
    const far: Vec3 = [0, 0, -1];
    let minR = Infinity;
    for (let i = 0; i <= 200; i++) {
      const raw = i / 200;
      const e = raw < 0.5 ? 4 * raw ** 3 : 1 - (-2 * raw + 2) ** 3 / 2;
      const start: Vec3 = [0, 0, DEFAULT_CAMERA_DIST];
      const end: Vec3 = [0, 0, -MIN_CAMERA_DIST];
      const p: Vec3 = [start[0] * (1 - e) + end[0] * e, 0, start[2] * (1 - e) + end[2] * e];
      minR = Math.min(minR, length(p));
    }
    expect(minR).toBeLessThan(0.05);
  });
});

describe("new camera paths stay outside the planet and the shell in every direction", () => {
  const minR = ATMOSPHERE_SHELL_RADIUS + SHELL_CLEARANCE;

  it("free camera pose, all zoom factors, 400 AOI directions", () => {
    for (const aoi of directions(400)) {
      for (const d of [minR, 1.3, 1.6, 2.2, DEFAULT_CAMERA_DIST, MAX_CAMERA_DIST]) {
        for (const zf of [0, 0.2, 0.5, 0.85, 1]) {
          const { position } = freeCameraPose(d, zf, aoi, minR);
          expect(length(position)).toBeGreaterThanOrEqual(minR - 1e-9);
          expect(length(position)).toBeCloseTo(d, 6); // distance is the scalar the user chose: a slerp keeps it exactly
        }
      }
    }
  });

  it("fly-in pose never gets closer than the end distance, including an opposite AOI", () => {
    const all: Vec3[] = [[0, 0, -1], [0, 0, 1], [0, 1, 0], ...directions(300)];
    for (const aoi of all) {
      let lowest = Infinity;
      for (let i = 0; i <= 100; i++) {
        const { position } = flyInPose(i / 100, aoi, DEFAULT_CAMERA_DIST, MIN_CAMERA_DIST, ATMOSPHERE_SHELL_RADIUS + SHELL_CLEARANCE);
        lowest = Math.min(lowest, length(position));
      }
      expect(lowest).toBeGreaterThanOrEqual(MIN_CAMERA_DIST - 1e-9);
    }
  });

  it("enforceMinRadius lifts any pose, including the centre", () => {
    expect(length(enforceMinRadius([0, 0, 0.2], 1.2))).toBeCloseTo(1.2, 9);
    expect(length(enforceMinRadius([0, 0, 0], 1.2))).toBeCloseTo(1.2, 9);
    expect(enforceMinRadius([0, 0, 2], 1.2)).toEqual([0, 0, 2]);
  });
});

describe("free zoom limit from the texel size", () => {
  it("one texel of a 4096 px, 360 degree texture is 5.2 km", () => {
    expect(texelSizeKm()).toBeCloseTo(5.21, 2);
  });

  it("is 1.60 radii for a 900 px canvas (3 px per texel), far beyond the old 1.18", () => {
    expect(minFreeZoomDistance({ viewportHeightPx: 900 })).toBeCloseTo(1.6, 2);
    expect(minFreeZoomDistance({ viewportHeightPx: 900 })).toBeGreaterThan(MIN_CAMERA_DIST);
  });

  it("magnification at the limit is the allowed 3 px per texel", () => {
    const h = 1080;
    const d = minFreeZoomDistance({ viewportHeightPx: h });
    const altKm = (d - 1) * 3396.19;
    const visibleKm = 2 * altKm * Math.tan((42 * Math.PI) / 360);
    expect((h * texelSizeKm()) / visibleKm).toBeCloseTo(3, 1);
  });

  it("grows with the viewport and never goes below shell + clearance", () => {
    expect(minFreeZoomDistance({ viewportHeightPx: 1440 })).toBeGreaterThan(minFreeZoomDistance({ viewportHeightPx: 720 }));
    expect(minFreeZoomDistance({ viewportHeightPx: 10 })).toBeCloseTo(ATMOSPHERE_SHELL_RADIUS + SHELL_CLEARANCE, 9);
  });

  it("wheel/pinch steps can never reach below the limit, however many are applied", () => {
    let d = DEFAULT_CAMERA_DIST;
    for (let i = 0; i < 2000; i++) d = applyZoomStep(d, 0.94, 900, MAX_CAMERA_DIST);
    expect(d).toBeCloseTo(minFreeZoomDistance({ viewportHeightPx: 900 }), 9);
    for (let i = 0; i < 2000; i++) d = applyZoomStep(d, 1.06, 900, MAX_CAMERA_DIST);
    expect(d).toBe(MAX_CAMERA_DIST);
  });

  it("a resize while zoomed in re-clamps to the larger limit; NaN falls back to the maximum", () => {
    const small = minFreeZoomDistance({ viewportHeightPx: 600 });
    const big = minFreeZoomDistance({ viewportHeightPx: 1400 });
    expect(clampFreeDistance(small, 1400, MAX_CAMERA_DIST)).toBeCloseTo(big, 9);
    expect(clampFreeDistance(NaN, 900, MAX_CAMERA_DIST)).toBe(MAX_CAMERA_DIST);
  });
});

describe("slerpUnit and rotationToFace", () => {
  it("returns unit vectors, hits both ends, and goes around for opposite directions", () => {
    const a: Vec3 = [0, 0, 1];
    const b: Vec3 = [1, 0, 0];
    expect(slerpUnit(a, b, 0)).toEqual([0, 0, 1]);
    const end = slerpUnit(a, b, 1);
    expect(end[0]).toBeCloseTo(1, 9);
    const mid = slerpUnit(a, b, 0.5);
    expect(length(mid)).toBeCloseTo(1, 9);
    expect(mid[0]).toBeCloseTo(Math.SQRT1_2, 9);
    const opp = slerpUnit([0, 0, 1], [0, 0, -1], 0.5);
    expect(length(opp)).toBeCloseTo(1, 9);
    expect(Math.abs(opp[2])).toBeLessThan(1e-6); // perpendicular to both: it goes over the side
  });

  it("rotationToFace carries any direction to +Z under three.js Euler XYZ", () => {
    for (const v of directions(200)) {
      const { x, y } = rotationToFace(v);
      const out = new Vector3(v[0], v[1], v[2]).applyEuler(new Euler(x, y, 0, "XYZ"));
      expect(out.x).toBeCloseTo(0, 6);
      expect(out.y).toBeCloseTo(0, 6);
      expect(out.z).toBeCloseTo(1, 6);
    }
  });
});
