/**
 * terrainLoader.ts - Elevation COG reader via geotiff.js with bilinear elevation sampling,
 * automatic best-level fallback (L3 -> L2 -> L1 -> L0), overview support, and Three.js DataTexture creation.
 */

import { fromUrl, type GeoTIFFImage } from "geotiff";
import {
  DataTexture,
  RedFormat,
  FloatType,
  LinearFilter,
  ClampToEdgeWrapping,
} from "three";
import type { TerrainRasterData } from "./types";

/**
 * Default AOI bounding box from contracts/projection.json and L1 elevation metadata.
 * [minX, minY, maxX, maxY] in meters: [-7800, -10200, 7800, 10200]
 */
export const DEFAULT_AOI_BBOX: [number, number, number, number] = [
  -7800, -10200, 7800, 10200,
];

/**
 * Creates synthetic Gale Crater elevation data matching L1 raster characteristics.
 * Used for offline testing and fallback if the remote COG endpoint is unreachable.
 */
export function generateSyntheticGaleDEM(
  width = 78,
  height = 102,
  bbox: [number, number, number, number] = DEFAULT_AOI_BBOX
): TerrainRasterData {
  const count = width * height;
  const elevation = new Float32Array(count);

  const [minX, minY, maxX, maxY] = bbox;
  const dx = (maxX - minX) / width;
  const dy = (maxY - minY) / height;

  // Gale Crater floor: ~ -4500m
  // Mount Sharp central peak (located slightly South/Center): ~ -2000m
  const peakX = 1000;
  const peakY = -3000;
  const baseElev = -4500;
  const peakElev = -2050;
  const heightSpan = peakElev - baseElev;

  let minElevation = Infinity;
  let maxElevation = -Infinity;

  for (let row = 0; row < height; row++) {
    // GeoTIFF rows go from North (+Y) down to South (-Y)
    const y = maxY - row * dy;
    for (let col = 0; col < width; col++) {
      const x = minX + col * dx;

      // Radial distance to Mount Sharp center
      const dist = Math.hypot(x - peakX, y - peakY);
      const mound = Math.exp(-Math.pow(dist / 5500, 2));

      // Subtle terrain undulations
      const wave =
        Math.sin(x / 1200) * 45 +
        Math.cos(y / 1500) * 55 +
        Math.sin((x + y) / 800) * 25;

      const z = baseElev + mound * heightSpan + wave;
      const idx = row * width + col;
      elevation[idx] = z;

      if (z < minElevation) minElevation = z;
      if (z > maxElevation) maxElevation = z;
    }
  }

  return {
    width,
    height,
    bbox,
    elevation,
    minElevation,
    maxElevation,
    nodata: -32768,
  };
}

/**
 * Loads elevation raster data from a GeoTIFF COG URL.
 * Supports reading a specific overview index if available.
 * Falls back gracefully to synthetic DEM if loading fails.
 */
export async function loadElevationCOG(
  url = "/data/gale/L1/elevation.tif",
  overviewIndex = 0
): Promise<TerrainRasterData> {
  try {
    const tiff = await fromUrl(url);
    const count = await tiff.getImageCount();
    const idx = Math.min(count - 1, Math.max(0, overviewIndex));
    const image: GeoTIFFImage = await tiff.getImage(idx);

    const width = image.getWidth();
    const height = image.getHeight();

    const rawBbox = image.getBoundingBox();
    const bbox: [number, number, number, number] = [
      rawBbox[0] ?? DEFAULT_AOI_BBOX[0],
      rawBbox[1] ?? DEFAULT_AOI_BBOX[1],
      rawBbox[2] ?? DEFAULT_AOI_BBOX[2],
      rawBbox[3] ?? DEFAULT_AOI_BBOX[3],
    ];

    const rasters = await image.readRasters();
    const rawData = rasters[0];
    if (!rawData) {
      throw new Error("No raster bands found in GeoTIFF");
    }

    const elevation =
      rawData instanceof Float32Array ? rawData : new Float32Array(rawData);

    let minElevation = Infinity;
    let maxElevation = -Infinity;
    const nodata = -32768;

    for (let i = 0; i < elevation.length; i++) {
      const val = elevation[i]!;
      if (val > nodata + 100) {
        if (val < minElevation) minElevation = val;
        if (val > maxElevation) maxElevation = val;
      }
    }

    if (!isFinite(minElevation)) minElevation = -4578.97;
    if (!isFinite(maxElevation)) maxElevation = -2007.28;

    return {
      width,
      height,
      bbox,
      elevation,
      minElevation,
      maxElevation,
      nodata,
    };
  } catch (err) {
    // Graceful fallback for offline demo or unit tests
    return generateSyntheticGaleDEM();
  }
}

/**
 * Attempts to load the best available resolution COG (L3 -> L2 -> L1 -> L0).
 */
export async function loadBestElevationCOG(
  preferredLevel?: "L3" | "L2" | "L1" | "L0"
): Promise<TerrainRasterData> {
  const levels = ["L3", "L2", "L1", "L0"] as const;
  const ordered = preferredLevel
    ? [preferredLevel, ...levels.filter((l) => l !== preferredLevel)]
    : levels;

  for (const lvl of ordered) {
    const url = `/data/gale/${lvl}/elevation.tif`;
    try {
      const res = await fetch(url, { method: "HEAD" });
      if (res.ok) {
        const data = await loadElevationCOG(url);
        return data;
      }
    } catch {
      // Continue to next level
    }
  }

  // Fallback to L1 default or synthetic
  return loadElevationCOG("/data/gale/L1/elevation.tif");
}

/**
 * Bilinear sampling of terrain elevation at scene coordinates [sceneX, sceneZ].
 * sceneX is East (AOI x), sceneZ is South (-AOI y).
 */
export function sampleTerrainElevation(
  data: TerrainRasterData,
  sceneX: number,
  sceneZ: number
): number {
  const [minX, minY, maxX, maxY] = data.bbox;
  const aoiY = -sceneZ; // Convert from scene Z to AOI Y

  // Normalized uv coords in [0, 1]
  const u = (sceneX - minX) / (maxX - minX);
  const v = (maxY - aoiY) / (maxY - minY); // Top row is maxY

  if (u < 0 || u > 1 || v < 0 || v > 1) {
    return data.minElevation;
  }

  const px = u * (data.width - 1);
  const py = v * (data.height - 1);

  const x0 = Math.floor(px);
  const x1 = Math.min(data.width - 1, x0 + 1);
  const y0 = Math.floor(py);
  const y1 = Math.min(data.height - 1, y0 + 1);

  const fx = px - x0;
  const fy = py - y0;

  const idx00 = y0 * data.width + x0;
  const idx10 = y0 * data.width + x1;
  const idx01 = y1 * data.width + x0;
  const idx11 = y1 * data.width + x1;

  const v00 = data.elevation[idx00] ?? data.minElevation;
  const v10 = data.elevation[idx10] ?? data.minElevation;
  const v01 = data.elevation[idx01] ?? data.minElevation;
  const v11 = data.elevation[idx11] ?? data.minElevation;

  const top = v00 * (1 - fx) + v10 * fx;
  const bottom = v01 * (1 - fx) + v11 * fx;

  return top * (1 - fy) + bottom * fy;
}

/**
 * Creates a GPU Float DataTexture from the elevation array.
 */
export function createHeightDataTexture(data: TerrainRasterData): DataTexture {
  const tex = new DataTexture(
    data.elevation,
    data.width,
    data.height,
    RedFormat,
    FloatType
  );
  tex.internalFormat = "R32F";
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}
