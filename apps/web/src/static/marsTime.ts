/**
 * Mars time, sun geometry, Earth-Mars light time and orbiter positions in the browser (no server).
 *
 * A line-by-line TypeScript port of the Python reference, so a static build gives the same numbers as the API:
 *   packages/marsnav/src/marsnav/sun/__init__.py      F11-F13, mission_sol  (Mars24, Allison & McEwen 2000)
 *   packages/marsnav/src/marsnav/orbits/__init__.py   F49 orbit_positions, F52 earth_mars_light_time
 * Constants come from config/params.yaml (`constants.*`). The test `marsTime.test.ts` pins the outputs to values printed by
 * the Python code. Results are APPROXIMATE (Mars24 and Keplerian elements, not SPICE), exactly like the API says.
 */

export const R_SPHERE_M = 3396190.0;
export const C_LIGHT_MS = 299792458.0;
export const GM_MARS = 4.2828e13;
export const J2_MARS = 1.96e-3;
export const W0_DEG = 176.63;
export const WDOT_DEG_PER_DAY = 350.89198226;
export const S0_1AU = 1361.0;
/** params.yaml atmosphere.tau_default (the API uses it for the /sun irradiance). */
export const TAU_DEFAULT = 0.5;
const AU_M = 149597870700.0;
const J2000_JD = 2451545.0;

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const mod = (a: number, n: number) => ((a % n) + n) % n;

// TAI-UTC leap-second table, same rows as the Python module: [UTC ms of the change, TAI-UTC seconds].
const LEAP: Array<[number, number]> = [
  [Date.UTC(1999, 0, 1), 32.0],
  [Date.UTC(2006, 0, 1), 33.0],
  [Date.UTC(2009, 0, 1), 34.0],
  [Date.UTC(2012, 6, 1), 35.0],
  [Date.UTC(2015, 6, 1), 36.0],
  [Date.UTC(2017, 0, 1), 37.0],
];

// (A_i, tau_i, phi_i) perturbations, Mars24 step B-3
const PBS: Array<[number, number, number]> = [
  [0.0071, 2.2353, 49.409],
  [0.0057, 2.7543, 168.173],
  [0.0039, 1.1177, 191.837],
  [0.0037, 15.7866, 21.736],
  [0.0021, 2.1354, 15.704],
  [0.002, 2.4694, 95.528],
  [0.0018, 32.8493, 49.095],
];

/** Parses an ISO 8601 UTC timestamp (a missing zone means UTC, like the Python parse_utc). Throws on garbage. */
export function parseUtcMs(utc: string | Date | number): number {
  if (typeof utc === "number") return utc;
  if (utc instanceof Date) return utc.getTime();
  const s = utc.trim();
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(s);
  const ms = Date.parse(hasZone ? s : `${s}Z`);
  if (!Number.isFinite(ms)) throw new RangeError(`Invalid UTC timestamp: ${utc}`);
  return ms;
}

export function ttMinusUtc(ms: number): number {
  let tai = 31.0;
  for (const [when, value] of LEAP) if (ms >= when) tai = value;
  return tai + 32.184;
}

export interface MarsTime {
  jdTt: number;
  dtJ2000: number;
  mDeg: number;
  nuMinusMDeg: number;
  lsDeg: number;
  eotDeg: number;
  /** Mars Sol Date */
  msd: number;
  /** mean solar time at the prime meridian [h] */
  mstH: number;
  declinationDeg: number;
  sunDistanceAu: number;
}

/** F11: Mars24 quantities for a UTC instant. */
export function mars24(utc: string | Date | number): MarsTime {
  const ms = parseUtcMs(utc);
  const jdUt = 2440587.5 + ms / 1000 / 86400.0;
  const jdTt = jdUt + ttMinusUtc(ms) / 86400.0;
  const d = jdTt - 2451545.0;
  const M = 19.3871 + 0.52402073 * d;
  const aFms = 270.3871 + 0.524038496 * d;
  let pbs = 0;
  for (const [A, tau, phi] of PBS) pbs += A * Math.cos((0.985626 * d / tau + phi) * RAD);
  const Mr = M * RAD;
  const nuM =
    (10.691 + 3.0e-7 * d) * Math.sin(Mr) +
    0.623 * Math.sin(2 * Mr) +
    0.05 * Math.sin(3 * Mr) +
    0.005 * Math.sin(4 * Mr) +
    0.0005 * Math.sin(5 * Mr) +
    pbs;
  const ls = mod(aFms + nuM, 360.0);
  const lr = ls * RAD;
  const eot = 2.861 * Math.sin(2 * lr) - 0.071 * Math.sin(4 * lr) + 0.002 * Math.sin(6 * lr) - nuM;
  const msd = (jdTt - 2451549.5) / 1.0274912517 + 44796.0 - 0.0009626;
  const mst = mod(24.0 * msd, 24.0);
  const dec = Math.asin(0.42565 * Math.sin(lr)) * DEG + 0.25 * Math.sin(lr);
  const r =
    1.52367934 *
    (1.00436 - 0.09309 * Math.cos(Mr) - 0.004336 * Math.cos(2 * Mr) - 0.00031 * Math.cos(3 * Mr) - 0.00003 * Math.cos(4 * Mr));
  return { jdTt, dtJ2000: d, mDeg: mod(M, 360.0), nuMinusMDeg: nuM, lsDeg: ls, eotDeg: eot, msd, mstH: mst, declinationDeg: dec, sunDistanceAu: r };
}

/** F12: local mean and true solar time [Mars hours] at an east longitude. */
export function solarTime(lonEastDeg: number, mt: MarsTime): { lmstH: number; ltstH: number } {
  const lmst = mod(mt.mstH + lonEastDeg / 15.0, 24.0);
  return { lmstH: lmst, ltstH: mod(lmst + mt.eotDeg / 15.0, 24.0) };
}

export interface SunState {
  utc: string;
  msd: number;
  lsDeg: number;
  lmstH: number;
  ltstH: number;
  elevationDeg: number;
  azimuthDeg: number;
  declinationDeg: number;
  sunDistanceAu: number;
  /** direct-beam irradiance on a flat surface [W/m2], the API's `irradiance_wm2` (tau_default, no diffuse light) */
  irradianceWm2: number;
}

/** F13: sun elevation and azimuth (clockwise from north) at a point and instant; the shape of GET /sun. */
export function sunPosition(latDeg: number, lonEastDeg: number, utc: string | Date | number): SunState {
  const ms = parseUtcMs(utc);
  const mt = mars24(ms);
  const { lmstH, ltstH } = solarTime(lonEastDeg, mt);
  const H = 15.0 * (ltstH - 12.0) * RAD;
  const phi = latDeg * RAD;
  const dec = mt.declinationDeg * RAD;
  const sinE = Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H);
  const e = Math.asin(Math.max(-1, Math.min(1, sinE))) * DEG;
  const A = Math.atan2(-Math.cos(dec) * Math.sin(H), Math.sin(dec) * Math.cos(phi) - Math.cos(dec) * Math.cos(H) * Math.sin(phi)) * DEG;
  const sinElev = Math.sin(e * RAD);
  const irr = sinElev <= 0 ? 0 : (S0_1AU / mt.sunDistanceAu ** 2) * 1.0 * Math.exp(-TAU_DEFAULT / sinElev);
  return {
    utc: new Date(ms).toISOString().replace(/\.\d+Z$/, "Z"),
    msd: mt.msd,
    lsDeg: mt.lsDeg,
    lmstH,
    ltstH,
    elevationDeg: e,
    azimuthDeg: mod(A, 360.0),
    declinationDeg: mt.declinationDeg,
    sunDistanceAu: mt.sunDistanceAu,
    irradianceWm2: irr,
  };
}

/**
 * Mission sol at a longitude: local mean solar days (midnight to midnight) elapsed since the landing day (sol 0).
 * Python `mission_sol`; cross-checked against the public mission clock (Perseverance sol 2039 on 2026-11-14).
 */
export function missionSol(utc: string | Date | number, lonEastDeg: number, landingUtc: string | Date | number): number {
  const now = mars24(utc).msd + lonEastDeg / 360.0;
  const start = mars24(landingUtc).msd + lonEastDeg / 360.0;
  return Math.floor(now) - Math.floor(start);
}

// ----------------------------------------------------------------------------------------------------------- Kepler

/** Kepler's equation M = E - e sin E by Newton iteration (Danby start), E in radians. */
export function solveKepler(M: number, e: number, tol = 1e-12, maxIter = 30): number {
  const m = mod(M + Math.PI, 2 * Math.PI) - Math.PI;
  const s = Math.sin(m);
  let E = m + 0.85 * e * (s === 0 ? 1 : Math.sign(s));
  for (let i = 0; i < maxIter; i++) {
    const f = E - e * Math.sin(E) - m;
    E -= Math.max(-1, Math.min(1, f / (1.0 - e * Math.cos(E))));
    if (Math.abs(f) < tol) break;
  }
  return E;
}

// ------------------------------------------------------------------------------------------------- F52 light time
// JPL "Keplerian elements for approximate positions of the major planets", Table 1 (1800-2050), same rows as Python.
type KepRow = [number, number, number, number, number, number, number, number, number, number, number, number];
const EM_BARY: KepRow = [1.00000261, 0.00000562, 0.01671123, -0.00004392, -0.00001531, -0.01294668, 100.46457166, 35999.37244981, 102.93768193, 0.32327364, 0.0, 0.0];
const MARS: KepRow = [1.52371034, 0.00001847, 0.0933941, 0.00007882, 1.84969142, -0.00813131, -4.55343205, 19140.30268499, -23.94362959, 0.44441088, 49.55953891, -0.29257343];

function heliocentricEcliptic(el: KepRow, T: number): [number, number, number] {
  const a = el[0] + el[1] * T;
  const e = el[2] + el[3] * T;
  const inc = (el[4] + el[5] * T) * RAD;
  const L = el[6] + el[7] * T;
  const varpi = el[8] + el[9] * T;
  const Om = (el[10] + el[11] * T) * RAD;
  const omega = varpi * RAD - Om;
  const M = mod((L - varpi) * RAD + Math.PI, 2 * Math.PI) - Math.PI;
  const E = solveKepler(M, e);
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const co = Math.cos(Om), so = Math.sin(Om), cw = Math.cos(omega), sw = Math.sin(omega), ci = Math.cos(inc), si = Math.sin(inc);
  return [
    (cw * co - sw * so * ci) * xp + (-sw * co - cw * so * ci) * yp,
    (cw * so + sw * co * ci) * xp + (-sw * so + cw * co * ci) * yp,
    sw * si * xp + cw * si * yp,
  ];
}

/** Jd (TT) of a unix time in ms, with the leap-second offset of that date. */
function jdTtFromMs(ms: number): number {
  return 2440587.5 + ms / 1000 / 86400.0 + ttMinusUtc(ms) / 86400.0;
}

/** Earth (EM barycentre) to Mars distance [m] from approximate Keplerian elements (about 1 % level). */
export function earthMarsDistanceM(utc: string | Date | number): number {
  const ms = parseUtcMs(utc);
  const T = (jdTtFromMs(ms) - J2000_JD) / 36525.0;
  const m = heliocentricEcliptic(MARS, T);
  const e = heliocentricEcliptic(EM_BARY, T);
  return Math.hypot(m[0] - e[0], m[1] - e[1], m[2] - e[2]) * AU_M;
}

/** F52: one-way light time Earth to Mars [s] and the distance [m]. */
export function earthMarsLightTime(utc: string | Date | number): { distanceM: number; oneWayS: number } {
  const d = earthMarsDistanceM(utc);
  return { distanceM: d, oneWayS: d / C_LIGHT_MS };
}

// ---------------------------------------------------------------------------------------------------- F49 orbiters
export interface OrbitElements {
  a_m: number;
  e: number;
  i_deg: number;
  raan_deg: number;
  argp_deg: number;
  M0_deg: number;
  epoch_utc: string;
}

function marsRotationDeg(ms: number): number {
  const d = jdTtFromMs(ms) - J2000_JD;
  return mod(W0_DEG + WDOT_DEG_PER_DAY * d, 360.0);
}

function j2Rates(el: OrbitElements): [number, number, number] {
  const n = Math.sqrt(GM_MARS / el.a_m ** 3);
  const i = el.i_deg * RAD;
  const p = el.a_m * (1 - el.e ** 2);
  const k = n * J2_MARS * (R_SPHERE_M / p) ** 2;
  return [-1.5 * k * Math.cos(i), 0.75 * k * (5 * Math.cos(i) ** 2 - 1), 0.75 * k * Math.sqrt(1 - el.e ** 2) * (3 * Math.cos(i) ** 2 - 1)];
}

export interface OrbitPosition {
  latDeg: number;
  lonDeg: number;
  altM: number;
  xyzFixedM: [number, number, number];
}

/** F49: Mars-fixed position of an orbiter at a UTC instant (two-body + J2 secular drift; APPROXIMATE). */
export function orbitPosition(el: OrbitElements, utc: string | Date | number, j2 = true): OrbitPosition {
  const ms = parseUtcMs(utc);
  const dt = (ms - parseUtcMs(el.epoch_utc)) / 1000;
  const n = Math.sqrt(GM_MARS / el.a_m ** 3);
  const [rd, ad, md] = j2 ? j2Rates(el) : [0, 0, 0];
  const raan = el.raan_deg * RAD + rd * dt;
  const argp = el.argp_deg * RAD + ad * dt;
  const inc = el.i_deg * RAD;
  const E = solveKepler(el.M0_deg * RAD + (n + md) * dt, el.e);
  const xp = el.a_m * (Math.cos(E) - el.e);
  const yp = el.a_m * Math.sqrt(1 - el.e ** 2) * Math.sin(E);
  const co = Math.cos(raan), so = Math.sin(raan), cw = Math.cos(argp), sw = Math.sin(argp), ci = Math.cos(inc), si = Math.sin(inc);
  const x = (co * cw - so * sw * ci) * xp + (-co * sw - so * cw * ci) * yp;
  const y = (so * cw + co * sw * ci) * xp + (-so * sw + co * cw * ci) * yp;
  const z = sw * si * xp + cw * si * yp;
  const W = marsRotationDeg(ms) * RAD;
  const xb = Math.cos(W) * x + Math.sin(W) * y;
  const yb = -Math.sin(W) * x + Math.cos(W) * y;
  const r = Math.sqrt(x * x + y * y + z * z);
  return {
    latDeg: Math.asin(z / r) * DEG,
    lonDeg: mod(Math.atan2(yb, xb) * DEG + 180.0, 360.0) - 180.0,
    altM: r - R_SPHERE_M,
    xyzFixedM: [xb, yb, z],
  };
}
