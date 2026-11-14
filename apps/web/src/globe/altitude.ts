/**
 * altitude.ts - Mars globe camera distance to orbital altitude conversion and clamping.
 * 
 * Mars mean volumetric radius R = 3396.19 km (contracts/projection.json, IAU 2000).
 * Globe sphere has radius 1.0 in Three.js coordinate space.
 * 
 * Altitude formula:
 *   altitude_km = (camera_distance_radius_units - 1.0) * MARS_RADIUS_KM
 *   camera_distance_radius_units = 1.0 + altitude_km / MARS_RADIUS_KM
 */

export const MARS_RADIUS_KM = 3396.19;

/** Minimum camera distance in globe radius units (~611 km, low orbit entry) */
export const MIN_CAMERA_DIST = 1.18;

/** Maximum camera distance in globe radius units (~13,585 km, high planetary overview) */
export const MAX_CAMERA_DIST = 5.0;

/** Default starting camera distance in globe radius units (~7,472 km) */
export const DEFAULT_CAMERA_DIST = 3.2;

/**
 * Converts a Three.js camera distance in globe radius units to altitude above surface in km.
 */
export function radiusToAltitudeKm(radiusUnits: number, marsRadiusKm = MARS_RADIUS_KM): number {
  return Math.max(0, (radiusUnits - 1.0) * marsRadiusKm);
}

/**
 * Converts an altitude above Martian surface in km to Three.js camera distance in globe radius units.
 */
export function altitudeKmToRadius(altitudeKm: number, marsRadiusKm = MARS_RADIUS_KM): number {
  return 1.0 + Math.max(0, altitudeKm) / marsRadiusKm;
}

/**
 * Clamps camera distance within operational zoom bounds.
 */
export function clampCameraDistance(
  dist: number,
  min = MIN_CAMERA_DIST,
  max = MAX_CAMERA_DIST
): number {
  return Math.max(min, Math.min(max, dist));
}

/**
 * Formats altitude in kilometers for HUD / status display.
 * E.g. "611 km" or "7,472 km".
 */
export function formatAltitude(altitudeKm: number): string {
  const rounded = Math.round(altitudeKm);
  return `${rounded.toLocaleString("en-US")} km`;
}
