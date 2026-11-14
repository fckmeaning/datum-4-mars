import { describe, it, expect } from "vitest";
import {
  SKY,
  airTempK,
  dateForLs,
  dateForLtst,
  dayLengthByLs,
  dayLengthH,
  earthAltAz,
  earthMarsLink,
  earthOverSol,
  mars24,
  meanDayLengthH,
  meanInsolationWm2,
  moonsAt,
  riseSet,
  skyAt,
  solarTime,
  sunAltAz,
  sunAltAzByFrame,
  sunDay,
} from "./marsSky";

/** value of `key` of section `section` of config/params.yaml */
async function yamlNum(section: string, key: string): Promise<number> {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const yaml = fs.readFileSync(path.resolve(__dirname, "../../../../config/params.yaml"), "utf8");
  const start = yaml.indexOf(`\n${section}:`);
  if (start < 0) throw new Error(`section ${section} not found`);
  const rest = yaml.slice(start + 1);
  const next = rest.slice(section.length + 1).search(/\n[a-z_]+:/);
  const body = next < 0 ? rest : rest.slice(0, section.length + 1 + next);
  const m = new RegExp(`\\b${key}:\\s*\\{ value: ([0-9.eE+-]+)`).exec(body);
  if (!m) throw new Error(`${section}.${key} not found`);
  return Number(m[1]);
}

const GALE = { lat: -4.5895, lon: 137.4416 };

describe("constants against config/params.yaml", () => {
  it("sky section", async () => {
    expect(SKY.pole_ra_deg).toBe(await yamlNum("sky", "mars_pole_ra_deg"));
    expect(SKY.pole_dec_deg).toBe(await yamlNum("sky", "mars_pole_dec_deg"));
    expect(SKY.obliquity_deg).toBe(await yamlNum("sky", "obliquity_deg"));
    expect(SKY.phobos_a_km).toBe(await yamlNum("sky", "phobos_a_km"));
    expect(SKY.deimos_a_km).toBe(await yamlNum("sky", "deimos_a_km"));
    expect(SKY.phobos_period_d).toBe(await yamlNum("sky", "phobos_period_d"));
    expect(SKY.deimos_period_d).toBe(await yamlNum("sky", "deimos_period_d"));
    expect(SKY.phobos_radius_km).toBe(await yamlNum("sky", "phobos_radius_km"));
    expect(SKY.deimos_radius_km).toBe(await yamlNum("sky", "deimos_radius_km"));
    expect(SKY.earth_mask_deg).toBe(await yamlNum("sky", "earth_mask_deg"));
    expect(SKY.t_peak_ltst_h).toBe(await yamlNum("sky", "t_peak_ltst_h"));
  });
  it("shared sections", async () => {
    expect(SKY.sol_s).toBe(await yamlNum("constants", "sol_seconds"));
    expect(SKY.s0_wm2).toBe(await yamlNum("constants", "S0_1au"));
    expect(SKY.r_mars_km * 1000).toBe(await yamlNum("constants", "R_sphere"));
    expect(SKY.w0_deg).toBe(await yamlNum("constants", "W0_deg"));
    expect(SKY.wdot_deg_per_day).toBe(await yamlNum("constants", "Wdot_deg_per_day"));
    expect(SKY.t_air_mean_k).toBe(await yamlNum("env", "T_air_default_K"));
    expect(SKY.t_air_amp_k).toBe(await yamlNum("env", "T_air_diurnal_amp_K"));
    expect(SKY.t_suit_min_k).toBe(await yamlNum("astronaut", "T_suit_min_K"));
    expect(SKY.t_suit_max_k).toBe(await yamlNum("astronaut", "T_suit_max_K"));
  });
});

// values printed by packages/marsnav/src/marsnav/sun (mars24, sun_position) and orbits (earth_mars_light_time)
const GOLDEN = [
  { utc: "2026-11-14T12:00:00Z", msd: 54343.0397392171, ls: 21.80868873316649, eot: -6.603144090967247, dec: 9.19140228512008, r: 1.608181203153416, el: 52.62521344231675, az: 68.34134790543591, lmst: 10.116514543846149, ltst: 9.676304937781666 },
  { utc: "2027-06-01T00:00:00Z", msd: 54536.22873199108, ls: 110.19679533898488, eot: 5.200342969645996, dec: 23.780163826601353, r: 1.6285499379796313, el: 37.79926843165112, az: 305.0448285612964, lmst: 14.652341119322825, ltst: 14.999030650632559 },
  { utc: "2030-01-01T06:00:00Z", msd: 55456.18790287071, ls: 252.97461692838897, eot: 1.3655163372360146, dec: -24.255307826762508, r: 1.3814160033245981, el: 57.83582615204434, az: 229.72054600689236, lmst: 13.67244223047224, ltst: 13.763476652954642 },
];

describe("Mars24 against the Python implementation", () => {
  for (const g of GOLDEN) {
    it(g.utc, () => {
      const ms = Date.parse(g.utc);
      const t = mars24(ms);
      expect(t.msd).toBeCloseTo(g.msd, 5);
      expect(t.lsDeg).toBeCloseTo(g.ls, 6);
      expect(t.eotDeg).toBeCloseTo(g.eot, 6);
      expect(t.declDeg).toBeCloseTo(g.dec, 6);
      expect(t.rAu).toBeCloseTo(g.r, 7);
      const st = solarTime(GALE.lon, t);
      expect(st.lmstH).toBeCloseTo(g.lmst, 6);
      expect(st.ltstH).toBeCloseTo(g.ltst, 6);
      const sun = sunAltAz(GALE.lat, t.declDeg, st.ltstH);
      expect(sun.elevationDeg).toBeCloseTo(g.el, 5);
      expect(sun.azimuthDeg).toBeCloseTo(g.az, 5);
    });
  }
});

describe("Earth in the sky", () => {
  it("the light time matches the F52 of the API", () => {
    expect(earthMarsLink(Date.parse("2026-11-14T12:00:00Z")).lightS).toBeCloseTo(658.7419699030986, 3);
  });

  it("the body-frame rotation puts the Sun where Mars24 does (frame check)", () => {
    for (const g of GOLDEN) {
      const ms = Date.parse(g.utc);
      const byFrame = sunAltAzByFrame(GALE.lat, GALE.lon, ms);
      // the IAU pole of params.yaml and the Mars24 clock agree to a degree or so
      expect(Math.abs(byFrame.elevationDeg - g.el)).toBeLessThan(1.5);
      const dAz = Math.abs(((byFrame.azimuthDeg - g.az + 540) % 360) - 180);
      expect(dAz).toBeLessThan(3);
    }
  });

  it("Earth rises and sets once a sol and the visible share is a sensible fraction", () => {
    const ms = Date.parse("2026-11-14T12:00:00Z");
    const pass = earthOverSol(GALE.lat, GALE.lon, ms);
    expect(pass.series.length).toBe(97);
    const above = pass.series.filter((p) => p.elevationDeg > 0).length;
    expect(above).toBeGreaterThan(20);
    expect(above).toBeLessThan(80);
    expect(pass.visibleFraction).toBeGreaterThan(0.2);
    expect(pass.visibleFraction).toBeLessThan(0.8);
    // the series is continuous: no jump of more than 12 deg between 15-minute samples
    for (let i = 1; i < pass.series.length; i++) expect(Math.abs(pass.series[i]!.elevationDeg - pass.series[i - 1]!.elevationDeg)).toBeLessThan(12);
  });

  it("the single-instant value agrees with the sol series", () => {
    const ms = Date.parse("2026-11-14T12:00:00Z");
    const now = earthAltAz(GALE.lat, GALE.lon, ms);
    const pass = earthOverSol(GALE.lat, GALE.lon, ms, 5, 96);
    const ltst = solarTime(GALE.lon, mars24(ms)).ltstH;
    const k = Math.round((ltst / 24) * 96);
    expect(Math.abs(pass.series[k]!.elevationDeg - now.elevationDeg)).toBeLessThan(3.5);
  });

  it("at the equator Earth passes near the zenith and near the nadir over a sol", () => {
    const ms = Date.parse("2026-11-14T12:00:00Z");
    const eq = earthOverSol(0, 0, ms).series.map((p) => p.elevationDeg);
    expect(Math.max(...eq)).toBeGreaterThan(60);
    expect(Math.min(...eq)).toBeLessThan(-60);
  });
});

describe("day curve and seasons", () => {
  it("day length at the equator is 12 h at the equinox, and sunrise and sunset are symmetric", () => {
    expect(dayLengthH(0, 0)).toBeCloseTo(12, 6);
    const rs = riseSet(-4.59, 9.19)!;
    expect(rs.riseH + rs.setH).toBeCloseTo(24, 9);
    expect(rs.setH - rs.riseH).toBeCloseTo(dayLengthH(-4.59, 9.19), 9);
  });
  it("polar day and night", () => {
    expect(dayLengthH(80, 24)).toBe(24);
    expect(dayLengthH(80, -24)).toBe(0);
    expect(riseSet(80, 24)).toBeNull();
  });
  it("the sun day curve peaks at local noon with the elevation 90 - |lat - dec|", () => {
    const d = sunDay(-4.5895, 9.19);
    const peak = d.reduce((a, b) => (b.elevationDeg > a.elevationDeg ? b : a));
    expect(peak.ltstH).toBeCloseTo(12, 6);
    expect(peak.elevationDeg).toBeCloseTo(90 - Math.abs(-4.5895 - 9.19), 2);
  });
  it("day length by Ls is flat for the equator and swings at high latitude", () => {
    const eq = dayLengthByLs(0);
    expect(eq.every((p) => Math.abs(p.dayH - 12) < 0.2)).toBe(true);
    const hi = dayLengthByLs(70);
    expect(Math.max(...hi.map((p) => p.dayH))).toBe(24);
    expect(Math.min(...hi.map((p) => p.dayH))).toBe(0);
    expect(meanDayLengthH(25)).toBeGreaterThan(11);
    expect(meanDayLengthH(25)).toBeLessThan(13);
  });
  it("dateForLs lands within a hundredth of a degree and dateForLtst on the asked hour", () => {
    const now = Date.parse("2026-11-14T12:00:00Z");
    for (const ls of [0, 90, 180, 270, 355]) {
      const ms = dateForLs(ls, now);
      const d = Math.abs(((mars24(ms).lsDeg - ls + 540) % 360) - 180);
      expect(d).toBeLessThan(0.02);
      expect(Math.abs(ms - now)).toBeLessThan(345 * 86_400_000);
    }
    const ms = dateForLtst(6, GALE.lon, now);
    expect(solarTime(GALE.lon, mars24(ms)).ltstH).toBeCloseTo(6, 2); // the equation of time moves a few seconds within the shift
  });
  it("air temperature peaks in the afternoon and stays inside the suit limits", () => {
    expect(airTempK(SKY.t_peak_ltst_h)).toBeCloseTo(SKY.t_air_mean_k + SKY.t_air_amp_k, 9);
    expect(airTempK(SKY.t_peak_ltst_h + 12)).toBeCloseTo(SKY.t_air_mean_k - SKY.t_air_amp_k, 9);
    expect(airTempK(2)).toBeGreaterThan(SKY.t_suit_min_k);
  });
});

describe("mean insolation", () => {
  it("is highest at the equator, falls towards the poles, and the area-weighted mean over the planet is a quarter of the mean solar constant", () => {
    const eq = meanInsolationWm2(0);
    expect(eq).toBeGreaterThan(170);
    expect(eq).toBeLessThan(195);
    expect(meanInsolationWm2(60)).toBeLessThan(eq);
    expect(meanInsolationWm2(85)).toBeLessThan(meanInsolationWm2(60));
    // sphere average: integral of S(lat) cos(lat) d lat / 2 = S_mean / 4
    let sum = 0;
    let w = 0;
    for (let lat = -89.5; lat <= 89.5; lat += 1) {
      const c = Math.cos((lat * Math.PI) / 180);
      sum += meanInsolationWm2(lat) * c;
      w += c;
    }
    const meanTsi = SKY.s0_wm2 / (SKY.a_mars_au * SKY.a_mars_au * Math.sqrt(1 - SKY.e_mars * SKY.e_mars));
    expect(sum / w).toBeGreaterThan((meanTsi / 4) * 0.97);
    expect(sum / w).toBeLessThan((meanTsi / 4) * 1.03);
  });
  it("is nearly symmetric between the hemispheres (the obliquity cycle is symmetric in Ls)", () => {
    expect(meanInsolationWm2(30)).toBeCloseTo(meanInsolationWm2(-30), 0);
  });
});

describe("Phobos and Deimos", () => {
  const [phobos, deimos] = moonsAt(0);
  it("Phobos is faster than the sol and rises in the west; Deimos rises in the east", () => {
    expect(phobos!.risesIn).toBe("west");
    expect(deimos!.risesIn).toBe("east");
  });
  it("synodic periods: about 11.1 h for Phobos and 5.5 days for Deimos", () => {
    expect(phobos!.synodicH).toBeCloseTo(11.1, 1);
    expect(deimos!.synodicH / 24).toBeCloseTo(5.52, 1);
  });
  it("Phobos is about 0.2 deg wide and smaller than the Sun at the zenith, Deimos far smaller", () => {
    expect(phobos!.diameterDeg).toBeCloseTo(0.213, 2);
    expect(deimos!.diameterDeg).toBeLessThan(0.05);
    expect(skyAt(0, 0, Date.parse("2026-11-14T12:00:00Z")).sunDiameterDeg).toBeGreaterThan(0.3);
  });
  it("at the equator both pass through the zenith; at high latitude Phobos stays low or below the horizon", () => {
    expect(phobos!.maxElevationDeg).toBeGreaterThan(89);
    expect(deimos!.maxElevationDeg).toBeGreaterThan(89);
    const high = moonsAt(80)[0]!;
    expect(high.track.length === 0 || high.maxElevationDeg < 20).toBe(true);
  });
  it("Phobos is up for a few hours of its 11.1 h cycle at the equator", () => {
    expect(phobos!.upH).toBeGreaterThan(3.5);
    expect(phobos!.upH).toBeLessThan(5);
  });
});

describe("snapshot", () => {
  it("combines everything for a site", () => {
    const s = skyAt(GALE.lat, GALE.lon, Date.parse("2026-11-14T12:00:00Z"));
    expect(s.sun.elevationDeg).toBeCloseTo(52.625, 2);
    expect(s.dayH).toBeGreaterThan(11);
    expect(s.riseSet).not.toBeNull();
    expect(s.moons.length).toBe(2);
    expect(s.earth.lightS).toBeGreaterThan(300);
  });
});
