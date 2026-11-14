import { describe, it, expect } from "vitest";
import { MODEL, doseMSvPerDay, hillshade, layerValues, pixelSizeM, pressurePa, renderRaster, slopeDeg, valueAt } from "./demRaster";
import type { DemMeta } from "./reliefMath";

const meta: DemMeta = {
  id: "t",
  centre: { lat: 0, lon: 0 },
  bounds: { west: -0.5, east: 0.5, north: 0.5, south: -0.5 },
  width: 8,
  height: 8,
  pixel_m: 463,
  min_m: 0,
  max_m: 100,
  offset: 32768,
};

/** Plane rising to the east: 10 m per pixel */
const ramp = Float32Array.from({ length: 64 }, (_, i) => (i % 8) * 10);

describe("model constants", () => {
  it("reproduce the Gale reference values at the reference elevation", () => {
    expect(pressurePa(MODEL.h_ref_m)).toBeCloseTo(750, 6);
    expect(doseMSvPerDay(MODEL.h_ref_m)).toBeCloseTo(0.64, 6);
  });
  it("pressure falls and dose rises with height (less atmosphere to shield)", () => {
    expect(pressurePa(5000)).toBeLessThan(pressurePa(-5000));
    expect(doseMSvPerDay(5000)).toBeGreaterThan(doseMSvPerDay(-5000));
  });
  it("matches config/params.yaml", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const yaml = fs.readFileSync(path.resolve(__dirname, "../../../../config/params.yaml"), "utf8");
    const num = (key: string) => Number(new RegExp(`${key}:\\s*\\{ value: ([0-9.]+)`).exec(yaml)![1]);
    expect(num("scale_height_H")).toBe(MODEL.H_m);
    expect(num("P_ref")).toBe(MODEL.P_ref_Pa);
    expect(num("dose_eq_ref")).toBe(MODEL.dose_ref_mSv_day);
    expect(num("beta_pressure_dose")).toBe(MODEL.beta);
  });
});

describe("raster maths", () => {
  const { dx, dy } = pixelSizeM(meta);
  it("pixel size is about 463 m at the equator for 1/8 degree", () => {
    expect(dx).toBeCloseTo(7410, -1);
    expect(dy).toBeCloseTo(dx, 0);
  });
  it("slope of a plane is the same everywhere (interior)", () => {
    const s = slopeDeg(ramp, 8, 8, 10, 10); // 10 m per 10 m pixel -> 45 deg
    expect(s[3 * 8 + 4]).toBeCloseTo(45, 3);
    expect(s[5 * 8 + 2]).toBeCloseTo(45, 3);
  });
  it("hillshade is brighter on slopes facing the north-west sun than on those facing away", () => {
    const westFacing = Float32Array.from({ length: 64 }, (_, i) => -(i % 8) * 10); // higher to the west: faces east
    const eastFacing = ramp; // higher to the east: faces west, towards the sun azimuth 315
    const a = hillshade(eastFacing, 8, 8, 20, 20)[3 * 8 + 4]!;
    const b = hillshade(westFacing, 8, 8, 20, 20)[3 * 8 + 4]!;
    expect(a).toBeGreaterThan(b);
  });
  it("renders RGBA bytes of the right size and range", () => {
    const { data, spec } = renderRaster("elevation", ramp, 8, 8, meta);
    expect(data).toHaveLength(8 * 8 * 4);
    expect(spec.min).toBe(0);
    expect(spec.max).toBe(70);
    expect(data[3]).toBe(255);
  });
  it("hazard stays within 0..1", () => {
    const v = layerValues("hazard", ramp, 8, 8, dx, dy);
    for (const x of v) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
    }
  });
  it("valueAt reads the nearest pixel and returns null outside", () => {
    expect(valueAt("elevation", ramp, meta, 0.4, 0.4)).toBe(70);
    expect(valueAt("elevation", ramp, meta, 5, 0)).toBeNull();
  });
});

describe("layerValues on a big tile", () => {
  it("builds the hazard layer of a 3 million pixel tile (no spread of millions of values into Math.max)", () => {
    const w = 1500;
    const ht = 2000;
    const h = new Float32Array(w * ht);
    for (let i = 0; i < h.length; i++) h[i] = -4000 + (i % w) * 0.5 + Math.floor(i / w) * 0.2;
    const v = layerValues("hazard", h, w, ht, 10, 10);
    expect(v).toHaveLength(w * ht);
    expect(Number.isFinite(v[1234567])).toBe(true);
  });
});
