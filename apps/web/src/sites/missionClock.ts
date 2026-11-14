/**
 * Mission clock and daylight for the page header and the daylight line of the EVA budget.
 * Mars time, season and the Earth link come from this project's API (/sun, /earth/light-time: F-functions of docs/MATH.md);
 * the mission sol is the API's rule (local mean solar days since the landing day, packages/marsnav/.../sun mission_sol).
 */

import { earthMarsLightTime, mars24, sunPosition } from "../static/marsTime";

/** Landing times (UTC) of the missions that are still running; ended missions have no running sol count. */
export const ACTIVE_LANDINGS: Record<string, string> = {
  gale: "2012-08-06T05:17:00Z",
  jezero: "2021-02-18T20:55:00Z",
};

/** Seconds in one local solar hour: sol 88775.244 s / 24. */
export const MARS_SOLAR_HOUR_S = 88775.244 / 24;

export interface SunReply {
  msd: number;
  ls_deg: number;
  lmst_h: number;
  ltst_h: number;
  declination_deg: number;
  elevation_deg: number;
}

export interface MissionClock {
  /** null for ended missions */
  sol: number | null;
  lmstH: number;
  ltstH: number;
  lsDeg: number;
  declinationDeg: number;
  elevationDeg: number;
  /** one-way Earth link delay [s], null when the API could not give it */
  lightS: number | null;
}

/** Mission sol at a longitude: whole local mean solar days between the landing day and now (the API's rule). */
export function solFromMsd(msdNow: number, msdLanding: number, lonEastDeg: number): number {
  return Math.floor(msdNow + lonEastDeg / 360) - Math.floor(msdLanding + lonEastDeg / 360);
}

/** Local true solar times [h] of sunrise and sunset (sun centre on the horizon); null in polar day or night. */
export function sunriseSunset(latDeg: number, declinationDeg: number): { sunriseH: number; sunsetH: number } | null {
  const rad = Math.PI / 180;
  const c = -Math.tan(latDeg * rad) * Math.tan(declinationDeg * rad);
  if (c <= -1 || c >= 1) return null;
  const h0 = (Math.acos(c) / rad) / 15; // half the day length in hours
  return { sunriseH: 12 - h0, sunsetH: 12 + h0 };
}

export function formatHours(h: number): string {
  const total = Math.round(((h % 24) + 24) % 24 * 60);
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function formatLight(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}m ${String(Math.round(s - m * 60)).padStart(2, "0")}s`;
}

async function getJson<T>(url: string, f: typeof fetch): Promise<T | null> {
  try {
    const r = await f(url);
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

/**
 * Mission clock computed in the browser (static build): the TypeScript port of the Python Mars24 and light-time code
 * (`static/marsTime.ts`, pinned to the Python values by tests). Needs no server.
 */
export function computeMissionClock(siteId: string, station: { lat: number; lon: number }, utc: Date): MissionClock {
  const lon = ((station.lon + 540) % 360) - 180;
  const sun = sunPosition(station.lat, lon, utc);
  const landing = ACTIVE_LANDINGS[siteId];
  return {
    sol: landing ? solFromMsd(sun.msd, mars24(landing).msd, station.lon) : null,
    lmstH: sun.lmstH,
    ltstH: sun.ltstH,
    lsDeg: sun.lsDeg,
    declinationDeg: sun.declinationDeg,
    elevationDeg: sun.elevationDeg,
    lightS: earthMarsLightTime(utc).oneWayS,
  };
}

/**
 * Reads the clock at the landing station for `utc`. Without `f` it is computed in the browser and never fails; with an injected
 * `f` (tests, or an explicit server) it asks that server and returns null when it is not reachable.
 */
export async function fetchMissionClock(
  siteId: string,
  station: { lat: number; lon: number },
  utc: Date,
  f?: typeof fetch,
): Promise<MissionClock | null> {
  if (!f) return computeMissionClock(siteId, station, utc);
  const t = utc.toISOString().replace(/\.\d+Z$/, "Z");
  const lon = ((station.lon + 540) % 360) - 180;
  const sun = await getJson<SunReply>(`/api/v1/sun?lat=${station.lat}&lon=${lon}&utc=${encodeURIComponent(t)}`, f);
  if (!sun) return null;
  const light = await getJson<{ one_way_s: number }>(`/api/v1/earth/light-time?utc=${encodeURIComponent(t)}`, f);
  let sol: number | null = null;
  const landing = ACTIVE_LANDINGS[siteId];
  if (landing) {
    const l = await getJson<SunReply>(`/api/v1/sun?lat=${station.lat}&lon=${lon}&utc=${encodeURIComponent(landing)}`, f);
    if (l) sol = solFromMsd(sun.msd, l.msd, station.lon);
  }
  return {
    sol,
    lmstH: sun.lmst_h,
    ltstH: sun.ltst_h,
    lsDeg: sun.ls_deg,
    declinationDeg: sun.declination_deg,
    elevationDeg: sun.elevation_deg,
    lightS: light?.one_way_s ?? null,
  };
}
