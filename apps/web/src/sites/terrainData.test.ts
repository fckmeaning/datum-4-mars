import { describe, it, expect } from "vitest";
import { demToTerrainRaster, latLonToLocal, localToLatLon, loopInTile, walkLoop } from "./terrainData";
import type { SiteDem } from "./useSiteDem";

const dem: SiteDem = {
  meta: {
    id: "t",
    centre: { lat: 0, lon: 0 },
    bounds: { west: -1, east: 1, north: 1, south: -1 },
    width: 4,
    height: 4,
    pixel_m: 463,
    min_m: -10,
    max_m: 50,
    offset: 32768,
  },
  heights: Float32Array.from([-10, 0, 5, 50, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8]),
  dir: "/data/sites/t",
};

describe("demToTerrainRaster", () => {
  it("centres the patch on the origin with real ground size", () => {
    const r = demToTerrainRaster(dem);
    const [minX, minY, maxX, maxY] = r.bbox;
    expect(minX).toBeCloseTo(-maxX, 6);
    expect(minY).toBeCloseTo(-maxY, 6);
    expect((maxX - minX) / 1000).toBeCloseTo(118.5, 0); // 2 degrees at the equator
    expect(r.minElevation).toBe(-10);
    expect(r.maxElevation).toBe(50);
    expect(r.width).toBe(4);
  });
});

describe("walkLoop", () => {
  it("is closed, starts at the origin and heads north", () => {
    const p = walkLoop(500, 40);
    expect(p[0]).toEqual([0, 0]);
    expect(p[p.length - 1]![0]).toBeCloseTo(0, 6);
    expect(p[p.length - 1]![1]).toBeCloseTo(0, 6);
    expect(p[1]![1]).toBeGreaterThan(0);
  });
  it("stays within its radius of the loop centre", () => {
    for (const [x, y] of walkLoop(500, 40)) expect(Math.hypot(x!, y! - 500)).toBeCloseTo(500, 6);
  });
});

describe("latLonToLocal and loopInTile", () => {
  it("maps the tile centre to the origin and corners to half the ground size", () => {
    const c = latLonToLocal(dem, 0, 0);
    expect(c.x).toBeCloseTo(0, 6);
    expect(c.y).toBeCloseTo(0, 6);
    const ne = latLonToLocal(dem, 1, 1);
    const r = demToTerrainRaster(dem);
    expect(ne.x).toBeCloseTo(r.bbox[2], 3);
    expect(ne.y).toBeCloseTo(r.bbox[3], 3);
  });
  it("starts where asked and stays inside the tile", () => {
    const r = demToTerrainRaster(dem);
    for (const start of [{ x: 0, y: 0 }, { x: 0, y: r.bbox[3] * 0.9 }]) {
      const p = loopInTile(dem, start, 40000, 40);
      expect(p[0]![0]).toBeCloseTo(start.x, 6);
      expect(p[0]![1]).toBeCloseTo(start.y, 6);
      for (const [x, y] of p) {
        expect(x!).toBeGreaterThanOrEqual(r.bbox[0]);
        expect(x!).toBeLessThanOrEqual(r.bbox[2]);
        expect(y!).toBeGreaterThanOrEqual(r.bbox[1]);
        expect(y!).toBeLessThanOrEqual(r.bbox[3]);
      }
    }
  });
});

describe("localToLatLon", () => {
  it("is the inverse of latLonToLocal", () => {
    for (const [lat, lon] of [[0.3, -0.4], [-0.9, 0.9], [0, 0]] as Array<[number, number]>) {
      const p = latLonToLocal(dem, lat, lon);
      const q = localToLatLon(dem, p.x, p.y);
      expect(q.lat).toBeCloseTo(lat, 9);
      expect(q.lon).toBeCloseTo(lon, 9);
    }
  });
});
