/** Scale bar: the largest 1-2-5 x 10^k length that fits in `maxPx`. */
export function niceScale(metersPerPixel: number, maxPx = 140): { meters: number; px: number; label: string } {
  const mpp = Math.max(1e-6, metersPerPixel);
  const max = mpp * maxPx;
  const pow = Math.pow(10, Math.floor(Math.log10(max)));
  const f = max / pow;
  const mult = f >= 5 ? 5 : f >= 2 ? 2 : 1;
  const meters = mult * pow;
  return { meters, px: meters / mpp, label: meters >= 1000 ? `${meters / 1000} km` : `${meters} m` };
}

export function formatLat(lat: number): string {
  return `${Math.abs(lat).toFixed(4)}° ${lat < 0 ? "S" : "N"}`;
}

export function formatLon(lon: number): string {
  return `${Math.abs(lon).toFixed(4)}° ${lon < 0 ? "W" : "E"}`;
}

/** Warn when the screen resolution is finer than the data (detail is interpolated, not measured). */
export function resolutionChip(metersPerPixel: number, cellM: number | undefined): string | null {
  if (!cellM || cellM <= 0) return null;
  return metersPerPixel < cellM * 0.9 ? `Data resolution ${+cellM.toFixed(1)} m: finer detail is interpolated` : null;
}

/** Finest screen resolution [m/px] the view may zoom to for data of `cellM`: a third of a cell, no pretence beyond that. */
export function finestResolution(cellM: number): number {
  return Math.max(0.5, cellM / 3);
}

/** Slope [deg] from four neighbouring elevations sampled `spanM` away east/west/north/south of the point. */
export function slopeDegFromSamples(east: number, west: number, north: number, south: number, spanM: number): number {
  if (![east, west, north, south].every(Number.isFinite) || spanM <= 0) return Number.NaN;
  const gx = (east - west) / (2 * spanM);
  const gy = (north - south) / (2 * spanM);
  return (Math.atan(Math.hypot(gx, gy)) * 180) / Math.PI;
}
