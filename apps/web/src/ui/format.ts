/**
 * Display formatting shared by the planner panels. Pure functions, no React.
 * Conventions (D-04): planetocentric latitude, east-positive longitude in [-180, 180).
 */

const MARS_RADIUS_M = 3_396_190;

export const DASH = "—";

function finite(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** 4.5895° S (the hemisphere letter follows the sign). */
export function formatLat(lat: number, digits = 4): string {
  return `${Math.abs(lat).toFixed(digits)}° ${lat < 0 ? "S" : "N"}`;
}

/** 137.4417° E (east-positive input; negative values are shown as W). */
export function formatLon(lon: number, digits = 4): string {
  return `${Math.abs(lon).toFixed(digits)}° ${lon < 0 ? "W" : "E"}`;
}

export function formatCoord(lat: number, lon: number, digits = 4): string {
  return `${formatLat(lat, digits)}, ${formatLon(lon, digits)}`;
}

/** Plain, copy-friendly "lat, lon" in signed decimal degrees. */
export function coordForClipboard(lat: number, lon: number, digits = 5): string {
  return `${lat.toFixed(digits)}, ${lon.toFixed(digits)}`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!finite(seconds)) return DASH;
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
}

export function formatDistance(metres: number | null | undefined): string {
  if (!finite(metres)) return DASH;
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}

export function formatDose(mSv: number | null | undefined): string {
  if (!finite(mSv)) return DASH;
  if (mSv < 0.01) return "<0.01 mSv";
  return `${mSv.toFixed(2)} mSv`;
}

export function formatOxygen(litres: number | null | undefined): string {
  if (!finite(litres)) return DASH;
  return `${litres.toFixed(litres < 10 ? 1 : 0)} L`;
}

export function formatSlope(deg: number | null | undefined): string {
  if (!finite(deg)) return DASH;
  return `${deg.toFixed(1)}°`;
}

export function formatElevation(m: number | null | undefined): string {
  if (!finite(m)) return DASH;
  return `${Math.round(m).toLocaleString("en-US").replace("-", "−")} m`;
}

export function formatTemperatureK(k: number | null | undefined): string {
  if (!finite(k)) return DASH;
  const c = Math.round(k - 273.15);
  return `${Math.round(k)} K (${c < 0 ? "−" : ""}${Math.abs(c)}°C)`;
}

/** "Sun sets in 3h 20m", "Sun is down" or an em dash when unknown. */
export function formatSunset(seconds: number | null | undefined): string {
  if (!finite(seconds)) return DASH;
  if (seconds <= 0) return "Sun is down";
  return `Sets in ${formatDuration(seconds)}`;
}

const WINDS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

/** 042° NE */
export function formatBearing(deg: number | null | undefined): string {
  if (!finite(deg)) return DASH;
  const d = ((deg % 360) + 360) % 360;
  const wind = WINDS[Math.round(d / 45) % 8] ?? "N";
  return `${Math.round(d).toString().padStart(3, "0")}° ${wind}`;
}

/** Great-circle distance on the Mars sphere (F01), metres. */
export function distanceMars(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * MARS_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Initial bearing from point 1 to point 2 (F02), degrees clockwise from north in [0, 360). */
export function bearingMars(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLon = (lon2 - lon1) * rad;
  const y = Math.sin(dLon) * Math.cos(lat2 * rad);
  const x = Math.cos(lat1 * rad) * Math.sin(lat2 * rad) - Math.sin(lat1 * rad) * Math.cos(lat2 * rad) * Math.cos(dLon);
  return ((Math.atan2(y, x) / rad) + 360) % 360;
}

export type VerdictCall = "READY" | "CAUTION" | "NO_GO";

export const VERDICT_LABEL: Record<VerdictCall, string> = {
  READY: "Ready",
  CAUTION: "Caution",
  NO_GO: "No-go",
};

/** Kind labels shown in search results and cards. */
export function placeKindLabel(kind: string, scienceTarget?: boolean): string {
  if (kind === "base") return "Base";
  if (scienceTarget) return "Science";
  if (kind === "mission_informal") return "Traverse";
  if (kind === "gazetteer") return "Landmark";
  if (kind === "coordinate") return "Coordinate";
  if (kind === "user") return "Saved";
  return kind;
}
