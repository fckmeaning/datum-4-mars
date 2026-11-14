import { describe, expect, it } from "vitest";
import { earthMarsLightTime, mars24, missionSol, orbitPosition, solarTime, sunPosition, type OrbitElements } from "./marsTime";

/**
 * Reference values are printed by the Python reference (packages/marsnav sun + orbits, and the API /sun wrapper) for a site at
 * lat -4.5895, lon 137.4417 E. The TypeScript port must reproduce them (sub-microsecond differences only).
 */
const SITE = { lat: -4.5895, lon: 137.4417 };
type Ref = { msd: number; ls: number; eot: number; dec: number; r: number; lmst: number; ltst: number; elev: number; az: number; irr: number; lightS: number; distM: number };
const REF: Array<[string, Ref]> = [
  ["2026-11-14T08:31:31Z", { msd: 54342.89883281798, ls: 21.740886684046018, eot: -6.616093771357553, dec: 9.163986313332575, r: 1.6080374361743226, lmst: 6.734767631497903, ltst: 6.293694713407399, elev: 3.6032056667083463, az: 80.4943799374736, irr: 0.18452610229372607, lightS: 659.3562133148421, distM: 197670019887.22882 }],
  ["2012-08-06T05:17:57Z", { msd: 49269.24547000862, ls: 150.70291024034304, eot: 8.260555746216736, dec: 12.144306938401668, r: 1.5362446465567718, lmst: 15.054060206851661, ltst: 15.60476392326611, elev: 33.70875208570259, az: 287.8942371931913, irr: 234.23995752972624, lightS: 828.1873486560454, distM: 248284320938.09885 }],
  ["2021-02-18T20:55:00Z", { msd: 52304.45452619809, ls: 5.648514006068581, eot: -9.478855448912643, dec: 2.4257064461706004, r: 1.5712612413580287, lmst: 20.071408754084928, ltst: 19.439485057490753, elev: -21.70804080789594, az: 270.78746047045485, irr: 0.0, lightS: 682.2282651206318, distM: 204526888517.58987 }],
  ["2030-01-01T00:00:00Z", { msd: 55455.94459179669, ls: 252.81594041692188, eot: 1.406570236561352, dec: -24.23335834165428, r: 1.3814062554729527, lmst: 7.832983120447693, ltst: 7.926754469551783, elev: 28.173583501540534, az: 115.09517644731362, irr: 247.34222539509443, lightS: 1038.163548003343, distM: 311233601861.9232 }],
  ["2016-03-05T12:00:00Z", { msd: 50541.54750742294, ls: 118.18098870525091, eot: 5.778155332770939, dec: 22.256639992712003, r: 1.6129659525573403, lmst: 22.302958150497375, ltst: 22.688168506015437, elev: -64.02206152107395, az: 314.6460561192542, irr: 0.0, lightS: 515.6092569618667, distM: 154575766512.1516 }],
];
const ORBITERS: Record<string, OrbitElements> = {
  mro: {"a_m": 3683690.0, "e": 0.00882, "i_deg": 92.7, "raan_deg": 45.0, "argp_deg": 270.0, "M0_deg": 0.0, "epoch_utc": "2026-11-14T00:00:00Z"},
  odyssey: {"a_m": 3791190.0, "e": 0.0012, "i_deg": 93.1, "raan_deg": 110.0, "argp_deg": 0.0, "M0_deg": 0.0, "epoch_utc": "2026-11-14T00:00:00Z"},
  tgo: {"a_m": 3796190.0, "e": 0.001, "i_deg": 74.0, "raan_deg": 200.0, "argp_deg": 0.0, "M0_deg": 0.0, "epoch_utc": "2026-11-14T00:00:00Z"},
  maven: {"a_m": 5721190.0, "e": 0.380166, "i_deg": 75.0, "raan_deg": 280.0, "argp_deg": 120.0, "M0_deg": 45.0, "epoch_utc": "2026-11-14T00:00:00Z"},
  mex: {"a_m": 8596190.0, "e": 0.57002, "i_deg": 86.6, "raan_deg": 330.0, "argp_deg": 150.0, "M0_deg": 90.0, "epoch_utc": "2026-11-14T00:00:00Z"},
};
const ORB_REF: Array<[string, string, { lat: number; lon: number; alt: number }]> = [
  ["mro", "2026-11-14T08:31:31Z", { lat: 85.52992991873207, lon: -117.7289051886588, alt: 319833.7136256648 }],
  ["mro", "2026-11-20T00:00:00Z", { lat: -23.77854969820113, lon: -151.30319403963574, alt: 292958.88410190353 }],
  ["odyssey", "2026-11-14T08:31:31Z", { lat: 64.37967891844941, lon: -83.33933227684358, alt: 397079.22742176615 }],
  ["odyssey", "2026-11-20T00:00:00Z", { lat: -9.071090889934206, lon: -86.87567924770636, alt: 390767.09750175197 }],
  ["tgo", "2026-11-14T08:31:31Z", { lat: 61.88145892494772, lon: -33.48489003092914, alt: 401575.29328273097 }],
  ["tgo", "2026-11-20T00:00:00Z", { lat: -40.8099087185854, lon: -32.11149945677755, alt: 396522.3229711363 }],
  ["maven", "2026-11-14T08:31:31Z", { lat: -63.13972068289676, lon: -132.27314337314883, alt: 4463457.076190756 }],
  ["maven", "2026-11-20T00:00:00Z", { lat: -53.167315795051366, lon: 53.102867519370534, alt: 4416240.155880504 }],
  ["mex", "2026-11-14T08:31:31Z", { lat: -28.032154687538224, lon: -51.862658117396535, alt: 10087534.759454327 }],
  ["mex", "2026-11-20T00:00:00Z", { lat: -12.895395859424612, lon: 128.02928765956676, alt: 9017598.475409778 }],
];

describe("Mars24 port reproduces the Python reference", () => {
  for (const [utc, r] of REF) {
    it(`sun and Mars time at ${utc}`, () => {
      const mt = mars24(utc);
      expect(mt.msd).toBeCloseTo(r.msd, 7);
      expect(mt.lsDeg).toBeCloseTo(r.ls, 7);
      expect(mt.eotDeg).toBeCloseTo(r.eot, 7);
      expect(mt.declinationDeg).toBeCloseTo(r.dec, 7);
      expect(mt.sunDistanceAu).toBeCloseTo(r.r, 9);
      const t = solarTime(SITE.lon, mt);
      expect(t.lmstH).toBeCloseTo(r.lmst, 6);
      expect(t.ltstH).toBeCloseTo(r.ltst, 6);
      const s = sunPosition(SITE.lat, SITE.lon, utc);
      expect(s.elevationDeg).toBeCloseTo(r.elev, 6);
      expect(s.azimuthDeg).toBeCloseTo(r.az, 6);
      expect(s.irradianceWm2).toBeCloseTo(r.irr, 6);
    });
    it(`Earth-Mars light time at ${utc}`, () => {
      const l = earthMarsLightTime(utc);
      expect(l.oneWayS).toBeCloseTo(r.lightS, 5);
      expect(l.distanceM / r.distM).toBeCloseTo(1, 10);
    });
  }

  it("link delay is 659 s on 2026-11-14T08:31:31Z", () => {
    expect(Math.round(earthMarsLightTime("2026-11-14T08:31:31Z").oneWayS)).toBe(659);
  });

  it("Perseverance is on sol 2039 and Curiosity on sol 5074 (2026-11-14T08:31:31Z)", () => {
    expect(missionSol("2026-11-14T08:31:31Z", 77.4509, "2021-02-18T20:55:00Z")).toBe(2039);
    expect(missionSol("2026-11-14T08:31:31Z", 137.4417, "2012-08-06T05:17:57Z")).toBe(5074);
  });

  it("the landing instant is sol 0 and the sol advances after one Mars day", () => {
    expect(missionSol("2012-08-06T05:17:57Z", 137.4417, "2012-08-06T05:17:57Z")).toBe(0);
    const later = new Date(Date.parse("2012-08-06T05:17:57Z") + 1.0274912517 * 86400_000 * 3).toISOString();
    expect(missionSol(later, 137.4417, "2012-08-06T05:17:57Z")).toBe(3);
  });

  it("a timestamp without a zone is read as UTC and garbage throws", () => {
    expect(mars24("2026-11-14T08:31:31").msd).toBeCloseTo(mars24("2026-11-14T08:31:31Z").msd, 9);
    expect(() => mars24("not a time")).toThrow();
  });
});

describe("orbiter propagation reproduces the Python reference", () => {
  for (const [id, utc, r] of ORB_REF) {
    it(`${id} at ${utc}`, () => {
      const p = orbitPosition(ORBITERS[id]!, utc);
      expect(p.latDeg).toBeCloseTo(r.lat, 5);
      expect(p.lonDeg).toBeCloseTo(r.lon, 5);
      expect(p.altM).toBeCloseTo(r.alt, 1);
    });
  }
});
