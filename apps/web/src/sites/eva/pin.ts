/** What the dropped-pin card tells about a point of the tile. */

import { demHeight } from "../../fpv/fpvMath";
import { pixelSizeM } from "../demRaster";
import { demToTerrainRaster, localToLatLon } from "../terrainData";
import type { SiteDem } from "../useSiteDem";
import { EVA } from "./evaModel";
import type { TerrainRasterData } from "../../map3d/types";

const rasterCache = new WeakMap<SiteDem, TerrainRasterData>();
function rasterOf(dem: SiteDem): TerrainRasterData {
  let r = rasterCache.get(dem);
  if (!r) {
    r = demToTerrainRaster(dem);
    rasterCache.set(dem, r);
  }
  return r;
}

export interface PinInfo {
  x: number;
  y: number;
  lat: number;
  lon: number;
  elevation: number;
  /** slope over one cell of the elevation model */
  slopeDeg: number;
  /** within the suited walking limit */
  walkable: boolean;
  /** straight-line distance from the landing station [m] */
  fromStationM: number;
}

export function elevationAt(dem: SiteDem, x: number, y: number): number {
  return demHeight(rasterOf(dem), x, y);
}

export function slopeAt(dem: SiteDem, x: number, y: number): number {
  const r = rasterOf(dem);
  const { dx, dy } = pixelSizeM(dem.meta);
  const gx = (demHeight(r, x + dx, y) - demHeight(r, x - dx, y)) / (2 * dx);
  const gy = (demHeight(r, x, y + dy) - demHeight(r, x, y - dy)) / (2 * dy);
  return (Math.atan(Math.hypot(gx, gy)) * 180) / Math.PI;
}

export function pinInfo(dem: SiteDem, x: number, y: number, station: { x: number; y: number }): PinInfo {
  const { lat, lon } = localToLatLon(dem, x, y);
  const slopeDeg = slopeAt(dem, x, y);
  return {
    x,
    y,
    lat,
    lon,
    elevation: elevationAt(dem, x, y),
    slopeDeg,
    walkable: slopeDeg <= EVA.theta_max_deg,
    fromStationM: Math.hypot(x - station.x, y - station.y),
  };
}
