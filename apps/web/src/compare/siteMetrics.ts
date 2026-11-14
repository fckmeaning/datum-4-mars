/**
 * Metrics for comparing the landing sites: the modelled global layers sampled at each station (radiation, pressure, slope, hazard,
 * elevation) plus two numbers computed here (mean sunlight over the Mars year, share of the sol with Earth above the horizon).
 * The radar uses the rank inside this set only: "better" means better than the other sites, not good in an absolute sense.
 */

import { meanInsolationWm2, earthOverSol } from "../sky/marsSky";

export type MetricId = "radiation" | "pressure" | "slope" | "hazard" | "sunlight" | "earth" | "elevation";

export interface MetricDef {
  id: MetricId;
  label: string;
  unit: string;
  digits: number;
  /** which direction is better for a crew */
  better: "high" | "low";
  /** where the number comes from */
  origin: "MODELED" | "COMPUTED";
  /** short reason for the direction, shown under the table */
  why: string;
  /** drawn on the radar */
  radar: boolean;
  /** axis name on the radar, worded so that the outside is good */
  short: string;
}

export const METRICS: MetricDef[] = [
  { id: "radiation", short: "Low radiation", label: "Radiation dose rate", unit: "mSv/day", digits: 2, better: "low", origin: "MODELED", why: "less dose per day", radar: true },
  { id: "pressure", short: "Pressure", label: "Surface pressure", unit: "Pa", digits: 0, better: "high", origin: "MODELED", why: "thicker air shields more and slows a landing", radar: true },
  { id: "slope", short: "Flat ground", label: "Regional slope", unit: "°", digits: 1, better: "low", origin: "MODELED", why: "flatter ground is easier to cross", radar: true },
  { id: "hazard", short: "Low hazard", label: "Hazard index", unit: "0–1", digits: 2, better: "low", origin: "MODELED", why: "fewer hazards on the surface", radar: true },
  { id: "sunlight", short: "Sunlight", label: "Mean sunlight (top of atmosphere)", unit: "W/m²", digits: 0, better: "high", origin: "COMPUTED", why: "more energy for solar power (no dust, flat ground)", radar: true },
  { id: "earth", short: "Earth link", label: "Earth in view", unit: "% of sol", digits: 0, better: "high", origin: "COMPUTED", why: "more time for a direct link", radar: true },
  { id: "elevation", short: "Low ground", label: "Elevation (MOLA)", unit: "m", digits: 0, better: "low", origin: "MODELED", why: "lower ground has thicker air (shown, not ranked on the radar)", radar: false },
];

export interface SiteInputs {
  id: string;
  name: string;
  lat: number;
  lon: number;
  radiation: number | null;
  pressure: number | null;
  slope: number | null;
  hazard: number | null;
  elevation: number | null;
}

export type SiteValues = Record<MetricId, number | null>;

/** Values of all metrics of one site at the instant `ms` (the Earth share depends on the date). */
export function valuesOf(site: SiteInputs, ms: number): SiteValues {
  return {
    radiation: site.radiation,
    pressure: site.pressure,
    slope: site.slope,
    hazard: site.hazard,
    elevation: site.elevation,
    sunlight: meanInsolationWm2(site.lat),
    earth: earthOverSol(site.lat, site.lon, ms).visibleFraction * 100,
  };
}

/** Goodness 0..1 of each site on one metric: the best site of the set gets 1, the worst 0; all equal gives 0.5; missing gives null. */
export function goodness(values: Array<number | null>, better: "high" | "low"): Array<number | null> {
  const real = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (real.length === 0) return values.map(() => null);
  const lo = Math.min(...real);
  const hi = Math.max(...real);
  return values.map((v) => {
    if (v === null || !Number.isFinite(v)) return null;
    if (hi - lo < 1e-12) return 0.5;
    const t = (v - lo) / (hi - lo);
    return better === "high" ? t : 1 - t;
  });
}

/** Index of the best value of a metric, or -1 when none has data or all are equal. */
export function bestIndex(values: Array<number | null>, better: "high" | "low"): number {
  let best = -1;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v === null || v === undefined || !Number.isFinite(v)) continue;
    if (best < 0 || (better === "high" ? v > values[best]! : v < values[best]!)) best = i;
  }
  if (best < 0) return -1;
  const real = values.filter((v): v is number => v !== null);
  return Math.max(...real) - Math.min(...real) < 1e-12 ? -1 : best;
}
