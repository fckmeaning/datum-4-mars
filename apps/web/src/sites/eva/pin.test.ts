import { describe, it, expect } from "vitest";
import { elevationAt, pinInfo, slopeAt } from "./pin";
import type { SiteDem } from "../useSiteDem";

/** 100 x 100 cells of 20 m near the equator; the ground rises to the east at `rise` m per cell. */
function ramp(rise: number): SiteDem {
  const w = 100;
  const degPerCell = 20 / (3396190 * (Math.PI / 180)); // 20 m in degrees
  const half = (w * degPerCell) / 2;
  const heights = new Float32Array(w * w);
  for (let r = 0; r < w; r++) for (let c = 0; c < w; c++) heights[r * w + c] = c * rise;
  return {
    meta: { id: "t", centre: { lat: 0, lon: 0 }, bounds: { west: -half, east: half, north: half, south: -half }, width: w, height: w, pixel_m: 20, min_m: 0, max_m: 99 * rise, offset: 0 },
    heights,
    dir: "/data/sites/t",
  };
}

describe("pin info", () => {
  it("reads elevation, slope and the lat/lon of a point", () => {
    const dem = ramp(10); // 10 m rise per 20 m: 26.6 degrees
    expect(slopeAt(dem, 0, 0)).toBeCloseTo(26.57, 1);
    const info = pinInfo(dem, 0, 0, { x: 0, y: 0 });
    expect(info.lat).toBeCloseTo(0, 6);
    expect(info.lon).toBeCloseTo(0, 6);
    expect(info.elevation).toBeCloseTo(49.5 * 10, -1);
    expect(info.walkable).toBe(false); // above 25 degrees
  });
  it("a gentle slope is walkable and the distance is measured from the station", () => {
    const dem = ramp(1); // 2.9 degrees
    const info = pinInfo(dem, 300, 400, { x: 0, y: 0 });
    expect(info.walkable).toBe(true);
    expect(info.slopeDeg).toBeCloseTo(2.86, 1);
    expect(info.fromStationM).toBeCloseTo(500, 6);
  });
  it("elevation increases to the east on the ramp", () => {
    const dem = ramp(2);
    expect(elevationAt(dem, 500, 0)).toBeGreaterThan(elevationAt(dem, -500, 0));
  });
});
