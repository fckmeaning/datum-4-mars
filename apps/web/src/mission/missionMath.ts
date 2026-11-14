/**
 * Mission planning math for the Mission view: launch windows, opposition and conjunction from the approximate planetary
 * elements (the table of orbits F52), the season at arrival, and the dose budget (transit plus surface stay) against the career limit.
 * Parameters are copies of config/params.yaml section `mission`; missionMath.test.ts compares them with the file.
 */

import { earthMarsPositions, mars24, type Vec3 } from "../sky/marsSky";

export const MISSION = {
  cruise_dose_msv_per_day: 1.84,
  transit_days: 180,
  surface_stay_d: 500,
  dose_limit_career_msv: 600,
  shielding_default: 1,
  dust_storm_ls_start_deg: 180,
  dust_storm_ls_end_deg: 360,
  conjunction_sep_deg: 3,
} as const;

/** Reference value of the surface dose rate of the Gale RAD measurement (config radiation.dose_eq_ref), used when a site has no modelled value. */
export const SURFACE_DOSE_REF_MSV_PER_DAY = 0.64;

const DAY_MS = 86_400_000;
const DEG = Math.PI / 180;

/** Mars leads Earth by this angle at the launch of a minimum-energy (Hohmann) transfer [deg], and the transfer time [d]. */
export function hohmannGeometry(): { leadDeg: number; transferDays: number } {
  const aE = 1.00000261;
  const aM = 1.52371034;
  const aT = (aE + aM) / 2;
  const transferYears = 0.5 * Math.pow(aT, 1.5);
  const marsRateDegPerYear = 360 / Math.pow(aM, 1.5);
  return { leadDeg: 180 - marsRateDegPerYear * transferYears, transferDays: transferYears * 365.25 };
}

function lon(v: Vec3): number {
  return Math.atan2(v[1], v[0]) / DEG;
}
function wrap180(d: number): number {
  return ((((d + 180) % 360) + 360) % 360) - 180;
}

/** Heliocentric longitude of Mars minus that of Earth, in (-180, 180]; falls from +180 (conjunction) through the launch lead to 0 (opposition). */
export function marsLead(ms: number): number {
  const { earth, mars } = earthMarsPositions(ms);
  return wrap180(lon(mars) - lon(earth));
}

/** Angle Sun-Earth-Mars [deg]: small near solar conjunction (the radio path passes close to the Sun). */
export function sunEarthMarsDeg(ms: number): number {
  const { earth, mars } = earthMarsPositions(ms);
  const toSun: Vec3 = [-earth[0], -earth[1], -earth[2]];
  const toMars: Vec3 = [mars[0] - earth[0], mars[1] - earth[1], mars[2] - earth[2]];
  const d = toSun[0] * toMars[0] + toSun[1] * toMars[1] + toSun[2] * toMars[2];
  const n = Math.hypot(...toSun) * Math.hypot(...toMars);
  return Math.acos(Math.max(-1, Math.min(1, d / n))) / DEG;
}

export type MissionEventKind = "launch" | "opposition" | "conjunction";

export interface MissionEvent {
  kind: MissionEventKind;
  ms: number;
  /** season at the event */
  lsDeg: number;
  /** launch: the arrival and the season it falls in */
  arrival?: { ms: number; lsDeg: number; inDustSeason: boolean };
  /** conjunction: days of the blackout (Sun-Earth-Mars angle below the limit) */
  blackoutDays?: number;
}

export function inDustSeason(lsDeg: number): boolean {
  return lsDeg >= MISSION.dust_storm_ls_start_deg && lsDeg < MISSION.dust_storm_ls_end_deg;
}

/** Linear interpolation of the instant where a monotone-in-the-step function crosses `level` between two samples. */
function crossing(t0: number, f0: number, t1: number, f1: number, level: number): number {
  return t0 + ((level - f0) / (f1 - f0)) * (t1 - t0);
}

/**
 * Launch windows (minimum-energy geometry), oppositions and solar conjunctions between two instants, found by a daily scan of the
 * heliocentric longitudes. Real mission windows differ by weeks (trajectory design): this is the geometry, not a launch plan.
 */
export function findMissionEvents(fromMs: number, toMs: number): MissionEvent[] {
  const { leadDeg, transferDays } = hohmannGeometry();
  const out: MissionEvent[] = [];
  let prevT = fromMs;
  let prev = marsLead(prevT);
  for (let t = fromMs + DAY_MS; t <= toMs; t += DAY_MS) {
    const cur = marsLead(t);
    if (prev > leadDeg && cur <= leadDeg) {
      const ms = crossing(prevT, prev, t, cur, leadDeg);
      const arrMs = ms + transferDays * DAY_MS;
      const arrLs = mars24(arrMs).lsDeg;
      out.push({ kind: "launch", ms, lsDeg: mars24(ms).lsDeg, arrival: { ms: arrMs, lsDeg: arrLs, inDustSeason: inDustSeason(arrLs) } });
    }
    if (prev > 0 && cur <= 0 && prev - cur < 90) {
      const ms = crossing(prevT, prev, t, cur, 0);
      out.push({ kind: "opposition", ms, lsDeg: mars24(ms).lsDeg });
    }
    if (prev < -90 && cur > 90) {
      // the wrap from -180 to +180: solar conjunction
      const ms = crossing(prevT, prev, t, cur - 360, -180);
      out.push({ kind: "conjunction", ms, lsDeg: mars24(ms).lsDeg, blackoutDays: blackoutDays(ms) });
    }
    prevT = t;
    prev = cur;
  }
  return out.sort((a, b) => a.ms - b.ms);
}

/** Days around a conjunction with the Sun-Earth-Mars angle below the limit (daily scan within 40 days). */
export function blackoutDays(conjMs: number): number {
  let n = 0;
  for (let d = -40; d <= 40; d++) if (sunEarthMarsDeg(conjMs + d * DAY_MS) < MISSION.conjunction_sep_deg) n++;
  return n;
}

// ---------------------------------------------------------------------------------------------------- dose

export interface DoseInput {
  /** surface dose rate [mSv/day] at the site (modelled layer) */
  surfaceMSvPerDay: number;
  /** multiplies the surface dose (a what-if: 1 = exposed, below 1 = shelter or regolith cover) */
  shielding?: number;
  transitDays?: number;
  stayDays?: number;
  cruiseMSvPerDay?: number;
  limitMSv?: number;
}

export interface DosePoint {
  day: number;
  mSv: number;
  phase: "outbound" | "surface" | "return";
}

export interface DoseBudget {
  points: DosePoint[];
  totalMSv: number;
  transitMSv: number;
  surfaceMSv: number;
  limitMSv: number;
  /** first day the cumulative dose exceeds the limit; null when never */
  limitDay: number | null;
  /** days the crew can stay at the surface before the limit, with both transits taken; 0 when the transits alone exceed it */
  maxStayDays: number;
  totalDays: number;
}

/** Cumulative effective dose of a round trip: outbound cruise, surface stay, return cruise. */
export function doseBudget(input: DoseInput): DoseBudget {
  const shielding = input.shielding ?? MISSION.shielding_default;
  const transit = input.transitDays ?? MISSION.transit_days;
  const stay = input.stayDays ?? MISSION.surface_stay_d;
  const cruise = input.cruiseMSvPerDay ?? MISSION.cruise_dose_msv_per_day;
  const limit = input.limitMSv ?? MISSION.dose_limit_career_msv;
  const surface = input.surfaceMSvPerDay * shielding;
  const total = 2 * transit + stay;

  const points: DosePoint[] = [{ day: 0, mSv: 0, phase: "outbound" }];
  const edges: Array<[number, number, DosePoint["phase"]]> = [
    [transit, cruise, "outbound"],
    [transit + stay, surface, "surface"],
    [total, cruise, "return"],
  ];
  let t = 0;
  let acc = 0;
  let limitDay: number | null = null;
  for (const [end, rate, phase] of edges) {
    if (limitDay === null && rate > 0 && acc < limit && acc + rate * (end - t) >= limit) limitDay = t + (limit - acc) / rate;
    acc += rate * (end - t);
    t = end;
    points.push({ day: t, mSv: acc, phase });
  }
  const transitMSv = 2 * transit * cruise;
  const room = limit - transitMSv;
  const maxStay = room <= 0 || surface <= 0 ? (room <= 0 ? 0 : Infinity) : room / surface;
  return { points, totalMSv: acc, transitMSv, surfaceMSv: stay * surface, limitMSv: limit, limitDay, maxStayDays: maxStay, totalDays: total };
}
