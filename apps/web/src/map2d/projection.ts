/**
 * projection.ts - Coordinate transformations between Mars geographic (planetocentric lat/lon)
 * and the local Gale Crater AOI Transverse Mercator projection (metres).
 *
 * Registered under the code "MARS:AOI" with proj4 and OpenLayers.
 * Based on contracts/projection.json.
 */

import proj4 from "proj4";
import { register } from "ol/proj/proj4";
import { get as getProjection, fromLonLat, toLonLat } from "ol/proj";
import type { Projection } from "ol/proj";
import projectionData from "../../../../contracts/projection.json";

export const PROJ_CODE = "MARS:AOI";
export const MARS_RADIUS_M = projectionData.sphere_radius_m;
export const PROJ_AOI_DEF = projectionData.proj_aoi;
export const PROJ_MARS_GEO = projectionData.proj_geographic;

let isRegistered = false;

interface Proj4TmercProjection {
  init: () => void;
  inverse: (p: { x: number; y: number }) => { x: number; y: number };
  lat0: number;
  long0: number;
  x0: number;
  y0: number;
  a: number;
  k0: number;
}

/**
 * Proj4's upstream spherical transverse mercator inverse (tmerc_approx.js line 116)
 * tests `if (y < 0) lat = -lat;` relative to y=0 rather than lat_0.
 * In southern hemisphere AOIs (such as Gale at lat_0 = -4.72°), points just north of the
 * projection center have y > 0 while their actual latitude is still negative.
 * This patch restores correct sign assignment using the true spherical central angle `temp`.
 */
function patchProj4SphericalTmercBug() {
  const tmerc = (proj4 as unknown as { Proj: { projections: { get: (name: string) => { init: () => void } } } })
    .Proj.projections.get("tmerc");
  if (!tmerc) return;

  const originalInit = tmerc.init;
  tmerc.init = function (this: Proj4TmercProjection) {
    originalInit.apply(this);
    const originalInverse = this.inverse;
    this.inverse = function (p: { x: number; y: number }) {
      const res = originalInverse.call(this, p);
      const temp = this.lat0 + (p.y - this.y0) / (this.a * this.k0);
      if (temp < 0 && res.y > 0) {
        res.y = -res.y;
      } else if (temp > 0 && res.y < 0) {
        res.y = -res.y;
      }
      return res;
    };
  };
}

export function ensureMarsAoiProjection(): Projection {
  if (!isRegistered) {
    patchProj4SphericalTmercBug();
    proj4.defs(PROJ_CODE, PROJ_AOI_DEF);
    proj4.defs(PROJ_MARS_GEO, PROJ_MARS_GEO);
    register(proj4);
    isRegistered = true;
  }
  const proj = getProjection(PROJ_CODE);
  if (!proj) {
    throw new Error(`Failed to initialize OpenLayers projection for ${PROJ_CODE}`);
  }
  return proj;
}

/**
 * Transforms [lon, lat] in planetocentric degrees to [x, y] in MARS:AOI local metres.
 */
export function toMarsAoi(lonLat: [number, number]): [number, number] {
  ensureMarsAoiProjection();
  const [x, y] = fromLonLat(lonLat, PROJ_CODE);
  return [x ?? 0, y ?? 0];
}

/**
 * Transforms [x, y] in MARS:AOI metres to [lon, lat] in planetocentric degrees.
 */
export function fromMarsAoi(xy: [number, number]): [number, number] {
  ensureMarsAoiProjection();
  const [lon, lat] = toLonLat(xy, PROJ_CODE);
  return [lon ?? 0, lat ?? 0];
}

/**
 * Converts planetocentric geographic coordinates to Gale AOI metres [x, y].
 * Accepts either `geoToAoi(lat, lon)` or `geoToAoi([lon, lat])`.
 * Shared implementation for W6 (2D) and W7 (3D).
 */
export function geoToAoi(lat: number, lon: number): [number, number];
export function geoToAoi(lonLat: [number, number]): [number, number];
export function geoToAoi(arg1: number | [number, number], arg2?: number): [number, number] {
  if (Array.isArray(arg1)) {
    return toMarsAoi(arg1);
  }
  return toMarsAoi([arg2 ?? 0, arg1]);
}

/**
 * Converts Gale AOI metres [x, y] to Mars geographic [lon, lat].
 * Accepts either `aoiToGeo(x, y)` or `aoiToGeo([x, y])`.
 * Shared implementation for W6 (2D) and W7 (3D).
 */
export function aoiToGeo(x: number, y: number): [number, number];
export function aoiToGeo(xy: [number, number]): [number, number];
export function aoiToGeo(arg1: number | [number, number], arg2?: number): [number, number] {
  if (Array.isArray(arg1)) {
    return fromMarsAoi(arg1);
  }
  return fromMarsAoi([arg1, arg2 ?? 0]);
}
