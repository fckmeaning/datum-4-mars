import type { TerrainRasterData } from "../map3d/types";
import { pixelSizeM } from "./demRaster";
import { groundSizeM, reliefStats } from "./reliefMath";
import type { SiteDem } from "./useSiteDem";

const rasterCache = new WeakMap<SiteDem, TerrainRasterData>();

/**
 * The elevation patch as the raster the 3D and first-person components read: local metres, x east and y north from the centre.
 * Built once per patch (the 3D scene asks for it from several components, and min/max over 3 million heights is not free).
 */
export function demToTerrainRaster(dem: SiteDem): TerrainRasterData {
  const hit = rasterCache.get(dem);
  if (hit) return hit;
  const { dx, dy } = pixelSizeM(dem.meta);
  const w = dx * dem.meta.width;
  const h = dy * dem.meta.height;
  const { min, max } = reliefStats(dem.heights);
  const raster: TerrainRasterData = {
    width: dem.meta.width,
    height: dem.meta.height,
    bbox: [-w / 2, -h / 2, w / 2, h / 2],
    elevation: dem.heights,
    minElevation: min,
    maxElevation: max,
    nodata: -32768,
  };
  rasterCache.set(dem, raster);
  return raster;
}

/**
 * A closed walking loop of the given radius that starts at the origin heading north (a circle through the centre point).
 * Used when a site has no planned route of its own.
 */
export function walkLoop(radiusM = 700, points = 72): number[][] {
  const out: number[][] = [];
  for (let i = 0; i <= points; i++) {
    const t = (i / points) * 2 * Math.PI;
    out.push([radiusM * Math.sin(t), radiusM - radiusM * Math.cos(t)]);
  }
  return out;
}

/** Local metres (x east, y north) of a lat/lon from the middle of the elevation tile, the origin of {@link demToTerrainRaster}. */
export function latLonToLocal(dem: SiteDem, lat: number, lon: number): { x: number; y: number } {
  const b = dem.meta.bounds;
  const size = groundSizeM(b, dem.meta.centre.lat);
  return {
    x: ((lon - (b.west + b.east) / 2) / (b.east - b.west)) * size.w,
    y: ((lat - (b.north + b.south) / 2) / (b.north - b.south)) * size.h,
  };
}

/**
 * A walking loop that starts at `start` and stays inside the tile: heads north, or south when the start is close to the
 * northern edge (the Gale station is).
 */
export function loopInTile(dem: SiteDem, start: { x: number; y: number }, radiusM = 900, points = 90): number[][] {
  const size = groundSizeM(dem.meta.bounds, dem.meta.centre.lat);
  const r = Math.min(radiusM, 0.2 * Math.min(size.w, size.h));
  const south = start.y + 2 * r > 0.45 * size.h;
  return walkLoop(r, points).map(([x, y]) => [start.x + x!, start.y + (south ? -y! : y!)]);
}

/** Inverse of {@link latLonToLocal}. */
export function localToLatLon(dem: SiteDem, x: number, y: number): { lat: number; lon: number } {
  const b = dem.meta.bounds;
  const size = groundSizeM(b, dem.meta.centre.lat);
  return {
    lon: (b.west + b.east) / 2 + (x / size.w) * (b.east - b.west),
    lat: (b.north + b.south) / 2 + (y / size.h) * (b.north - b.south),
  };
}
