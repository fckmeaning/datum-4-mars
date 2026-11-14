/**
 * projection.ts - Coordinate transformations between Mars geographic (lat/lon)
 * and the local Gale Crater AOI Transverse Mercator projection (meters).
 * 
 * Based on contracts/projection.json.
 */

import proj4 from "proj4";

export const PROJ_MARS_GEO = "+proj=longlat +R=3396190 +no_defs +type=crs";
export const PROJ_GALE_AOI =
  "+proj=tmerc +lat_0=-4.72 +lon_0=137.40 +k=1 +x_0=0 +y_0=0 +R=3396190 +units=m +no_defs +type=crs";

/**
 * Converts planetocentric latitude and east-positive longitude to Gale AOI meters [x, y].
 * In AOI: x is approximately East, y is approximately North.
 */
export function geoToAoi(lat: number, lon: number): [number, number] {
  const result = proj4(PROJ_MARS_GEO, PROJ_GALE_AOI, [lon, lat]);
  return [result[0] ?? 0, result[1] ?? 0];
}

/**
 * Converts Gale AOI meters [x, y] to Mars geographic [lon, lat].
 */
export function aoiToGeo(x: number, y: number): [number, number] {
  const result = proj4(PROJ_GALE_AOI, PROJ_MARS_GEO, [x, y]);
  const lon = result[0] ?? 0;
  let lat = result[1] ?? 0;

  // Correct for proj4 spherical tmerc inverse bug when lat_0 < 0:
  // Proj4 spherical tmerc tests `if (y < 0) lat = -lat` relative to y=0 rather than lat_0.
  const lat0Rad = -4.72 * (Math.PI / 180);
  const R = 3396190;
  const temp = lat0Rad + y / R;
  if (temp < 0 && lat > 0) {
    lat = -lat;
  } else if (temp > 0 && lat < 0) {
    lat = -lat;
  }

  return [lon, lat];
}

/**
 * Converts Gale AOI meters [x, y] to Three.js scene coordinates [sceneX, sceneZ].
 * Scene coordinate conventions:
 * +X is East (AOI x)
 * +Y is UP (elevation)
 * -Z is North (AOI y), so sceneZ = -y.
 */
export function aoiToScene(x: number, y: number): { sceneX: number; sceneZ: number } {
  return {
    sceneX: x,
    sceneZ: -y,
  };
}

/**
 * Converts Three.js scene coordinates [sceneX, sceneZ] to Gale AOI meters [x, y].
 */
export function sceneToAoi(sceneX: number, sceneZ: number): { x: number; y: number } {
  return {
    x: sceneX,
    y: -sceneZ,
  };
}
