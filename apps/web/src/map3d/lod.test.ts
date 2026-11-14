import { describe, it, expect } from "vitest";
import { selectTerrainLOD, selectOverviewIndex } from "./lod";

describe("selectTerrainLOD", () => {
  it("uses 1:1 resolution for L1 DEM (78x102) as triangles are well below ceiling", () => {
    const lod = selectTerrainLOD(78, 102, 800_000);
    expect(lod.segmentsX).toBe(77);
    expect(lod.segmentsZ).toBe(101);
    expect(lod.stepX).toBe(1);
    expect(lod.stepZ).toBe(1);
    expect(lod.triangleCount).toBe(2 * 77 * 101); // 15,554 triangles
    expect(lod.triangleCount).toBeLessThan(1_000_000);
  });

  it("decimates L2 DEM (~770x1008) to stay strictly below 1M triangles", () => {
    const lod = selectTerrainLOD(770, 1008, 800_000);
    expect(lod.triangleCount).toBeLessThanOrEqual(800_000);
    expect(lod.triangleCount).toBeLessThan(1_000_000);
    expect(lod.stepX).toBeGreaterThanOrEqual(1);
  });

  it("decimates L3 DEM (~1538x2016 = 3.1M cells) to stay strictly below 1M triangles", () => {
    const lod = selectTerrainLOD(1538, 2016, 800_000);
    expect(lod.triangleCount).toBeLessThanOrEqual(800_000);
    expect(lod.triangleCount).toBeLessThan(1_000_000);
    expect(lod.stepX).toBeGreaterThanOrEqual(2);
  });
});

describe("selectOverviewIndex", () => {
  it("selects base image (index 0) for close-up camera distances", () => {
    expect(selectOverviewIndex(4, 2000)).toBe(0);
    expect(selectOverviewIndex(4, 5000)).toBe(0);
  });

  it("selects intermediate overview for mid-range altitudes", () => {
    expect(selectOverviewIndex(4, 10000)).toBe(1);
  });

  it("selects lowest overview for far-away viewing", () => {
    expect(selectOverviewIndex(4, 30000)).toBe(3);
  });

  it("handles images without overviews safely", () => {
    expect(selectOverviewIndex(0, 5000)).toBe(0);
  });
});
