import { describe, it, expect } from "vitest";
import {
  generateSyntheticGaleDEM,
  sampleTerrainElevation,
  createHeightDataTexture,
  DEFAULT_AOI_BBOX,
} from "./terrainLoader";

describe("terrainLoader and elevation sampling", () => {
  it("generates synthetic Gale Crater DEM with correct dimensions and elevation bounds", () => {
    const dem = generateSyntheticGaleDEM(78, 102);

    expect(dem.width).toBe(78);
    expect(dem.height).toBe(102);
    expect(dem.elevation.length).toBe(78 * 102);

    // Min elevation should be around -4500m to -4600m
    expect(dem.minElevation).toBeLessThan(-4000);
    // Mount Sharp peak elevation should be around -2000m to -2100m
    expect(dem.maxElevation).toBeGreaterThan(-2200);

    expect(dem.bbox).toEqual(DEFAULT_AOI_BBOX);
  });

  it("samples elevation with bilinear interpolation across the bounding box", () => {
    const dem = generateSyntheticGaleDEM(78, 102);

    // Sample center
    const centerElev = sampleTerrainElevation(dem, 0, 0);
    expect(centerElev).toBeGreaterThan(dem.minElevation);
    expect(centerElev).toBeLessThanOrEqual(dem.maxElevation);

    // Sample out of bounds returns minElevation
    const outOfBounds = sampleTerrainElevation(dem, 99999, 99999);
    expect(outOfBounds).toBe(dem.minElevation);
  });

  it("creates a GPU float DataTexture from elevation raster", () => {
    const dem = generateSyntheticGaleDEM(32, 32);
    const tex = createHeightDataTexture(dem);

    expect(tex.image.width).toBe(32);
    expect(tex.image.height).toBe(32);
    expect(tex.internalFormat).toBe("R32F");

    tex.dispose();
  });
});
