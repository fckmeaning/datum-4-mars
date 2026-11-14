import { describe, expect, it } from "vitest";
import {
  EYE_HEIGHT_M,
  EYE_MIN_CLEARANCE_M,
  MARS_RADIUS_M,
  angleDiffDeg,
  bearingDistance,
  buildPathData,
  cumulativeAlong,
  curvatureDropM,
  demHeight,
  distanceAtTime,
  eyeElevation,
  headingDeg,
  horizonAngleDeg,
  insideDem,
  nearestDistanceOnPath,
  pathSpeedAt,
  pathStateAtDistance,
  segmentIndexAtDistance,
  slopeAlongHeadingDeg,
  smoothHeadingDeg,
  timeAtDistance,
  wrapDeg360,
  type Dem,
} from "./fpvMath";

/** 11 x 11 raster, 10 m pixels, covering x in [0, 110], y in [0, 110]; elevation = 0.1 * x (a 5.71 deg plane rising East). */
function ramp(): Dem {
  const w = 11;
  const h = 11;
  const elevation = new Float32Array(w * h);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) elevation[r * w + c] = 0.1 * (c * 10 + 5);
  return { width: w, height: h, bbox: [0, 0, 110, 110], elevation, minElevation: 0, nodata: -32768 };
}

describe("angles", () => {
  it("wraps and takes the shortest difference across 0/360", () => {
    expect(wrapDeg360(-10)).toBe(350);
    expect(wrapDeg360(370)).toBe(10);
    expect(angleDiffDeg(350, 10)).toBe(20);
    expect(angleDiffDeg(10, 350)).toBe(-20);
    expect(angleDiffDeg(0, 180)).toBe(180);
  });

  it("smooths a heading across the wrap without spinning the long way round", () => {
    const next = smoothHeadingDeg(355, 5, 0.1, 0.3);
    // must move towards +10 degrees (through 0), i.e. end up between 355 and 365 (= 5)
    expect(angleDiffDeg(355, next)).toBeGreaterThan(0);
    expect(angleDiffDeg(355, next)).toBeLessThan(10);
    let h = 355;
    for (let i = 0; i < 200; i++) h = smoothHeadingDeg(h, 5, 0.05, 0.3);
    expect(angleDiffDeg(h, 5)).toBeCloseTo(0, 3);
    expect(smoothHeadingDeg(100, 200, 0.1, 0)).toBe(200); // tau 0 snaps (reduced motion)
  });

  it("computes compass headings and the back-to-base vector", () => {
    expect(headingDeg(0, 1)).toBe(0);
    expect(headingDeg(1, 0)).toBe(90);
    expect(headingDeg(0, -1)).toBe(180);
    expect(headingDeg(-1, 0)).toBe(270);
    const v = bearingDistance(0, 0, 300, 400);
    expect(v.distanceM).toBeCloseTo(500, 9);
    expect(v.bearingDeg).toBeCloseTo(Math.atan2(300, 400) * (180 / Math.PI), 9);
  });
});

describe("terrain", () => {
  it("curvature drop at 3 km is d^2 / (2R) = 1.3 m (F04)", () => {
    expect(curvatureDropM(3000)).toBeCloseTo(9_000_000 / (2 * MARS_RADIUS_M), 12);
    expect(curvatureDropM(3000)).toBeCloseTo(1.325, 2);
    expect(curvatureDropM(10_000)).toBeCloseTo(14.72, 1);
    expect(curvatureDropM(0)).toBe(0);
  });

  it("samples a plane exactly with the pixel-centre convention and clamps outside", () => {
    const dem = ramp();
    expect(demHeight(dem, 55, 55)).toBeCloseTo(5.5, 5);
    expect(demHeight(dem, 20, 70)).toBeCloseTo(2.0, 5);
    expect(demHeight(dem, 33.3, 91.7)).toBeCloseTo(3.33, 5);
    expect(demHeight(dem, -500, 55)).toBeCloseTo(0.5, 5); // west of the raster: clamped to the first pixel centre
    expect(demHeight(dem, 5000, 55)).toBeCloseTo(10.5, 5);
    expect(insideDem(dem, 55, 55)).toBe(true);
    expect(insideDem(dem, 111, 55)).toBe(false);
  });

  it("falls back to the minimum on nodata", () => {
    const dem = ramp();
    dem.elevation[5 * 11 + 5] = -32768;
    expect(demHeight(dem, 55, 55)).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(demHeight(dem, 55, 55))).toBe(true);
  });

  it("measures the slope along a heading (uphill positive, 5.71 deg on a 0.1 plane)", () => {
    const dem = ramp();
    expect(slopeAlongHeadingDeg(dem, 55, 55, 90)).toBeCloseTo(Math.atan(0.1) * (180 / Math.PI), 4); // East = uphill
    expect(slopeAlongHeadingDeg(dem, 55, 55, 270)).toBeCloseTo(-Math.atan(0.1) * (180 / Math.PI), 4); // West = downhill
    expect(slopeAlongHeadingDeg(dem, 55, 55, 0)).toBeCloseTo(0, 6); // North = across the slope
  });

  it("finds the terrain horizon above the eye on a rising plane and a dip on flat ground", () => {
    const dem = ramp();
    const eye = demHeight(dem, 10, 55) + EYE_HEIGHT_M;
    const up = horizonAngleDeg(dem, 10, 55, eye, 90, 100, 5);
    expect(up).toBeGreaterThan(0);
    const flat: Dem = { ...dem, elevation: new Float32Array(dem.elevation.length).fill(100), minElevation: 100 };
    const a = horizonAngleDeg(flat, 55, 55, 100 + EYE_HEIGHT_M, 90, 50, 5);
    expect(a).toBeLessThan(0.2);
  });

  it("keeps the eye above the ground and smooths vertical jumps", () => {
    expect(eyeElevation(100, null, 0.016)).toBeCloseTo(100 + EYE_HEIGHT_M, 9);
    // ground jumps up 5 m in one frame: the eye lags but is clamped to the minimum clearance
    const e = eyeElevation(105, 101.7, 0.016);
    expect(e).toBeGreaterThanOrEqual(105 + EYE_MIN_CLEARANCE_M);
    expect(e).toBeLessThan(105 + EYE_HEIGHT_M);
    // ground drops 5 m: the eye settles towards the target but never below the clearance
    let eye: number | null = 101.7;
    for (let i = 0; i < 400; i++) eye = eyeElevation(96, eye, 0.016);
    expect(eye).toBeCloseTo(96 + EYE_HEIGHT_M, 2);
  });
});

describe("route path", () => {
  // L-shaped path: 100 m East at 1 m/s, then 50 m North at 0.5 m/s
  const path = buildPathData(
    [
      [0, 0],
      [100, 0],
      [100, 50],
    ],
    [{ duration_s: 100 }, { duration_s: 100 }],
  );

  it("builds cumulative distance and time", () => {
    expect(path.totalLength).toBeCloseTo(150, 9);
    expect(path.totalTime).toBeCloseTo(200, 9);
    expect(path.cumLen).toEqual([0, 100, 150]);
  });

  it("samples position and leg heading by distance", () => {
    const a = pathStateAtDistance(path, 40);
    expect(a.x).toBeCloseTo(40, 9);
    expect(a.y).toBeCloseTo(0, 9);
    expect(a.headingDeg).toBeCloseTo(90, 9);
    const b = pathStateAtDistance(path, 125);
    expect(b.x).toBeCloseTo(100, 9);
    expect(b.y).toBeCloseTo(25, 9);
    expect(b.headingDeg).toBeCloseTo(0, 9);
    const end = pathStateAtDistance(path, 1e9);
    expect([end.x, end.y]).toEqual([100, 50]);
    expect(pathStateAtDistance(path, -5).x).toBe(0);
  });

  it("converts between walking time and distance using each leg's own speed", () => {
    expect(distanceAtTime(path, 50)).toBeCloseTo(50, 9);
    expect(distanceAtTime(path, 150)).toBeCloseTo(125, 9); // 100 m + half of the 100 s second leg = 25 m
    expect(timeAtDistance(path, 125)).toBeCloseTo(150, 9);
    expect(pathSpeedAt(path, 10)).toBeCloseTo(1, 9);
    expect(pathSpeedAt(path, 120)).toBeCloseTo(0.5, 9);
  });

  it("uses the fallback speed when a leg has no duration, and ignores invalid vertices", () => {
    const p = buildPathData([[0, 0], [8, 0], [Number.NaN, 3]], [{}]);
    expect(p.xy.length).toBe(2);
    expect(p.totalTime).toBeCloseTo(10, 9); // 8 m at 0.8 m/s
    expect(buildPathData([], []).totalLength).toBe(0);
    expect(pathStateAtDistance(buildPathData([[3, 4]]), 10)).toMatchObject({ x: 3, y: 4 });
  });

  it("finds the nearest distance on the path (rejoin after free roaming)", () => {
    expect(nearestDistanceOnPath(path, 60, 30)).toBeCloseTo(60, 9);
    expect(nearestDistanceOnPath(path, 130, 30)).toBeCloseTo(130, 9);
    expect(nearestDistanceOnPath(path, -50, 0)).toBeCloseTo(0, 9);
  });

  it("accumulates a per-leg resource linearly inside a leg", () => {
    expect(cumulativeAlong(path, [10, 4], 0)).toBe(0);
    expect(cumulativeAlong(path, [10, 4], 50)).toBeCloseTo(5, 9);
    expect(cumulativeAlong(path, [10, 4], 100)).toBeCloseTo(10, 9);
    expect(cumulativeAlong(path, [10, 4], 125)).toBeCloseTo(12, 9);
    expect(cumulativeAlong(path, [10, 4], 150)).toBeCloseTo(14, 9);
    expect(cumulativeAlong(path, [], 150)).toBe(0);
  });
});

describe("segments that do not match the legs one to one", () => {
  it("spreads each segment's time over its length (118 API steps vs 78 smoothed vertices in real routes)", () => {
    // legs: 100 m and 50 m; three equal 50 m segments taking 50 s, 100 s and 150 s
    const p = buildPathData(
      [[0, 0], [100, 0], [100, 50]],
      [
        { length_m: 50, duration_s: 50 },
        { length_m: 50, duration_s: 100 },
        { length_m: 50, duration_s: 150 },
      ],
    );
    expect(p.cumTime[1]).toBeCloseTo(150, 9); // first leg = segments 0 and 1
    expect(p.cumTime[2]).toBeCloseTo(300, 9);
    expect(p.totalTime).toBeCloseTo(300, 9);
    expect(pathSpeedAt(p, 10)).toBeCloseTo(100 / 150, 9);
    expect(pathSpeedAt(p, 120)).toBeCloseTo(50 / 150, 9);
    expect(segmentIndexAtDistance(p, 30)).toBe(0);
    expect(segmentIndexAtDistance(p, 70)).toBe(1);
    expect(segmentIndexAtDistance(p, 120)).toBe(2);
    expect(segmentIndexAtDistance(p, 1e6)).toBe(2);
  });

  it("splits a segment that straddles two legs proportionally", () => {
    // one 200 m segment of 200 s over legs of 50 m and 150 m
    const p = buildPathData([[0, 0], [50, 0], [200, 0]], [{ length_m: 200, duration_s: 200 }]);
    expect(p.cumTime[1]).toBeCloseTo(50, 9);
    expect(p.totalTime).toBeCloseTo(200, 9);
  });

  it("rescales when the segment lengths differ from the smoothed geometry length", () => {
    // geometry 100 m, segments sum to 120 m (path smoothing shortens it): time is preserved
    const p = buildPathData([[0, 0], [100, 0]], [{ length_m: 60, duration_s: 80 }, { length_m: 60, duration_s: 40 }]);
    expect(p.totalTime).toBeCloseTo(120, 9);
    expect(p.totalLength).toBeCloseTo(100, 9);
  });

  it("falls back to the default speed for a leg whose segments carry no duration", () => {
    const p = buildPathData([[0, 0], [80, 0]], [{ length_m: 80 }]);
    expect(p.totalTime).toBeCloseTo(100, 9); // 80 m at 0.8 m/s
  });
});
