/** Formatting and coverage helpers for lat/lon picked on the globe. */

/** "4.59° S, 137.44° E" for planetocentric lat and east-positive lon (lon wrapped to [0, 360)). */
export function formatLatLon(lat: number, lon: number, digits = 2): string {
  const ns = lat < 0 ? "S" : "N";
  const east = ((lon % 360) + 360) % 360;
  return `${Math.abs(lat).toFixed(digits)}° ${ns}, ${east.toFixed(digits)}° E`;
}

/** Gale Crater AOI that has real elevation data (contains the whole Curiosity traverse). */
export const GALE_COVERAGE = { latMin: -4.89, latMax: -4.55, lonMin: 137.27, lonMax: 137.53 } as const;

/** Slightly padded so a click near the crater still lands in the planner. */
export function isInsideCoverage(lat: number, lon: number, padDeg = 0.5): boolean {
  const east = ((lon % 360) + 360) % 360;
  return (
    lat >= GALE_COVERAGE.latMin - padDeg &&
    lat <= GALE_COVERAGE.latMax + padDeg &&
    east >= GALE_COVERAGE.lonMin - padDeg &&
    east <= GALE_COVERAGE.lonMax + padDeg
  );
}
