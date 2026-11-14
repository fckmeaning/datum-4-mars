/** Mars geometry for the plate-carree tile maps (degrees on a sphere of R = 3396.19 km). */

export const MARS_RADIUS_KM = 3396.19;
export const MARS_KM_PER_DEG = (2 * Math.PI * MARS_RADIUS_KM) / 360;

/** Ground size of one screen pixel (east-west) for a view resolution in degrees per pixel at a latitude. */
export function resolutionToMetres(degPerPx: number, latDeg: number): number {
  return degPerPx * MARS_KM_PER_DEG * 1000 * Math.cos((latDeg * Math.PI) / 180);
}

/** "12 m", "340 m", "2.4 km" */
export function formatMetres(m: number): string {
  if (!Number.isFinite(m)) return "";
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`;
}
