import { describe, it, expect } from "vitest";
import {
  getLimitingFactorColor,
  buildRouteTubeSegments,
  buildTraversePathPoints,
} from "./routeTube";
import { generateSyntheticGaleDEM } from "./terrainLoader";

describe("limiting factor color mapping", () => {
  it("maps hazard/slope to red danger token", () => {
    expect(getLimitingFactorColor("slope_exceeded")).toBe("#F85149");
    expect(getLimitingFactorColor("roughness_hazard")).toBe("#F85149");
  });

  it("maps energy/metabolic to amber warning token", () => {
    expect(getLimitingFactorColor("metabolic_energy")).toBe("#D29922");
    expect(getLimitingFactorColor("o2_consumption")).toBe("#D29922");
  });

  it("maps radiation/dose to purple approximate token", () => {
    expect(getLimitingFactorColor("dose_rate")).toBe("#BC8CFF");
    expect(getLimitingFactorColor("radiation_limit")).toBe("#BC8CFF");
  });

  it("maps time/speed to blue info token", () => {
    expect(getLimitingFactorColor("time_limit")).toBe("#58A6FF");
  });

  it("falls back to route profile color when no limiting factor present", () => {
    expect(getLimitingFactorColor(undefined, "FASTEST")).toBe("#56B4E9");
    expect(getLimitingFactorColor(undefined, "SAFEST")).toBe("#009E73");
    expect(getLimitingFactorColor(undefined, "BALANCED")).toBe("#E69F00");
    expect(getLimitingFactorColor(undefined, "SCIENCE")).toBe("#CC79A7");
  });
});

describe("buildRouteTubeSegments", () => {
  const dem = generateSyntheticGaleDEM(32, 32);

  it("elevates route points 1.0m above terrain surface", () => {
    const xy: Array<[number, number]> = [
      [0, 0],
      [500, 500],
      [1000, 1000],
    ];

    const segments = buildRouteTubeSegments(
      xy,
      [{ limiting_factor: "slope" }, { limiting_factor: "nominal" }],
      dem,
      2.0,
      "FASTEST",
      1.0 // 1.0m clearance
    );

    expect(segments.length).toBe(2);

    for (const seg of segments) {
      expect(seg.length).toBeGreaterThan(0);
      expect(seg.direction.length()).toBeCloseTo(1.0, 4);
    }

    expect(segments[0]!.color).toBe("#F85149");
    expect(segments[1]!.color).toBe("#3FB950");
  });

  it("handles empty or single point routes safely", () => {
    expect(buildRouteTubeSegments([], [], dem)).toEqual([]);
    expect(buildRouteTubeSegments([[0, 0]], [], dem)).toEqual([]);
  });
});

describe("buildTraversePathPoints", () => {
  const dem = generateSyntheticGaleDEM(32, 32);

  it("converts geo coordinates to 3D scene points 0.5m above surface", () => {
    const coords: Array<[number, number]> = [
      [137.44, -4.72],
      [137.442, -4.722],
    ];

    const points = buildTraversePathPoints(coords, dem, 2.0, 0.5);
    expect(points.length).toBe(2);
    expect(points[0]!.y).toBeGreaterThan(0);
  });
});
