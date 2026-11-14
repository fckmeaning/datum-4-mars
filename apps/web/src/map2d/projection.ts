import proj4 from "proj4";
import { register } from "ol/proj/proj4";
import { get as getProjection, fromLonLat, toLonLat } from "ol/proj";
import type { Projection } from "ol/proj";
import projectionData from "../../../../contracts/projection.json";

export const PROJ_CODE = "MARS:AOI";
export const MARS_RADIUS_M = projectionData.sphere_radius_m;
export const PROJ_AOI_DEF = projectionData.proj_aoi;

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
      // Bugfix for proj4 spherical tmerc when lat0 != 0:
      // proj4 checks (y < 0) instead of (temp < 0) when setting the sign of latitude.
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
