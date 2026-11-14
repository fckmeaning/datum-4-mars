/**
 * Sky and sun of a Martian site: Mars time and season (Mars24, Allison and McEwen 2000, the same steps as
 * packages/marsnav/src/marsnav/sun/__init__.py F11-F13), the day curve of the Sun, the direction of Earth in the local sky
 * (approximate Keplerian elements of JPL, the same table as orbits F52, rotated into the Mars body frame with the IAU pole and
 * prime meridian of config/params.yaml) and the tracks of Phobos and Deimos (circular equatorial orbits, geometry only).
 *
 * Everything here is client-side math: no API is needed. The constants are copies of config/params.yaml (sections `sky`,
 * `constants`, `env`, `astronaut`); marsSky.test.ts compares them with the file and the results with the Python code.
 */

const DEG = Math.PI / 180;
const DAY_MS = 86_400_000;

export const SKY = {
  sol_s: 88775.244,
  s0_wm2: 1361.0,
  a_mars_au: 1.52371034,
  e_mars: 0.0933941,
  r_mars_km: 3396.19,
  w0_deg: 176.63,
  wdot_deg_per_day: 350.89198226,
  pole_ra_deg: 317.68143,
  pole_dec_deg: 52.8865,
  obliquity_deg: 23.43929111,
  phobos_a_km: 9376.0,
  deimos_a_km: 23463.2,
  phobos_period_d: 0.31891,
  deimos_period_d: 1.26244,
  phobos_radius_km: 11.1,
  deimos_radius_km: 6.2,
  earth_mask_deg: 5.0,
  t_peak_ltst_h: 14.0,
  t_air_mean_k: 215.0,
  t_air_amp_k: 35.0,
  t_suit_min_k: 173.0,
  t_suit_max_k: 303.0,
} as const;

/** Nominal solar radius [km] (IAU 2015 B3) and the astronomical unit [km]: for the apparent size of the Sun. */
const SUN_RADIUS_KM = 695_700;
const AU_KM = 149_597_870.7;
const MARS_SIDEREAL_SOL_D = 1.0274912517; // length of the Mars solar day in Earth days

// ---------------------------------------------------------------------------------------------------- Mars24

const LEAP: ReadonlyArray<readonly [number, number]> = [
  [Date.UTC(1999, 0, 1), 32],
  [Date.UTC(2006, 0, 1), 33],
  [Date.UTC(2009, 0, 1), 34],
  [Date.UTC(2012, 6, 1), 35],
  [Date.UTC(2015, 6, 1), 36],
  [Date.UTC(2017, 0, 1), 37],
];

const PBS: ReadonlyArray<readonly [number, number, number]> = [
  [0.0071, 2.2353, 49.409],
  [0.0057, 2.7543, 168.173],
  [0.0039, 1.1177, 191.837],
  [0.0037, 15.7866, 21.736],
  [0.0021, 2.1354, 15.704],
  [0.002, 2.4694, 95.528],
  [0.0018, 32.8493, 49.095],
];

function ttMinusUtcS(ms: number): number {
  let tai = 31;
  for (const [when, v] of LEAP) if (ms >= when) tai = v;
  return tai + 32.184;
}

/** Julian date (TT) of a UTC instant in Unix milliseconds. */
export function jdTT(ms: number): number {
  return 2440587.5 + ms / DAY_MS + ttMinusUtcS(ms) / 86400;
}

export interface MarsTime {
  /** Mars Sol Date */
  msd: number;
  /** Mars mean solar time at the prime meridian [h] */
  mstH: number;
  /** areocentric solar longitude, the season [deg] */
  lsDeg: number;
  /** equation of time [deg] (true minus mean solar time, in degrees of hour angle) */
  eotDeg: number;
  /** declination of the Sun [deg] */
  declDeg: number;
  /** distance Mars-Sun [AU] */
  rAu: number;
}

/** F11: Mars24 quantities for a UTC instant. */
export function mars24(ms: number): MarsTime {
  const jd = jdTT(ms);
  const d = jd - 2451545.0;
  const M = 19.3871 + 0.52402073 * d;
  const aFms = 270.3871 + 0.524038496 * d;
  let pbs = 0;
  for (const [A, tau, phi] of PBS) pbs += A * Math.cos((0.985626 * d) / tau * DEG + phi * DEG);
  const Mr = M * DEG;
  const nuM =
    (10.691 + 3.0e-7 * d) * Math.sin(Mr) + 0.623 * Math.sin(2 * Mr) + 0.05 * Math.sin(3 * Mr) + 0.005 * Math.sin(4 * Mr) + 0.0005 * Math.sin(5 * Mr) + pbs;
  const ls = (((aFms + nuM) % 360) + 360) % 360;
  const lr = ls * DEG;
  const eot = 2.861 * Math.sin(2 * lr) - 0.071 * Math.sin(4 * lr) + 0.002 * Math.sin(6 * lr) - nuM;
  const msd = (jd - 2451549.5) / MARS_SIDEREAL_SOL_D + 44796.0 - 0.0009626;
  const mstH = (((24 * msd) % 24) + 24) % 24;
  const decl = Math.asin(0.42565 * Math.sin(lr)) / DEG + 0.25 * Math.sin(lr);
  const rAu = 1.52367934 * (1.00436 - 0.09309 * Math.cos(Mr) - 0.004336 * Math.cos(2 * Mr) - 0.00031 * Math.cos(3 * Mr) - 0.00003 * Math.cos(4 * Mr));
  return { msd, mstH, lsDeg: ls, eotDeg: eot, declDeg: decl, rAu };
}

/** F12: local mean and true solar time [h] at an east longitude. */
export function solarTime(lonEastDeg: number, mt: MarsTime): { lmstH: number; ltstH: number } {
  const lmst = (((mt.mstH + lonEastDeg / 15) % 24) + 24) % 24;
  const ltst = (((lmst + mt.eotDeg / 15) % 24) + 24) % 24;
  return { lmstH: lmst, ltstH: ltst };
}

export interface AltAz {
  elevationDeg: number;
  azimuthDeg: number;
}

/** F13 core: elevation and azimuth (clockwise from north) of the Sun for a latitude, a declination and a local true solar time. */
export function sunAltAz(latDeg: number, declDeg: number, ltstH: number): AltAz {
  const H = 15 * (ltstH - 12) * DEG;
  const phi = latDeg * DEG;
  const dec = declDeg * DEG;
  const sinE = Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H);
  const e = Math.asin(Math.max(-1, Math.min(1, sinE))) / DEG;
  const A = Math.atan2(-Math.cos(dec) * Math.sin(H), Math.sin(dec) * Math.cos(phi) - Math.cos(dec) * Math.cos(H) * Math.sin(phi)) / DEG;
  return { elevationDeg: e, azimuthDeg: ((A % 360) + 360) % 360 };
}

/** Day length in local solar hours (the Sun's centre above the horizon): 0 in polar night, 24 in polar day. */
export function dayLengthH(latDeg: number, declDeg: number): number {
  const c = -Math.tan(latDeg * DEG) * Math.tan(declDeg * DEG);
  if (c >= 1) return 0;
  if (c <= -1) return 24;
  return (2 * Math.acos(c)) / DEG / 15;
}

/** Local true solar times of sunrise and sunset, null in polar day or night. */
export function riseSet(latDeg: number, declDeg: number): { riseH: number; setH: number } | null {
  const len = dayLengthH(latDeg, declDeg);
  if (len <= 0 || len >= 24) return null;
  return { riseH: 12 - len / 2, setH: 12 + len / 2 };
}

/** Sun elevation over one sol for a given declination: `steps + 1` samples from LTST 0 to 24 h. */
export function sunDay(latDeg: number, declDeg: number, steps = 96): Array<{ ltstH: number } & AltAz> {
  const out: Array<{ ltstH: number } & AltAz> = [];
  for (let k = 0; k <= steps; k++) {
    const ltstH = (24 * k) / steps;
    out.push({ ltstH, ...sunAltAz(latDeg, declDeg, ltstH) });
  }
  return out;
}

/** Day length against the season: Ls 0..360 in `stepDeg` steps. */
export function dayLengthByLs(latDeg: number, stepDeg = 10): Array<{ lsDeg: number; dayH: number; declDeg: number }> {
  const out: Array<{ lsDeg: number; dayH: number; declDeg: number }> = [];
  for (let ls = 0; ls <= 360 + 1e-9; ls += stepDeg) {
    const lr = ls * DEG;
    const decl = Math.asin(0.42565 * Math.sin(lr)) / DEG + 0.25 * Math.sin(lr);
    out.push({ lsDeg: ls, dayH: dayLengthH(latDeg, decl), declDeg: decl });
  }
  return out;
}

/** Mean day length over a whole Mars year [local solar hours]. */
export function meanDayLengthH(latDeg: number): number {
  const s = dayLengthByLs(latDeg, 5).slice(0, -1);
  // uniform in Ls overweights northern summer slightly (Mars moves slower at aphelion): good enough for a ranking
  return s.reduce((a, p) => a + p.dayH, 0) / s.length;
}

/**
 * Time-averaged daily insolation at the top of the atmosphere on flat ground [W/m2] at a latitude: no dust, no terrain.
 * Daily mean of cos(zenith) is (h0 sin(lat) sin(dec) + cos(lat) cos(dec) sin(h0)) / pi; the 1/r2 of the sunlight cancels the r2 of
 * Kepler's second law, so the average over the year is the mean over equal steps of Ls times S0 / (a2 sqrt(1 - e2)).
 */
export function meanInsolationWm2(latDeg: number): number {
  const phi = latDeg * DEG;
  let sum = 0;
  let n = 0;
  for (let ls = 0; ls < 360; ls += 2) {
    const lr = ls * DEG;
    const dec = Math.asin(0.42565 * Math.sin(lr)) + 0.25 * DEG * Math.sin(lr);
    const c = -Math.tan(phi) * Math.tan(dec);
    const h0 = c >= 1 ? 0 : c <= -1 ? Math.PI : Math.acos(c);
    sum += (h0 * Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.sin(h0)) / Math.PI;
    n++;
  }
  return (SKY.s0_wm2 / (SKY.a_mars_au * SKY.a_mars_au * Math.sqrt(1 - SKY.e_mars * SKY.e_mars))) * (sum / n);
}

function wrap180(d: number): number {
  return ((((d + 180) % 360) + 360) % 360) - 180;
}

/** The instant nearest to `fromMs` at which the season is `targetLs`. */
export function dateForLs(targetLs: number, fromMs: number): number {
  let ms = fromMs;
  for (let i = 0; i < 12; i++) {
    const d = wrap180(targetLs - mars24(ms).lsDeg);
    if (Math.abs(d) < 0.01) break;
    ms += (d / 0.5) * DAY_MS; // Mars moves 0.4 to 0.7 deg of Ls per day: a Newton step with the mean rate converges in a few rounds
  }
  return ms;
}

/** The instant at which the local true solar time is `ltstH`, in the sol around `ms` (shifts by less than half a sol). */
export function dateForLtst(ltstH: number, lonEastDeg: number, ms: number): number {
  const cur = solarTime(lonEastDeg, mars24(ms)).ltstH;
  let dh = ltstH - cur;
  if (dh > 12) dh -= 24;
  if (dh < -12) dh += 24;
  return ms + (dh / 24) * SKY.sol_s * 1000;
}

// --------------------------------------------------------------------------------------- planets, Earth in the sky

// (a [AU], a_dot, e, e_dot, I [deg], I_dot, L [deg], L_dot, varpi [deg], varpi_dot, Omega [deg], Omega_dot) per Julian century:
// the same table as packages/marsnav/src/marsnav/orbits/__init__.py (JPL, Keplerian elements for approximate positions, 1800-2050)
type Elements = readonly number[];
const EM_BARY: Elements = [1.00000261, 0.00000562, 0.01671123, -0.00004392, -0.00001531, -0.01294668, 100.46457166, 35999.37244981, 102.93768193, 0.32327364, 0.0, 0.0];
const MARS_EL: Elements = [1.52371034, 0.00001847, 0.0933941, 0.00007882, 1.84969142, -0.00813131, -4.55343205, 19140.30268499, -23.94362959, 0.44441088, 49.55953891, -0.29257343];

export type Vec3 = [number, number, number];

function solveKepler(M: number, e: number): number {
  let E = M + e * Math.sin(M);
  for (let i = 0; i < 20; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-12) break;
  }
  return E;
}

/** Heliocentric position [AU] in the J2000 ecliptic frame. */
function heliocentric(el: Elements, T: number): Vec3 {
  const g = (i: number) => el[i]! + el[i + 1]! * T;
  const a = g(0);
  const e = g(2);
  const inc = g(4) * DEG;
  const L = g(6);
  const varpi = g(8);
  const Om = g(10) * DEG;
  const omega = varpi * DEG - Om;
  const M = ((((L - varpi) * DEG + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  const E = solveKepler(M, e);
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const co = Math.cos(Om);
  const so = Math.sin(Om);
  const cw = Math.cos(omega);
  const sw = Math.sin(omega);
  const ci = Math.cos(inc);
  const si = Math.sin(inc);
  return [
    (cw * co - sw * so * ci) * xp + (-sw * co - cw * so * ci) * yp,
    (cw * so + sw * co * ci) * xp + (-sw * so + cw * co * ci) * yp,
    sw * si * xp + cw * si * yp,
  ];
}

function centuries(ms: number): number {
  return (jdTT(ms) - 2451545.0) / 36525;
}

/** Heliocentric positions of Earth (the Earth-Moon barycentre) and Mars [AU, ecliptic J2000]. */
export function earthMarsPositions(ms: number): { earth: Vec3; mars: Vec3 } {
  const T = centuries(ms);
  return { earth: heliocentric(EM_BARY, T), mars: heliocentric(MARS_EL, T) };
}

/** Distance Earth to Mars [km] and the one-way light time [s]: the same model as the API's F52. */
export function earthMarsLink(ms: number): { distanceKm: number; lightS: number } {
  const { earth, mars } = earthMarsPositions(ms);
  const d = Math.hypot(mars[0] - earth[0], mars[1] - earth[1], mars[2] - earth[2]) * AU_KM;
  return { distanceKm: d, lightS: d / 299_792.458 };
}

function eclipticToEquatorial(v: Vec3): Vec3 {
  const c = Math.cos(SKY.obliquity_deg * DEG);
  const s = Math.sin(SKY.obliquity_deg * DEG);
  return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c];
}

function rotZ(v: Vec3, deg: number): Vec3 {
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  return [c * v[0] + s * v[1], -s * v[0] + c * v[1], v[2]];
}
function rotX(v: Vec3, deg: number): Vec3 {
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  return [v[0], c * v[1] + s * v[2], -s * v[1] + c * v[2]];
}

/** Prime meridian angle W [deg] at a Julian date TT (IAU). */
function primeMeridianDeg(jd: number): number {
  return (SKY.w0_deg + SKY.wdot_deg_per_day * (jd - 2451545.0)) % 360;
}

/** A vector of the inertial equatorial frame in the Mars body-fixed frame at W. */
function toBody(vEq: Vec3, wDeg: number): Vec3 {
  return rotZ(rotX(rotZ(vEq, 90 + SKY.pole_ra_deg), 90 - SKY.pole_dec_deg), wDeg);
}

/** East, north and up unit vectors of a site in the body frame. */
function enu(latDeg: number, lonEastDeg: number): { e: Vec3; n: Vec3; u: Vec3 } {
  const p = latDeg * DEG;
  const l = lonEastDeg * DEG;
  return {
    e: [-Math.sin(l), Math.cos(l), 0],
    n: [-Math.sin(p) * Math.cos(l), -Math.sin(p) * Math.sin(l), Math.cos(p)],
    u: [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)],
  };
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function altAzOf(v: Vec3, frame: ReturnType<typeof enu>): AltAz {
  const n = Math.hypot(v[0], v[1], v[2]);
  const up = dot(v, frame.u) / n;
  return {
    elevationDeg: Math.asin(Math.max(-1, Math.min(1, up))) / DEG,
    azimuthDeg: ((Math.atan2(dot(v, frame.e), dot(v, frame.n)) / DEG) + 360) % 360,
  };
}

/** Direction from Mars to Earth (ICRF equatorial, not normalised) at a UTC instant. */
function earthDirEq(ms: number): Vec3 {
  const { earth, mars } = earthMarsPositions(ms);
  return eclipticToEquatorial([earth[0] - mars[0], earth[1] - mars[1], earth[2] - mars[2]]);
}

/** Direction from Mars to the Sun (ICRF equatorial). */
function sunDirEq(ms: number): Vec3 {
  const { mars } = earthMarsPositions(ms);
  return eclipticToEquatorial([-mars[0], -mars[1], -mars[2]]);
}

/** Where Earth stands in the sky of a site (parallax of the ground point is under 0.001 deg and ignored). */
export function earthAltAz(latDeg: number, lonEastDeg: number, ms: number): AltAz & { distanceKm: number; lightS: number } {
  const w = primeMeridianDeg(jdTT(ms));
  const body = toBody(earthDirEq(ms), w);
  return { ...altAzOf(body, enu(latDeg, lonEastDeg)), ...earthMarsLink(ms) };
}

/** Sun elevation by the same body-frame rotation as Earth: a cross-check of the frame against Mars24 (used by the tests). */
export function sunAltAzByFrame(latDeg: number, lonEastDeg: number, ms: number): AltAz {
  const w = primeMeridianDeg(jdTT(ms));
  return altAzOf(toBody(sunDirEq(ms), w), enu(latDeg, lonEastDeg));
}

export interface EarthPass {
  /** samples over one sol starting at LTST 0: local true solar time [h] and Earth elevation [deg] */
  series: Array<{ ltstH: number; elevationDeg: number }>;
  /** share of the sol with Earth above the mask, 0..1 */
  visibleFraction: number;
  /** hours of the sol with Earth above the mask */
  visibleH: number;
}

/** Elevation of Earth over the sol that contains `ms`, as a function of the local true solar time (Earth moves little within a sol). */
export function earthOverSol(latDeg: number, lonEastDeg: number, ms: number, maskDeg: number = SKY.earth_mask_deg, steps = 96): EarthPass {
  const mt = mars24(ms);
  const ltst0 = solarTime(lonEastDeg, mt).ltstH;
  const dirEq = earthDirEq(ms);
  const frame = enu(latDeg, lonEastDeg);
  const series: EarthPass["series"] = [];
  let up = 0;
  for (let k = 0; k <= steps; k++) {
    const ltstH = (24 * k) / steps;
    const dtSol = (ltstH - ltst0) / 24; // time offset in sols, wrapped to +-0.5
    const dt = ((((dtSol + 0.5) % 1) + 1) % 1) - 0.5;
    const t = ms + dt * SKY.sol_s * 1000;
    const alt = altAzOf(toBody(dirEq, primeMeridianDeg(jdTT(t))), frame).elevationDeg;
    series.push({ ltstH, elevationDeg: alt });
    if (k < steps && alt > maskDeg) up++;
  }
  return { series, visibleFraction: up / steps, visibleH: (up / steps) * 24 };
}

// ------------------------------------------------------------------------------------------------------- moons

export interface MoonInfo {
  id: "phobos" | "deimos";
  name: string;
  /** track in the sky of the site: the part of the orbit above the horizon */
  track: AltAz[];
  /** highest point of the track [deg] */
  maxElevationDeg: number;
  /** time between two meetings with the same sky position [Earth hours] */
  synodicH: number;
  /** hours above the horizon per rise */
  upH: number;
  /** rises in the "east" like the Sun (orbit slower than the sol) or in the "west" (faster) */
  risesIn: "east" | "west";
  /** apparent diameter at the zenith [deg] and the Sun's at distance rAu [deg] */
  diameterDeg: number;
}

function moonOf(id: "phobos" | "deimos", latDeg: number): MoonInfo {
  const a = id === "phobos" ? SKY.phobos_a_km : SKY.deimos_a_km;
  const P = id === "phobos" ? SKY.phobos_period_d : SKY.deimos_period_d;
  const r = id === "phobos" ? SKY.phobos_radius_km : SKY.deimos_radius_km;
  const R = SKY.r_mars_km;
  // the orbit is a circle in the equator plane; the site is at longitude 0 and the moon at body longitude nu
  const frame = enu(latDeg, 0);
  const site: Vec3 = [R * Math.cos(latDeg * DEG), 0, R * Math.sin(latDeg * DEG)];
  const track: AltAz[] = [];
  let maxEl = -90;
  let upDeg = 0;
  const n = 720;
  for (let k = 0; k < n; k++) {
    const nu = ((k / n) * 360 - 180) * DEG;
    const rel: Vec3 = [a * Math.cos(nu) - site[0], a * Math.sin(nu) - site[1], -site[2]];
    const p = altAzOf(rel, frame);
    if (p.elevationDeg > 0) {
      track.push(p);
      upDeg += 360 / n;
      maxEl = Math.max(maxEl, p.elevationDeg);
    }
  }
  const sol = MARS_SIDEREAL_SOL_D;
  const relRate = 1 / P - 1 / sol; // cycles per Earth day seen from the ground
  const synodicD = 1 / Math.abs(relRate);
  return {
    id,
    name: id === "phobos" ? "Phobos" : "Deimos",
    track,
    maxElevationDeg: maxEl,
    synodicH: synodicD * 24,
    upH: (upDeg / 360) * synodicD * 24,
    risesIn: relRate > 0 ? "west" : "east",
    diameterDeg: (2 * Math.atan(r / (a - R))) / DEG,
  };
}

export function moonsAt(latDeg: number): MoonInfo[] {
  return [moonOf("phobos", latDeg), moonOf("deimos", latDeg)];
}

/** Apparent diameter of the Sun [deg] at a distance in AU. */
export function sunDiameterDeg(rAu: number): number {
  return (2 * Math.atan(SUN_RADIUS_KM / (rAu * AU_KM))) / DEG;
}

// ---------------------------------------------------------------------------------------------- temperature

/** Air temperature [K] by local true solar time: a sinusoid around the mean (ASSUMPTION: REMS-order amplitude, peak early afternoon). */
export function airTempK(ltstH: number): number {
  return SKY.t_air_mean_k + SKY.t_air_amp_k * Math.cos(((ltstH - SKY.t_peak_ltst_h) / 24) * 2 * Math.PI);
}

// ---------------------------------------------------------------------------------------- one-shot snapshot

export interface SkySnapshot {
  ms: number;
  time: MarsTime;
  lmstH: number;
  ltstH: number;
  sun: AltAz;
  dayH: number;
  riseSet: { riseH: number; setH: number } | null;
  earth: AltAz & { distanceKm: number; lightS: number };
  earthSol: EarthPass;
  moons: MoonInfo[];
  sunDiameterDeg: number;
}

export function skyAt(latDeg: number, lonEastDeg: number, ms: number): SkySnapshot {
  const time = mars24(ms);
  const { lmstH, ltstH } = solarTime(lonEastDeg, time);
  return {
    ms,
    time,
    lmstH,
    ltstH,
    sun: sunAltAz(latDeg, time.declDeg, ltstH),
    dayH: dayLengthH(latDeg, time.declDeg),
    riseSet: riseSet(latDeg, time.declDeg),
    earth: earthAltAz(latDeg, lonEastDeg, ms),
    earthSol: earthOverSol(latDeg, lonEastDeg, ms),
    moons: moonsAt(latDeg),
    sunDiameterDeg: sunDiameterDeg(time.rAu),
  };
}
